import { Service, type Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { TextParameterState } from '@tokens-as-parameters/core-optimization'
import type { GitState } from '@tokens-as-parameters/core-state-git'
import type { CaseManifest } from '@tokens-as-parameters/proof-contracts'
import type { ResolvedCase } from '@tokens-as-parameters/proof-contracts/case-manifest'
import type { ProofVerifier } from '@tokens-as-parameters/proof-verification'

export interface ProofAgentFeedbackSelection {
  memory?: boolean
  plan?: boolean
  routes?: boolean
}

export interface ProofAgentInstallOptions {
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
  maxSteps: number
}

/** A complete, replaceable target-Agent definition for one proof rollout. */
export interface ProofAgentProvider {
  readonly id: string
  createParameterState(
    version: string,
    rolloutIds: readonly string[],
    selection: ProofAgentFeedbackSelection,
  ): TextParameterState
  parameterIdsForRollout(rolloutId: string): string[]
  route(parameters: TextParameterState, rolloutId: string): string
  task(manifest: CaseManifest, rolloutId: string, optimizerTask?: string): string
  install(agentContext: Context, options: ProofAgentInstallOptions): void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    proofAgents: ProofAgentService
  }
}

/** Registry only: concrete Agent definitions live in separate provider plugins. */
export default class ProofAgentService extends Service {
  private readonly providers = new Map<string, ProofAgentProvider>()

  constructor(ctx: Context) {
    super(ctx, 'proofAgents')
  }

  register(provider: ProofAgentProvider): () => void {
    const id = provider.id.trim()
    if (id.length === 0) throw new Error('proof agent provider id must be non-empty')
    if (this.providers.has(id)) throw new Error(`proof agent provider already registered: ${id}`)
    this.providers.set(id, provider)
    return () => {
      if (this.providers.get(id) === provider) this.providers.delete(id)
    }
  }

  require(id: string): ProofAgentProvider {
    const provider = this.providers.get(id)
    if (provider === undefined) throw new Error(`unknown proof agent provider: ${id}`)
    return provider
  }

  list(): string[] {
    return [...this.providers.keys()].sort()
  }
}
