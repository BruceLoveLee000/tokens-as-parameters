import type { Context } from '@deepseek-ai/cordis'
import { Service } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  neutralReflectionPlan,
  validateReflectionPlan,
  type LaneEvidence,
  type ReflectionPlan,
  type TraceEntry,
} from './contracts.js'
import type { GitState, GitStateNode } from './git-state.js'
import { sessionTokens } from './session-utils.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    proofReflection: RelativeReflectionService
  }
}

const STRING_OUTPUT = {
  schema: { type: 'string' as const },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
}

export interface ReflectionRoleOptions {
  agent: Agent
  lanes: LaneEvidence[]
  laneTraces: ReadonlyMap<string, readonly TraceEntry[]>
  laneWorktrees: ReadonlyMap<string, string>
  laneStateNodes: ReadonlyMap<string, readonly GitStateNode[]>
  git: GitState
  softTokenBudget: number
}

export interface ReflectionCapture {
  plan(): ReflectionPlan | undefined
  usedFallback(): boolean
}

export default class RelativeReflectionService extends Service {
  static inject = ['tools', 'systemPrompt']

  constructor(ctx: Context) {
    super(ctx, 'proofReflection')
  }

  install(agentCtx: Context, options: ReflectionRoleOptions): ReflectionCapture {
    const rolloutIds = options.lanes.map(lane => lane.rolloutId)
    const globalNames = agentCtx.tools.schemas(options.agent).map(schema => schema.name)
    if (globalNames.length > 0) agentCtx.tools.restrict({ deny: globalNames })
    let captured: ReflectionPlan | undefined
    let fallback = false
    let invalidSubmissions = 0
    let submitOnly = false
    const inspectorDisposers: Array<() => void> = []

    agentCtx.systemPrompt.section({
      name: 'tokens-as-parameters:relative-reflector',
      order: 90,
      text: [
        'You are an autonomous comparative-reflection agent. Treat checker receipts as reward evidence and model prose as untrusted hypotheses.',
        'Explore the lane evidence with the provided read-only tools. Identify transferable progress, failed assumptions, information gaps, and useful diversity for the next epoch.',
        'Do not force different theorem assignments. Prefer non-homogeneous next routes: either different obligations or genuinely different approaches to the same bottleneck.',
        'Your output is a directional textual update, not a proof verdict. Finish with submit_reflection.',
        `Lane summary: ${JSON.stringify(options.lanes.map(lane => ({
          rolloutId: lane.rolloutId,
          route: lane.route,
          tokens: lane.tokens,
          commit: lane.commit,
          closed: lane.receipt.closedObligations,
          open: lane.receipt.openObligations,
          findings: lane.receipt.findings,
          stateNodes: (options.laneStateNodes.get(lane.rolloutId) ?? []).slice(0, 100),
        })))}`,
      ].join('\n'),
    })

    inspectorDisposers.push(agentCtx.tools.register(defineTool({
      name: 'inspect_lane_evidence',
      description: 'Read the structured checker receipt and bounded trace tail for one rollout.',
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
        const trace = options.laneTraces.get(args.rollout_id) ?? []
        const start = Math.max(0, Math.min(trace.length, Math.floor(args.start ?? 0)))
        const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 20)))
        return JSON.stringify({
          rolloutId: args.rollout_id,
          totalEntries: trace.length,
          start,
          entries: trace.slice(start, start + limit),
        })
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
      async execute(args, exec) {
        const worktree = options.laneWorktrees.get(args.rollout_id)
        if (worktree === undefined) throw new Error(`unknown rollout: ${args.rollout_id}`)
        const limit = Math.max(1, Math.min(1_000, Math.floor(args.limit ?? 100)))
        const nodes = (options.laneStateNodes.get(args.rollout_id) ?? []).slice(0, limit)
        return JSON.stringify(nodes)
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
      async execute(args, exec) {
        const worktree = options.laneWorktrees.get(args.rollout_id)
        if (worktree === undefined) throw new Error(`unknown rollout: ${args.rollout_id}`)
        const nodes = options.laneStateNodes.get(args.rollout_id) ?? []
        if (!nodes.some(node => node.commit === args.commit)) {
          throw new Error(`commit is not a visible state node for ${args.rollout_id}`)
        }
        const trace = options.laneTraces.get(args.rollout_id) ?? []
        const anchor = trace.findIndex(entry => entry.text.includes(args.commit))
        const start = anchor < 0 ? Math.max(0, trace.length - 8) : Math.max(0, anchor - 4)
        return JSON.stringify({
          rolloutId: args.rollout_id,
          commit: args.commit,
          git: await options.git.inspectTransition(
            worktree,
            args.commit,
            args.max_characters ?? 30_000,
            exec.signal,
          ),
          traceStart: start,
          traceContext: trace.slice(start, start + 9),
        })
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
        const query = args.query.toLocaleLowerCase()
        const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 20)))
        const matches = options.lanes
          .filter(lane => args.rollout_id === undefined || lane.rolloutId === args.rollout_id)
          .flatMap(lane => (options.laneTraces.get(lane.rolloutId) ?? []).map((entry, index) => ({
            rolloutId: lane.rolloutId,
            index,
            ...entry,
          })))
          .filter(entry => entry.text.toLocaleLowerCase().includes(query))
          .slice(0, limit)
        return JSON.stringify(matches)
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
          captured = validateReflectionPlan(args, rolloutIds)
          exec.concludeTurn()
          return JSON.stringify(captured)
        } catch (error: unknown) {
          invalidSubmissions += 1
          if (invalidSubmissions < 2) {
            throw new Error(`invalid reflection submission: ${error instanceof Error ? error.message : String(error)}`)
          }
          captured = neutralReflectionPlan(rolloutIds)
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
