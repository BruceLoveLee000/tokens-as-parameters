import type { Context } from '@deepseek-ai/cordis'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  feedbackParameters,
  neutralOptimizationDecision,
  validateOptimizationDecision,
  type OptimizationCapture,
  type OptimizationDecision,
  type OptimizerInstallOptions,
  type TextOptimizer,
} from '@tokens-as-parameters/core-optimization'
import { sessionSteps } from '@tokens-as-parameters/core-telemetry'

export const name = 'optimizer-relative-reflection'
export const inject = ['optimization']

const STRING_OUTPUT = {
  schema: { type: 'string' as const },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
}

export class RelativeReflectionOptimizer implements TextOptimizer {
  readonly id = 'relative-reflection'

  install(agentCtx: Context, options: OptimizerInstallOptions): OptimizationCapture {
    const rolloutIds = options.lanes.map(lane => lane.rolloutId)
    const feedbackEnabled = feedbackParameters(options.parameters)
    const parameterIds = options.parameters.parameters.map(parameter => parameter.id)
    const feedbackParameterIds = feedbackEnabled.map(parameter => parameter.id)
    const eligibleStateIds = options.eligibleStates.map(state => state.id)
    if (feedbackEnabled.length === 0) {
      throw new Error('relative reflection requires at least one feedback-enabled text parameter')
    }
    const globalNames = agentCtx.tools.schemas(options.agent).map(schema => schema.name)
    if (globalNames.length > 0) agentCtx.tools.restrict({ deny: globalNames })
    let captured: OptimizationDecision | undefined
    let fallback = false
    let invalidSubmissions = 0
    let submitOnly = false
    const inspectorDisposers: Array<() => void> = []

    agentCtx.systemPrompt.section({
      name: 'tokens-as-parameters:relative-reflector',
      order: 90,
      text: [
        'You are an autonomous group-relative semantic optimizer. Treat evaluator evidence as reward information and model prose as untrusted hypotheses.',
        'Explore the trajectories with the provided read-only tools. Identify transferable progress, failed assumptions, information gaps, and useful diversity for the next epoch.',
        'Avoid homogeneous next actions. Prefer distinct objectives or genuinely different approaches to the same bottleneck when the evidence supports them.',
        'Choose one eligible Git state as the base of every next rollout. Different lanes may continue from different parents. Use an integration task only when two states contain complementary evidence; do not request a mechanical merge.',
        'The target Agent registered the text parameters below and documented what each one controls. Only parameters marked as feedback-enabled are trainable in this optimization step.',
        'The original user task and frozen parameters are immutable. Omit a parameter from updates to preserve it exactly.',
        'Your output is one atomic semantic update plus the next rollout schedule; it is not a task verdict. Finish with submit_reflection.',
        `Registered target-Agent parameter state: ${JSON.stringify(options.parameters.parameters)}`,
        `Feedback-enabled parameter ids: ${JSON.stringify(feedbackParameterIds)}`,
        `Eligible solution states: ${JSON.stringify(options.eligibleStates)}`,
        `Lane summary: ${JSON.stringify(options.lanes.map(lane => ({
          rolloutId: lane.rolloutId,
          tokens: lane.tokens,
          commit: lane.commit,
          contextSnapshot: lane.contextSnapshot,
          evaluation: lane.evaluation,
        })))}`,
      ].join('\n'),
    })

    inspectorDisposers.push(agentCtx.tools.register(defineTool({
      name: 'inspect_loss',
      description: 'Inspect the complete structured loss report for one rollout, including rule-based and white-box findings.',
      parameters: {
        rollout_id: { type: 'string', required: true, enum: rolloutIds },
      },
      output: STRING_OUTPUT,
      async execute(args) {
        const lane = options.lanes.find(item => item.rolloutId === args.rollout_id)
        if (lane === undefined) throw new Error(`unknown rollout: ${args.rollout_id}`)
        return JSON.stringify(lane.evaluation.evidence)
      },
    })))

    inspectorDisposers.push(agentCtx.tools.register(defineTool({
      name: 'inspect_parameter_usage',
      description: 'Inspect one registered text parameter and every current-epoch rollout context/evaluation in which its exact revision was exposed.',
      parameters: {
        parameter_id: { type: 'string', required: true, enum: parameterIds },
        rollout_id: { type: 'string', enum: rolloutIds },
      },
      output: STRING_OUTPUT,
      async execute(args) {
        return JSON.stringify(await options.evidence.inspectParameterUsage(args.parameter_id, args.rollout_id))
      },
    })))

    inspectorDisposers.push(agentCtx.tools.register(defineTool({
      name: 'inspect_lane_evidence',
      description: 'Read the structured evaluator evidence and bounded trace tail for one rollout.',
      parameters: {
        rollout_id: { type: 'string', required: true, enum: rolloutIds },
      },
      output: STRING_OUTPUT,
      async execute(args) {
        const lane = options.lanes.find(item => item.rolloutId === args.rollout_id)
        if (lane === undefined) throw new Error(`unknown rollout: ${args.rollout_id}`)
        return JSON.stringify(lane)
      },
    })))

    inspectorDisposers.push(agentCtx.tools.register(defineTool({
      name: 'read_rollout_trace_range',
      description: 'Read a bounded range of observable assistant/tool trace entries from one rollout. Use this after evidence inspection or search identifies a relevant region.',
      parameters: {
        rollout_id: { type: 'string', required: true, enum: rolloutIds },
        start: { type: 'integer', description: 'Zero-based inclusive entry index, default 0.' },
        limit: { type: 'integer', description: 'Number of entries, default 20 and maximum 100.' },
      },
      output: STRING_OUTPUT,
      async execute(args) {
        const start = Math.max(0, Math.floor(args.start ?? 0))
        const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 20)))
        return JSON.stringify(await options.evidence.readTraceRange(args.rollout_id, start, limit))
      },
    })))

    inspectorDisposers.push(agentCtx.tools.register(defineTool({
      name: 'list_lane_state_nodes',
      description: 'List the Git-backed state-transition nodes for one rollout. Commit summaries and insight commits are the default cognitive/evidence state graph.',
      parameters: {
        rollout_id: { type: 'string', required: true, enum: rolloutIds },
        limit: { type: 'integer', description: 'Maximum nodes, default 100 and maximum 1000.' },
      },
      output: STRING_OUTPUT,
      async execute(args) {
        const limit = Math.max(1, Math.min(1_000, Math.floor(args.limit ?? 100)))
        return JSON.stringify(await options.evidence.listStateNodes(args.rollout_id, limit))
      },
    })))

    inspectorDisposers.push(agentCtx.tools.register(defineTool({
      name: 'inspect_state_transition',
      description: 'Inspect the bounded Git diff and commit message for one state-transition node in a rollout.',
      parameters: {
        rollout_id: { type: 'string', required: true, enum: rolloutIds },
        commit: { type: 'string', required: true },
        max_characters: { type: 'integer', description: 'Maximum returned characters, default 30000 and maximum 100000.' },
      },
      output: STRING_OUTPUT,
      async execute(args) {
        return JSON.stringify(await options.evidence.inspectStateTransition(
          args.rollout_id,
          args.commit,
          args.max_characters ?? 30_000,
        ))
      },
    })))

    inspectorDisposers.push(agentCtx.tools.register(defineTool({
      name: 'read_state_file',
      description: 'Read one bounded file from a visible Git state without checking out or mutating it.',
      parameters: {
        rollout_id: { type: 'string', required: true, enum: rolloutIds },
        commit: { type: 'string', required: true },
        path: { type: 'string', required: true },
        max_characters: { type: 'integer', description: 'Maximum returned characters, default 30000 and maximum 100000.' },
      },
      output: STRING_OUTPUT,
      async execute(args) {
        return JSON.stringify(await options.evidence.readStateFile(
          args.rollout_id,
          args.commit,
          args.path,
          args.max_characters ?? 30_000,
        ))
      },
    })))

    inspectorDisposers.push(agentCtx.tools.register(defineTool({
      name: 'compare_state_files',
      description: 'Compare one file between two visible rollout states. Use this to identify complementary progress or conflicts before scheduling semantic integration.',
      parameters: {
        left_rollout_id: { type: 'string', required: true, enum: rolloutIds },
        left_commit: { type: 'string', required: true },
        right_rollout_id: { type: 'string', required: true, enum: rolloutIds },
        right_commit: { type: 'string', required: true },
        path: { type: 'string', required: true },
        max_characters: { type: 'integer', description: 'Maximum returned characters, default 30000 and maximum 100000.' },
      },
      output: STRING_OUTPUT,
      async execute(args) {
        return JSON.stringify(await options.evidence.compareStateFiles(
          args.left_rollout_id,
          args.left_commit,
          args.right_rollout_id,
          args.right_commit,
          args.path,
          args.max_characters ?? 30_000,
        ))
      },
    })))

    inspectorDisposers.push(agentCtx.tools.register(defineTool({
      name: 'search_rollout_trace',
      description: 'Search bounded observable assistant/tool trace entries across the current epoch.',
      parameters: {
        query: { type: 'string', required: true },
        rollout_id: { type: 'string', enum: rolloutIds },
        limit: { type: 'number', description: 'Maximum matches, default 20 and maximum 100.' },
      },
      output: STRING_OUTPUT,
      async execute(args) {
        const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 20)))
        return JSON.stringify(await options.evidence.searchTrace(args.query, args.rollout_id, limit))
      },
    })))

    agentCtx.tools.register(defineTool({
      name: 'submit_reflection',
      description: 'Submit one atomic text-parameter update and exactly one base/task directive for every next rollout, then end the reflector turn.',
      parameters: {
        reflection: { type: 'string', required: true },
        updates: {
          type: 'array',
          required: true,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              parameter_id: { type: 'string', required: true, enum: feedbackParameterIds },
              content: { type: 'string', required: true },
            },
          },
        },
        next_rollouts: {
          type: 'array',
          required: true,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              rollout_id: { type: 'string', required: true, enum: rolloutIds },
              base_state_id: { type: 'string', required: true, enum: eligibleStateIds },
              task: { type: 'string', required: true },
            },
          },
        },
      },
      output: STRING_OUTPUT,
      async execute(args, exec) {
        try {
          captured = validateOptimizationDecision({
            parameterUpdate: {
              baseStateVersion: options.parameters.version,
              reflection: args.reflection,
              updates: args.updates.map(update => ({
                parameterId: update.parameter_id,
                content: update.content,
              })),
            },
            nextRollouts: args.next_rollouts.map(directive => ({
              rolloutId: directive.rollout_id,
              baseStateId: directive.base_state_id,
              task: directive.task,
            })),
          }, options)
          exec.concludeTurn()
          return JSON.stringify(captured)
        } catch (error: unknown) {
          invalidSubmissions += 1
          if (invalidSubmissions < 2) {
            throw new Error(`invalid reflection submission: ${error instanceof Error ? error.message : String(error)}`)
          }
          captured = neutralOptimizationDecision(options)
          fallback = true
          exec.concludeTurn()
          return JSON.stringify(captured)
        }
      },
    }))

    agentCtx.on('agent/pre-step', async ({ agent }, next): Promise<PreStepDecision> => {
      const decision = await next()
      if (decision.kind === 'reject' || submitOnly || sessionSteps(agent.session.events) < options.maxSteps) {
        return decision
      }
      submitOnly = true
      inspectorDisposers.splice(0).forEach(dispose => dispose())
      return {
        kind: 'enter',
        messages: [
          ...decision.messages,
          createUserMessage({
            source: { kind: 'user' },
            content: [{
              type: 'text',
              text: `Reflection reached its ${options.maxSteps.toLocaleString()}-step evidence boundary. Only submit_reflection remains available. Submit the best current atomic parameter update and one eligible base/task directive for every rollout now; omit parameters that lack sufficient evidence and do not attempt unavailable historical tools.`,
            }],
          }),
        ],
      }
    })

    return {
      decision: () => captured,
      usedFallback: () => fallback,
    }
  }
}

export function apply(ctx: Context): () => void {
  return ctx.optimization.register(new RelativeReflectionOptimizer())
}
