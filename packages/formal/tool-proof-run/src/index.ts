import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@tokens-as-parameters/proof-runtime'

export const name = 'tokens-as-parameters-proof-run-tools'
export const inject = ['agents', 'commands', 'proofRuns', 'tools', 'systemPrompt']

const STRING_OUTPUT = {
  schema: { type: 'string' as const },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
}

function requireAgent(agent: Agent | undefined): Agent {
  if (agent === undefined) throw new Error('proof run controls require an initiating DSH agent')
  return agent
}

export function apply(ctx: Context): void {
  ctx.commands.register({
    name: 'proof-stop',
    description: 'Stop an active formal-proof run directly without invoking the model.',
    input: { hint: '<run-id>' },
    async handler({ agent, rawInput }) {
      const id = rawInput.trim()
      if (id.length === 0) return { kind: 'error', text: 'usage: /proof-stop <run-id>' }
      const snapshot = await ctx.proofRuns.get(id)
      if (snapshot === undefined) return { kind: 'error', text: `unknown proof run: ${id}` }
      if (snapshot.ownerSessionId !== String(agent.id)) {
        return { kind: 'error', text: `proof run ${id} does not belong to this session` }
      }
      const stopped = await ctx.proofRuns.stop(id)
      return { kind: 'success', text: `proof run ${id}: ${stopped.state}` }
    },
  })

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
      reasoning_effort: { type: 'string', description: 'Adapter-owned reasoning effort pinned on every Prover, Loss Judge, and Reflector request; default max.' },
      prover: { type: 'string', description: 'Registered Prover Agent provider id, default formal-code-agent.' },
      loss: { type: 'string', description: 'Registered Loss provider id, default lean-dual-check. Use lean-rule-only for the black-box-only ablation.' },
      optimizer: { type: 'string', description: 'Registered token Optimizer id, default relative-reflection.' },
      verifier: { type: 'string', description: 'Registered proof Verifier id, default lean.' },
      rollouts: { type: 'integer', description: 'Parallel search lanes, default 2.' },
      max_parallel: { type: 'integer', description: 'Maximum simultaneously active prover lanes.' },
      max_output_tokens: { type: 'integer', description: 'Per-request output cap, default 64000.' },
      max_steps_per_lane: { type: 'integer', description: 'Primary rollout depth budget measured in completed model inferences, default 200.' },
      max_lane_tokens: { type: 'integer', description: 'Deprecated compatibility field; it no longer controls rollout depth.' },
      total_token_budget: { type: 'integer', description: 'Whole-run token cap, default 300000000.' },
      max_wall_time_seconds: { type: 'integer', description: 'Whole-run wall-time cap, default 43200.' },
      feedback_memory: { type: 'boolean', description: 'Allow reflection to update shared verifier-backed task memory, default true.' },
      feedback_plan: { type: 'boolean', description: 'Allow reflection to update the shared proof-search plan, default true.' },
      feedback_routes: { type: 'boolean', description: 'Allow reflection to update lane-specific search assignments, default true.' },
      reflection_enabled: { type: 'boolean', description: 'Enable group-relative reflection, default true.' },
      reflection_max_steps: { type: 'integer', description: 'Reflector evidence and reasoning step boundary, default 32.' },
      reflection_soft_tokens: { type: 'integer', description: 'Deprecated compatibility field; reflection_max_steps is the active boundary.' },
      loss_judge_max_steps: { type: 'integer', description: 'White-box Loss Judge step boundary for every rollout, default 24.' },
      whitebox_review: { type: 'boolean', description: 'Legacy ablation switch. False selects rule-only loss behavior.' },
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
        ...(args.reasoning_effort === undefined ? {} : { reasoningEffort: args.reasoning_effort }),
        ...(args.prover === undefined ? {} : { prover: args.prover }),
        ...(args.loss !== undefined
          ? { loss: args.loss }
          : args.whitebox_review === false
            ? { loss: 'lean-rule-only' }
            : {}),
        ...(args.optimizer === undefined ? {} : { optimizer: args.optimizer }),
        ...(args.verifier === undefined ? {} : { verifier: args.verifier }),
        ...(args.rollouts === undefined ? {} : { rollouts: args.rollouts }),
        ...(args.max_parallel === undefined ? {} : { maxParallel: args.max_parallel }),
        ...(args.max_output_tokens === undefined ? {} : { maxOutputTokensPerRequest: args.max_output_tokens }),
        ...(args.max_steps_per_lane === undefined ? {} : { maxStepsPerLane: args.max_steps_per_lane }),
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
          ...(args.reflection_max_steps === undefined ? {} : { maxSteps: args.reflection_max_steps }),
          ...(args.reflection_soft_tokens === undefined ? {} : { softTokenBudget: args.reflection_soft_tokens }),
        },
        lossJudge: {
          ...(args.loss_judge_max_steps === undefined ? {} : { maxSteps: args.loss_judge_max_steps }),
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
    async execute(args, exec) {
      const agent = requireAgent(exec.agent)
      const snapshot = await ctx.proofRuns.get(args.run_id)
      if (snapshot === undefined) throw new Error(`unknown proof run: ${args.run_id}`)
      if (snapshot.ownerSessionId !== String(agent.id)) {
        throw new Error(`proof run ${args.run_id} does not belong to this session`)
      }
      return JSON.stringify(await ctx.proofRuns.stop(args.run_id))
    },
  }))
}
