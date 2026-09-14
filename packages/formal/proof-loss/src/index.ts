import { Service, type Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {
  ProofLossReport,
  ProofReceipt,
  WhiteboxReview,
} from '@tokens-as-parameters/proof-contracts'
import type { ResolvedCase } from '@tokens-as-parameters/proof-contracts/case-manifest'
import type { ProofVerifier } from '@tokens-as-parameters/proof-verification'

export interface ProofLossJudgeOptions {
  agent: Agent
  resolvedCase: ResolvedCase
  receipt: ProofReceipt
  maxSteps: number
}

export interface ProofLossJudgeCapture {
  review(): WhiteboxReview | undefined
}

export interface ProofLossInput {
  candidateCommit: string
  receipt: ProofReceipt
  baselineClosed: number
  whitebox?: WhiteboxReview
}

export interface ProofLossEvaluationInput {
  resolvedCase: ResolvedCase
  worktree: string
  candidateCommit: string
  baseCommit: string
  baselineClosed: number
  signal: AbortSignal
  verifier: ProofVerifier
  review(receipt: ProofReceipt): Promise<WhiteboxReview | undefined>
}

export interface ProofLossEvaluation {
  receipt: ProofReceipt
  loss: ProofLossReport
}

/** Loss providers own verifier/reviewer ordering and feedback semantics, not Git persistence or scheduling. */
export interface ProofLossProvider {
  readonly id: string
  readonly requiresJudge: boolean
  installJudge?(agentContext: Context, options: ProofLossJudgeOptions): ProofLossJudgeCapture
  score(input: ProofLossInput): ProofLossReport
  evaluate(input: ProofLossEvaluationInput): Promise<ProofLossEvaluation>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    proofLoss: ProofLossService
  }
}

export default class ProofLossService extends Service {
  private readonly providers = new Map<string, ProofLossProvider>()

  constructor(ctx: Context) {
    super(ctx, 'proofLoss')
  }

  register(provider: ProofLossProvider): () => void {
    const id = provider.id.trim()
    if (id.length === 0) throw new Error('proof loss provider id must be non-empty')
    if (this.providers.has(id)) throw new Error(`proof loss provider already registered: ${id}`)
    this.providers.set(id, provider)
    return () => {
      if (this.providers.get(id) === provider) this.providers.delete(id)
    }
  }

  require(id: string): ProofLossProvider {
    const provider = this.providers.get(id)
    if (provider === undefined) throw new Error(`unknown proof loss provider: ${id}`)
    return provider
  }

  list(): string[] {
    return [...this.providers.keys()].sort()
  }
}
