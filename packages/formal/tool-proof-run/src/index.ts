import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@tokens-as-parameters/proof-runtime'

export const name = 'tokens-as-parameters-proof-run-tools'
export const inject = ['agents', 'proofRuns', 'tools', 'systemPrompt']

const STRING_OUTPUT = {
  schema: { type: 'string' as const },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
}

function requireAgent(agent: Agent | undefined): Agent {
  if (agent === undefined) throw new Error('proof run controls require an initiating DSH agent')
  return agent
}

export function apply(ctx: Context): void {
  ctx.systemPrompt.section({
    name: 'tokens-as-parameters:proof-run-controls',
    order: 116,
    text: [
      'Formal proof runs are experiment-only durable background jobs controlled by chip_proof, chip_proof_cases, proof_run_status, proof_run_list, and proof_run_stop.',
      'When the user writes /chip_proof <case-id>, call chip_proof with that exact registered case id. Never substitute an arbitrary workspace path.',
      'Do not claim a proof from a prover message. Only a terminal PROVED snapshot with a controller-owned Lean receipt is accepted.',
      'Starting an experiment materializes the immutable repository case into a Run-owned Git workspace, then creates independent DSH sessions for prover lanes, reflection, and white-box review. Report the runId immediately so the user can inspect it later.',
    ].join('\n'),
  })

  ctx.tools.register(defineTool({
    name: 'chip_proof',
    description: 'Start one background verifier-guided experiment from a registered immutable benchmark case.',
    parameters: {
      case_id: { type: 'string', required: true, description: 'Exact case id returned by chip_proof_cases.' },
      provider: { type: 'string', description: 'DSH model provider, default deepseek-official.' },
      model: { type: 'string', description: 'Model id, default deepseek-v4-flash.' },
      optimizer: { type: 'string', description: 'Registered token Optimizer id, default relative-reflection.' },
      verifier: { type: 'string', description: 'Registered proof Verifier id, default lean.' },
      rollouts: { type: 'integer', description: 'Parallel search lanes, default 2.' },
      max_parallel: { type: 'integer', description: 'Maximum simultaneously active prover lanes.' },
      max_output_tokens: { type: 'integer', description: 'Per-request output cap, default 64000.' },
      max_lane_tokens: { type: 'integer', description: 'Per-lane cumulative token cap, default 20000000.' },
      total_token_budget: { type: 'integer', description: 'Whole-run token cap, default 300000000.' },
      max_wall_time_seconds: { type: 'integer', description: 'Whole-run wall-time cap, default 43200.' },
      feedback_memory: { type: 'boolean', description: 'Allow reflection to update shared verifier-backed task memory, default true.' },
      feedback_plan: { type: 'boolean', description: 'Allow reflection to update the shared proof-search plan, default true.' },
      feedback_routes: { type: 'boolean', description: 'Allow reflection to update lane-specific search assignments, default true.' },
      reflection_enabled: { type: 'boolean', description: 'Enable group-relative reflection, default true.' },
      reflection_soft_tokens: { type: 'integer', description: 'Switch a reflector to submit-only after this cumulative token count.' },
      whitebox_review: { type: 'boolean', description: 'Require model white-box veto review after deterministic final acceptance.' },
    },
    output: STRING_OUTPUT,
    async execute(args, exec) {
      const active = (await ctx.proofRuns.list()).filter(run => !['PROVED', 'DISPROVED', 'UNKNOWN', 'ABORTED', 'FAILED'].includes(run.state))
      if (active.length > 0) {
        throw new Error(`a proof run is already active: ${active.map(run => run.runId).join(', ')}`)
      }
      const search = {
        ...(args.provider === undefined ? {} : { provider: args.provider }),
        ...(args.model === undefined ? {} : { model: args.model }),
        ...(args.optimizer === undefined ? {} : { optimizer: args.optimizer }),
        ...(args.verifier === undefined ? {} : { verifier: args.verifier }),
        ...(args.rollouts === undefined ? {} : { rollouts: args.rollouts }),
        ...(args.max_parallel === undefined ? {} : { maxParallel: args.max_parallel }),
        ...(args.max_output_tokens === undefined ? {} : { maxOutputTokensPerRequest: args.max_output_tokens }),
        ...(args.max_lane_tokens === undefined ? {} : { maxCumulativeTokensPerLane: args.max_lane_tokens }),
        ...(args.total_token_budget === undefined ? {} : { totalTokenBudget: args.total_token_budget }),
        ...(args.max_wall_time_seconds === undefined ? {} : { maxWallTimeSeconds: args.max_wall_time_seconds }),
        ...(args.whitebox_review === undefined ? {} : { whiteboxReview: args.whitebox_review }),
        parameterFeedback: {
          ...(args.feedback_memory === undefined ? {} : { memory: args.feedback_memory }),
          ...(args.feedback_plan === undefined ? {} : { plan: args.feedback_plan }),
          ...(args.feedback_routes === undefined ? {} : { routes: args.feedback_routes }),
        },
        reflection: {
          ...(args.reflection_enabled === undefined ? {} : { enabled: args.reflection_enabled }),
          ...(args.reflection_soft_tokens === undefined ? {} : { softTokenBudget: args.reflection_soft_tokens }),
        },
      }
      const snapshot = await ctx.proofRuns.startExperiment({
        caseId: args.case_id,
        search,
      }, requireAgent(exec.agent))
      return JSON.stringify(snapshot)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'chip_proof_cases',
    description: 'List immutable benchmark cases available to the experiment-only formal-proof runtime.',
    parameters: {},
    output: STRING_OUTPUT,
    async execute() {
      return JSON.stringify(await ctx.proofRuns.listExperimentCases())
    },
  }))

  ctx.tools.register(defineTool({
    name: 'proof_run_status',
    description: 'Read the latest durable snapshot for one formal-proof run.',
    parameters: {
      run_id: { type: 'string', required: true },
    },
    output: STRING_OUTPUT,
    async execute(args) {
      const snapshot = await ctx.proofRuns.get(args.run_id)
      if (snapshot === undefined) throw new Error(`unknown proof run: ${args.run_id}`)
      return JSON.stringify(snapshot)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'proof_run_list',
    description: 'List formal-proof runs known to this DSH process.',
    parameters: {},
    output: STRING_OUTPUT,
    async execute() {
      return JSON.stringify(await ctx.proofRuns.list())
    },
  }))

  ctx.tools.register(defineTool({
    name: 'proof_run_stop',
    description: 'Cancel one active formal-proof run and preserve its sessions, Git commits, receipts, and event ledger.',
    parameters: {
      run_id: { type: 'string', required: true },
    },
    output: STRING_OUTPUT,
    async execute(args) {
      return JSON.stringify(await ctx.proofRuns.stop(args.run_id))
    },
  }))
}
