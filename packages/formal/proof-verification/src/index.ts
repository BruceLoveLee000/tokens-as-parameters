import { Service, type Context } from '@deepseek-ai/cordis'
import type { ProofReceipt } from '@tokens-as-parameters/proof-contracts'
import type { ResolvedCase } from '@tokens-as-parameters/proof-contracts/case-manifest'

export interface ProofVerifier {
  readonly id: string
  check(
    resolvedCase: ResolvedCase,
    worktree: string,
    baselineClosed?: number,
    signal?: AbortSignal,
    baselineCommit?: string,
  ): Promise<ProofReceipt>
  consolidate(baseSource: string, candidateSource: string, acceptedUnits: readonly string[]): string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    proofVerification: ProofVerificationService
  }
}

export default class ProofVerificationService extends Service {
  private readonly verifiers = new Map<string, ProofVerifier>()

  constructor(ctx: Context) {
    super(ctx, 'proofVerification')
  }

  register(verifier: ProofVerifier): () => void {
    const id = verifier.id.trim()
    if (id.length === 0) throw new Error('verifier id must be non-empty')
    if (this.verifiers.has(id)) throw new Error(`verifier already registered: ${id}`)
    this.verifiers.set(id, verifier)
    return () => {
      if (this.verifiers.get(id) === verifier) this.verifiers.delete(id)
    }
  }

  require(id: string): ProofVerifier {
    const verifier = this.verifiers.get(id)
    if (verifier === undefined) throw new Error(`unknown proof verifier: ${id}`)
    return verifier
  }

  list(): string[] {
    return [...this.verifiers.keys()].sort()
  }
}
