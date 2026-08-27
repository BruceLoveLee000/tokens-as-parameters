import type { Context } from '@deepseek-ai/cordis'
import { Service } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
import type {
  ProofReceipt,
  WhiteboxReview,
} from './contracts.js'
import type { ResolvedCase } from './case-manifest.js'
import type { GitState } from './git-state.js'
import type { LeanVerifier } from './lean-verifier.js'

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

export interface ProverRoleOptions {
  agent: Agent
  runId: string
  epoch: number
  rolloutId: string
  route: string
  commonPrompt: string
  worktree: string
  baseCommit: string
  baselineClosed: number
  resolvedCase: ResolvedCase
  verifier: LeanVerifier
  git: GitState
  signal: AbortSignal
}

export interface ReviewerRoleOptions {
  agent: Agent
  resolvedCase: ResolvedCase
  receipt: ProofReceipt
}

export interface ReviewerCapture {
  review(): WhiteboxReview | undefined
}

function restrictToReadOnly(agentCtx: Context, agent: Agent): void {
  const allowedSet = new Set(['read', 'grep', 'glob', 'skill', 'get_goal', 'submit_whitebox_review'])
  const allowed = agentCtx.tools.schemas(agent).map(schema => schema.name).filter(name => allowedSet.has(name))
  if (allowed.length > 0) agentCtx.tools.restrict({ allow: allowed })
}

export default class ProofRoleService extends Service {
  static inject = ['tools', 'systemPrompt']

  constructor(ctx: Context) {
    super(ctx, 'proofRoles')
  }

  installProver(agentCtx: Context, options: ProverRoleOptions): void {
    const manifest = options.resolvedCase.manifest
    agentCtx.systemPrompt.section({
      name: 'tokens-as-parameters:prover',
      order: 90,
      text: [
        'You are one independent formal-proof search trajectory.',
        `The only editable files are: ${manifest.editableFiles.join(', ')}.`,
        'Never edit the formal specification, model, theorem signature, case manifest, checker, or locked inputs.',
        'Use Lean feedback as evidence. Intermediate sorry declarations may remain only for obligations not yet closed; never add admit, axioms, unsafe declarations, theorem shadowing, or domain restrictions.',
        'Call record_insight when a material hypothesis, failure explanation, or reusable proof fact becomes clear. The runtime commits the current proof state with the insight.',
        'A candidate is trusted only after the controller-owned checker accepts it. Do not claim completion from your own shell output.',
        `Common comparative guidance: ${options.commonPrompt}`,
        `This lane's route: ${options.route}`,
      ].join('\n'),
    })

    agentCtx.tools.register(defineTool({
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
    }))

    agentCtx.tools.register(defineTool({
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
    }))
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
