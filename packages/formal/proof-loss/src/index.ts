import { Service, type Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {
  ProofLossReport,
  ProofReceipt,
  WhiteboxReview,
} from '@tokens-as-parameters/proof-contracts'
import type { ResolvedCase } from '@tokens-as-parameters/proof-contracts/case-manifest'

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
  receipt: ProofReceipt
  baselineClosed: number
  whitebox?: WhiteboxReview
}

/** Loss providers own feedback semantics, not Git persistence or scheduling. */
export interface ProofLossProvider {
  readonly id: string
  readonly requiresJudge: boolean
  installJudge?(agentContext: Context, options: ProofLossJudgeOptions): ProofLossJudgeCapture
  evaluate(input: ProofLossInput): ProofLossReport
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
