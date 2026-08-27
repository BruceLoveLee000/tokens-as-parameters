import type { Context } from '@deepseek-ai/cordis'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  neutralOptimizationPlan,
  validateOptimizationPlan,
  type OptimizationCapture,
  type OptimizerInstallOptions,
  type TokenOptimizer,
} from '@tokens-as-parameters/core-optimization'
import { sessionTokens } from '@tokens-as-parameters/core-telemetry'

export const name = 'optimizer-relative-reflection'
export const inject = ['optimization']

const STRING_OUTPUT = {
  schema: { type: 'string' as const },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
}

export class RelativeReflectionOptimizer implements TokenOptimizer {
  readonly id = 'relative-reflection'

  install(agentCtx: Context, options: OptimizerInstallOptions): OptimizationCapture {
    const rolloutIds = options.lanes.map(lane => lane.rolloutId)
    const globalNames = agentCtx.tools.schemas(options.agent).map(schema => schema.name)
    if (globalNames.length > 0) agentCtx.tools.restrict({ deny: globalNames })
    let captured: ReturnType<typeof validateOptimizationPlan> | undefined
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
        'Avoid homogeneous routes. Prefer distinct objectives or genuinely different approaches to the same bottleneck when the evidence supports them.',
        'Your output updates textual parameters; it is not a task verdict. Finish with submit_reflection.',
        `Current parameter set: ${JSON.stringify(options.parameters)}`,
        `Lane summary: ${JSON.stringify(options.lanes.map(lane => ({
          rolloutId: lane.rolloutId,
          route: lane.route,
          tokens: lane.tokens,
          commit: lane.commit,
          evaluation: lane.evaluation,
        })))}`,
      ].join('\n'),
    })

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
      description: 'Submit one comparative update covering every rollout exactly once and end the reflector turn.',
      parameters: {
        reflection: { type: 'string' },
        commonPrompt: { type: 'string' },
        routes: { type: 'array', items: { type: 'json' } },
      },
      output: STRING_OUTPUT,
      async execute(args, exec) {
        try {
          captured = validateOptimizationPlan(args, rolloutIds)
          exec.concludeTurn()
          return JSON.stringify(captured)
        } catch (error: unknown) {
          invalidSubmissions += 1
          if (invalidSubmissions < 2) {
            throw new Error(`invalid reflection submission: ${error instanceof Error ? error.message : String(error)}`)
          }
          captured = neutralOptimizationPlan(rolloutIds)
          fallback = true
          exec.concludeTurn()
          return JSON.stringify(captured)
        }
      },
    }))

    agentCtx.on('agent/pre-step', async ({ agent }, next): Promise<PreStepDecision> => {
      const decision = await next()
      if (decision.kind === 'reject' || submitOnly || sessionTokens(agent.session.events) <= options.softTokenBudget) {
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
              text: `Reflection evidence gathering exceeded the ${options.softTokenBudget.toLocaleString()} token soft boundary. Only submit_reflection remains available. Submit the best current directional update now; do not attempt unavailable historical tools.`,
            }],
          }),
        ],
      }
    })

    return {
      plan: () => captured,
      usedFallback: () => fallback,
    }
  }
}

export function apply(ctx: Context): () => void {
  return ctx.optimization.register(new RelativeReflectionOptimizer())
}
