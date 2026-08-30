import type { Context } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
import { sessionSteps } from '@tokens-as-parameters/core-telemetry'
import {
  RUN_SCHEMA_VERSION,
  type ProofLossReport,
  type ProofReceipt,
  type WhiteboxReview,
} from '@tokens-as-parameters/proof-contracts'
import type {
  ProofLossInput,
  ProofLossEvaluation,
  ProofLossEvaluationInput,
  ProofLossJudgeCapture,
  ProofLossJudgeOptions,
  ProofLossProvider,
} from '@tokens-as-parameters/proof-loss'

export const name = 'loss-lean-dual'
export const inject = ['proofLoss']

const STRING_OUTPUT = {
  schema: { type: 'string' as const },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
}

const ReviewSchema = z.object({
  approved: z.boolean(),
  risk: z.enum(['low', 'medium', 'high']),
  findings: z.array(z.object({ type: z.string(), explanation: z.string() })),
  recommendation: z.string(),
})

function restrictToReadOnly(agentCtx: Context, agent: Agent): string[] {
  const requested = ['read', 'grep', 'glob', 'skill', 'get_goal']
  const allowed = requested.filter(tool => agentCtx.tools.get(tool, agent) !== undefined)
  if (!allowed.includes('read')) throw new Error('white-box loss judge requires the official read tool')
  agentCtx.tools.restrict({ allow: allowed })
  return allowed
}

function installJudge(agentCtx: Context, options: ProofLossJudgeOptions): ProofLossJudgeCapture {
  let captured: WhiteboxReview | undefined
  let submitOnly = false
  agentCtx.systemPrompt.section({
    name: 'tokens-as-parameters:whitebox-loss-judge',
    order: 90,
    text: [
      'You are the white-box component of a formal-proof Loss function. Review this rollout on every epoch, not only at final success.',
      'Inspect actual source and locked interfaces. Detect semantic weakening, theorem shadowing, hidden assumptions, unreachable wrappers, misleading obligation accounting, and other reward hacking that a successful build alone may miss.',
      'Your findings are process feedback for the Optimizer. You may reject a candidate but cannot promote one. Finish with submit_whitebox_loss.',
      `Claim scope: ${options.resolvedCase.manifest.claimScope}. Do not broaden lean-model-vs-spec into RTL fidelity.`,
      `Rule-based checker receipt: ${JSON.stringify(options.receipt)}`,
    ].join('\n'),
  })
  agentCtx.tools.register(defineTool({
    name: 'submit_whitebox_loss',
    description: 'Submit the white-box component of this rollout loss and end the judge turn.',
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
      const submission = ReviewSchema.parse(args)
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
  const inherited = restrictToReadOnly(agentCtx, options.agent)
  agentCtx.on('agent/pre-step', async ({ agent }, next): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject' || submitOnly || sessionSteps(agent.session.events) < options.maxSteps) return decision
    submitOnly = true
    agentCtx.tools.restrict({ deny: inherited })
    return {
      kind: 'enter',
      messages: [
        ...decision.messages,
        createUserMessage({
          source: { kind: 'user' },
          content: [{
            type: 'text',
            text: `The white-box evaluation reached its ${options.maxSteps}-step boundary. Only submit_whitebox_loss remains available. Submit the best evidence-backed assessment now.`,
          }],
        }),
      ],
    }
  })
  return { review: () => captured }
}

const FATAL_FINDINGS = new Set([
  'admit',
  'axiom',
  'unsafe',
  'signature',
  'locked-input',
  'unauthorized-change',
  'candidate-state',
  'axiom-audit',
])

export function evaluateLeanProofLoss(
  pluginId: string,
  input: ProofLossInput,
  requiresJudge: boolean,
): ProofLossReport {
  const receipt = input.receipt
  const candidateMatches = receipt.candidateCommit === input.candidateCommit
  const buildPassed = receipt.build.exitCode === 0 && receipt.build.signal === null
  const structuralViolation = !candidateMatches
    || !receipt.lockedInputsMatch
    || !receipt.theoremSignatureMatches
    || receipt.findings.some(finding => FATAL_FINDINGS.has(finding.kind))
  const judgeRejected = requiresJudge && input.whitebox?.approved !== true
  const candidateStatus = structuralViolation || judgeRejected
    ? 'INVALID' as const
    : buildPassed
      ? 'VERIFIED' as const
      : 'EXPLORATORY' as const
  const verdict = candidateStatus === 'INVALID'
    ? 'invalid' as const
    : receipt.finalAccepted
      ? 'solved' as const
      : candidateStatus === 'VERIFIED' && receipt.obligationsClosed > input.baselineClosed
        ? 'progress' as const
        : 'no-progress' as const
  const summary = [
    `${receipt.obligationsClosed}/${receipt.obligationsTotal} named obligations checker-verified`,
    `candidate ${candidateStatus.toLocaleLowerCase()}`,
    ...(input.whitebox === undefined ? [] : [`white-box risk ${input.whitebox.risk}`]),
  ].join('; ')
  return {
    schemaVersion: RUN_SCHEMA_VERSION,
    pluginId,
    candidateCommit: input.candidateCommit,
    evaluatedAt: new Date().toISOString(),
    verdict,
    candidateStatus,
    summary,
    ruleBased: {
      buildPassed,
      lockedInputsMatch: receipt.lockedInputsMatch,
      theoremSignatureMatches: receipt.theoremSignatureMatches,
      obligationsClosed: receipt.obligationsClosed,
      obligationsTotal: receipt.obligationsTotal,
      closedObligations: receipt.closedObligations,
      openObligations: receipt.openObligations,
      forbiddenAxiomFindings: receipt.findings.filter(finding => finding.kind === 'axiom-audit').length,
      findings: receipt.findings,
    },
    ...(input.whitebox === undefined ? {} : { whitebox: input.whitebox }),
    metrics: {
      obligationsClosed: receipt.obligationsClosed,
      obligationsTotal: receipt.obligationsTotal,
      buildPassed,
      finalAccepted: receipt.finalAccepted,
      candidateMatches,
      whiteboxApproved: input.whitebox?.approved ?? !requiresJudge,
    },
  }
}

export class LeanDualCheckLoss implements ProofLossProvider {
  readonly id = 'lean-dual-check'
  readonly requiresJudge = true
  installJudge = installJudge
  score(input: ProofLossInput): ProofLossReport {
    return evaluateLeanProofLoss(this.id, input, true)
  }
  async evaluate(input: ProofLossEvaluationInput): Promise<ProofLossEvaluation> {
    const receipt = await input.verifier.check(
      input.resolvedCase,
      input.worktree,
      input.baselineClosed,
      input.signal,
      input.baseCommit,
      input.candidateCommit,
    )
    const whitebox = await input.review(receipt)
    return {
      receipt,
      loss: this.score({
        candidateCommit: input.candidateCommit,
        receipt,
        baselineClosed: input.baselineClosed,
        ...(whitebox === undefined ? {} : { whitebox }),
      }),
    }
  }
}

export class LeanRuleOnlyLoss implements ProofLossProvider {
  readonly id = 'lean-rule-only'
  readonly requiresJudge = false
  score(input: ProofLossInput): ProofLossReport {
    return evaluateLeanProofLoss(this.id, input, false)
  }
  async evaluate(input: ProofLossEvaluationInput): Promise<ProofLossEvaluation> {
    const receipt = await input.verifier.check(
      input.resolvedCase,
      input.worktree,
      input.baselineClosed,
      input.signal,
      input.baseCommit,
      input.candidateCommit,
    )
    return {
      receipt,
      loss: this.score({
        candidateCommit: input.candidateCommit,
        receipt,
        baselineClosed: input.baselineClosed,
      }),
    }
  }
}

export function apply(ctx: Context): () => void {
  const disposeDual = ctx.proofLoss.register(new LeanDualCheckLoss())
  const disposeRule = ctx.proofLoss.register(new LeanRuleOnlyLoss())
  return () => {
    disposeRule()
    disposeDual()
  }
}
