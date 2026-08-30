import type { Context } from '@deepseek-ai/cordis'
import { Service } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
import {
  createTextParameterState,
  requireTextParameter,
  type TextParameterState,
} from '@tokens-as-parameters/core-optimization'
import type {
  ProofReceipt,
  WhiteboxReview,
} from '@tokens-as-parameters/proof-contracts'
import type { ResolvedCase } from '@tokens-as-parameters/proof-contracts/case-manifest'
import type { GitState } from '@tokens-as-parameters/core-state-git'
import { sessionTokens } from '@tokens-as-parameters/core-telemetry'
import type { ProofVerifier } from '@tokens-as-parameters/proof-verification'

declare module '@deepseek-ai/cordis' {
  interface Context {
    proofRoles: ProofRoleService
  }
}

const STRING_OUTPUT = {
  schema: { type: 'string' as const },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
}

const WhiteboxReviewSubmissionSchema = z.object({
  approved: z.boolean(),
  risk: z.enum(['low', 'medium', 'high']),
  findings: z.array(z.object({
    type: z.string(),
    explanation: z.string(),
  })),
  recommendation: z.string(),
})

export const FORMAL_PROVER_MODULE_ID = 'formal-prover'
export const FORMAL_PROVER_MEMORY_PARAMETER_ID = 'task.memory'
export const FORMAL_PROVER_PLAN_PARAMETER_ID = 'task.plan'

export function formalProverRouteParameterId(rolloutId: string): string {
  const normalized = rolloutId.trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(normalized)) {
    throw new Error(`invalid formal prover rollout id: ${rolloutId}`)
  }
  return `lane.${normalized}.route`
}

export interface FormalProverFeedbackSelection {
  memory?: boolean
  plan?: boolean
  routes?: boolean
}

/** Domain-owned Agent definition. Core knows none of these parameter ids. */
export function createFormalProverParameterState(
  version: string,
  rolloutIds: readonly string[],
  selection: FormalProverFeedbackSelection = {},
): TextParameterState {
  return createTextParameterState({
    moduleId: FORMAL_PROVER_MODULE_ID,
    version,
    parameters: [
      {
        definition: {
          id: FORMAL_PROVER_MEMORY_PARAMETER_ID,
          scope: 'run',
          description: 'Concise verifier-backed facts, reusable proof discoveries, and failed assumptions shared by all formal-prover lanes in the next epoch.',
        },
        content: 'No shared verifier-backed task memory has been learned yet.',
        requiresFeedback: selection.memory ?? true,
      },
      {
        definition: {
          id: FORMAL_PROVER_PLAN_PARAMETER_ID,
          scope: 'run',
          description: 'Shared proof-search policy for the next epoch. It guides prioritization and proof engineering but never changes the locked theorem or trust policy.',
        },
        content: 'Use Lean feedback, preserve locked inputs, and prefer small reusable lemmas that improve the checker-visible proof state.',
        requiresFeedback: selection.plan ?? true,
      },
      ...rolloutIds.map(rolloutId => ({
        definition: {
          id: formalProverRouteParameterId(rolloutId),
          scope: 'lane' as const,
          description: `Independent search assignment for formal-prover lane ${rolloutId}. It should preserve useful diversity while targeting checker-visible progress.`,
        },
        content: 'Explore independently from the common checker-verified baseline.',
        requiresFeedback: selection.routes ?? true,
      })),
    ],
  })
}

export interface ProverRoleOptions {
  agent: Agent
  runId: string
  epoch: number
  rolloutId: string
  parameters: TextParameterState
  worktree: string
  baseCommit: string
  baselineClosed: number
  resolvedCase: ResolvedCase
  verifier: ProofVerifier
  git: GitState
  signal: AbortSignal
  maxCumulativeTokens: number
}

export interface ReviewerRoleOptions {
  agent: Agent
  resolvedCase: ResolvedCase
  receipt: ProofReceipt
}

export interface ReviewerCapture {
  review(): WhiteboxReview | undefined
}

function restrictInheritedTools(
  agentCtx: Context,
  agent: Agent,
  requested: readonly string[],
  required: readonly string[],
  role: string,
): string[] {
  const allowed = requested.filter(name => agentCtx.tools.get(name, agent) !== undefined)
  const missing = required.filter(name => !allowed.includes(name))
  if (missing.length > 0) {
    throw new Error(
      `${role} requires the official Code Agent tool composition; missing inherited tool(s): ${missing.join(', ')}`,
    )
  }
  agentCtx.tools.restrict({ allow: allowed })
  return allowed
}

function restrictProverTools(agentCtx: Context, agent: Agent): string[] {
  return restrictInheritedTools(
    agentCtx,
    agent,
    ['bash', 'read', 'write', 'edit', 'glob', 'grep', 'skill', 'get_goal'],
    ['bash', 'read', 'write', 'edit'],
    'formal prover',
  )
}

function restrictToReadOnly(agentCtx: Context, agent: Agent): void {
  restrictInheritedTools(
    agentCtx,
    agent,
    ['read', 'grep', 'glob', 'skill', 'get_goal'],
    ['read'],
    'white-box reviewer',
  )
}

export function shouldEnterProverSubmitOnly(currentTokens: number, maxCumulativeTokens: number): boolean {
  return currentTokens >= maxCumulativeTokens
}

export default class ProofRoleService extends Service {
  static inject = ['tools', 'systemPrompt']

  constructor(ctx: Context) {
    super(ctx, 'proofRoles')
  }

  installProver(agentCtx: Context, options: ProverRoleOptions): void {
    const manifest = options.resolvedCase.manifest
    const memory = requireTextParameter(options.parameters, FORMAL_PROVER_MEMORY_PARAMETER_ID)
    const plan = requireTextParameter(options.parameters, FORMAL_PROVER_PLAN_PARAMETER_ID)
    const route = requireTextParameter(options.parameters, formalProverRouteParameterId(options.rolloutId))
    agentCtx.systemPrompt.section({
      name: 'tokens-as-parameters:prover',
      order: 90,
      text: [
        'You are one independent formal-proof search trajectory.',
        `The only editable files are: ${manifest.editableFiles.join(', ')}.`,
        'Never edit the formal specification, model, theorem signature, case manifest, checker, or locked inputs.',
        'Use Lean feedback as evidence. Intermediate sorry declarations may remain only for obligations not yet closed; never add admit, axioms, unsafe declarations, theorem shadowing, or domain restrictions.',
        'Call record_insight when a material hypothesis, failure explanation, or reusable proof fact becomes clear. The runtime commits the current proof state with the insight.',
        'Call submit_proof_candidate when you are ready for the controller to check the current editable proof state. At the cumulative lane-token boundary, the runtime will leave only this submission tool available.',
        'A candidate is trusted only after the controller-owned checker accepts it. Do not claim completion from your own shell output.',
      ].join('\n'),
    })
    agentCtx.systemPrompt.section({
      name: `tokens-as-parameters:${memory.id}`,
      order: 91,
      text: `Shared verifier-backed task memory:\n${memory.content}`,
    })
    agentCtx.systemPrompt.section({
      name: `tokens-as-parameters:${plan.id}`,
      order: 92,
      text: `Shared proof-search plan:\n${plan.content}`,
    })
    agentCtx.systemPrompt.section({
      name: `tokens-as-parameters:${route.id}`,
      order: 93,
      text: `This lane's independent search assignment:\n${route.content}`,
    })

    let submitOnly = false
    const searchToolDisposers: Array<() => void> = []

    searchToolDisposers.push(agentCtx.tools.register(defineTool({
      name: 'record_insight',
      description: 'Commit the current editable proof state together with one concise evidence-backed insight.',
      parameters: {
        summary: { type: 'string', required: true, description: 'Short commit-style summary.' },
        insight: { type: 'string', required: true, description: 'Evidence, hypothesis, failed route, or next implication.' },
      },
      output: STRING_OUTPUT,
      async execute(args, exec) {
        const result = await options.git.recordInsight(
          options.worktree,
          options.runId,
          options.epoch,
          options.rolloutId,
          manifest.editableFiles,
          args.summary,
          args.insight,
          AbortSignal.any([options.signal, exec.signal]),
        )
        return JSON.stringify(result)
      },
    })))

    searchToolDisposers.push(agentCtx.tools.register(defineTool({
      name: 'lean_check_candidate',
      description: 'Run the independent Lean build, locked-input, theorem-signature, hygiene, obligation, and final axiom checks on the current worktree.',
      parameters: {},
      output: STRING_OUTPUT,
      async execute(_args, exec) {
        const receipt = await options.verifier.check(
          options.resolvedCase,
          options.worktree,
          options.baselineClosed,
          AbortSignal.any([options.signal, exec.signal]),
          options.baseCommit,
        )
        return JSON.stringify(receipt)
      },
    })))

    agentCtx.tools.register(defineTool({
      name: 'submit_proof_candidate',
      description: 'Stop this proof-search turn and hand the current editable proof state to the controller-owned checker.',
      parameters: {},
      output: STRING_OUTPUT,
      async execute(_args, exec) {
        exec.concludeTurn()
        return JSON.stringify({ submitted: true })
      },
    }))

    // The role keeps the official Code Agent's filesystem/shell surface while
    // removing outer lifecycle controls such as chip_proof and proof_run_stop.
    // Scope-local proof tools above remain visible by DSH restriction design.
    const inheritedProofTools = restrictProverTools(agentCtx, options.agent)

    agentCtx.on('agent/pre-step', async ({ agent }, next): Promise<PreStepDecision> => {
      const decision = await next()
      if (
        decision.kind === 'reject'
        || submitOnly
        || !shouldEnterProverSubmitOnly(
          sessionTokens(agent.session.events),
          options.maxCumulativeTokens,
        )
      ) {
        return decision
      }
      submitOnly = true
      searchToolDisposers.splice(0).forEach(dispose => dispose())
      agentCtx.tools.restrict({ deny: inheritedProofTools })
      return {
        kind: 'enter',
        messages: [
          ...decision.messages,
          createUserMessage({
            source: { kind: 'user' },
            content: [{
              type: 'text',
              text: `This lane reached its ${options.maxCumulativeTokens.toLocaleString()} token cumulative search boundary. Only submit_proof_candidate remains available. Submit the current editable proof state now; the controller will run the independent checker after this turn. Do not attempt unavailable historical tools.`,
            }],
          }),
        ],
      }
    })
  }

  installReviewer(agentCtx: Context, options: ReviewerRoleOptions): ReviewerCapture {
    let captured: WhiteboxReview | undefined
    agentCtx.systemPrompt.section({
      name: 'tokens-as-parameters:whitebox-reviewer',
      order: 90,
      text: [
        'You are a read-only white-box reviewer of a Lean proof candidate that already passed deterministic checks.',
        'Inspect the actual proof and its locked interfaces. Look for semantic weakening, theorem shadowing, hidden assumptions, unreachable wrappers, or other reward hacking not captured by syntax checks.',
        'You may veto a candidate but cannot promote it. Finish by calling submit_whitebox_review exactly once.',
        `Claim scope: ${options.resolvedCase.manifest.claimScope}. Do not broaden it to RTL equivalence without a fidelity certificate.`,
        `Checker receipt: ${JSON.stringify(options.receipt)}`,
      ].join('\n'),
    })
    agentCtx.tools.register(defineTool({
      name: 'submit_whitebox_review',
      description: 'Submit the final read-only white-box assessment and end this reviewer turn.',
      parameters: {
        approved: { type: 'boolean', required: true },
        risk: { type: 'string', required: true, enum: ['low', 'medium', 'high'] },
        findings: {
          type: 'array',
          required: true,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              type: { type: 'string', required: true },
              explanation: { type: 'string', required: true },
            },
          },
        },
        recommendation: { type: 'string', required: true },
      },
      output: STRING_OUTPUT,
      async execute(args, exec) {
        const submission = WhiteboxReviewSubmissionSchema.parse(args)
        captured = {
          approved: submission.approved && submission.risk !== 'high',
          risk: submission.risk,
          findings: submission.findings,
          recommendation: submission.recommendation,
        }
        exec.concludeTurn()
        return JSON.stringify(captured)
      },
    }))
    restrictToReadOnly(agentCtx, options.agent)
    return { review: () => captured }
  }
}
