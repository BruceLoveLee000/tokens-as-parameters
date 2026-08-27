import { Service, type Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { z } from 'zod'

export const OPTIMIZATION_API_VERSION = '1.0' as const

export type ParameterKind = 'prompt' | 'route' | 'memory' | 'skill-policy' | 'tool-policy'

export interface TokenParameter {
  id: string
  kind: ParameterKind
  content: string
  revision: string
}

export interface ParameterSet {
  schemaVersion: typeof OPTIMIZATION_API_VERSION
  version: string
  parameters: TokenParameter[]
}

export interface TokenUsageSummary {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens: number
  totalTokens: number
}

export interface TraceEntry {
  kind: 'assistant' | 'tool-call' | 'tool-result' | 'turn-end'
  text: string
}

export interface EvaluationRecord {
  objective: string
  verdict: string
  summary: string
  metrics: Record<string, number | string | boolean>
  evidence: unknown
}

export interface OptimizationLane {
  rolloutId: string
  sessionId: string
  epoch: number
  route: string
  commit?: string
  tokens: number
  tokenUsage: TokenUsageSummary
  evaluation: EvaluationRecord
  traceTail: TraceEntry[]
}

export interface OptimizationRoute {
  rolloutId: string
  prompt: string
}

export interface OptimizationPlan {
  reflection: string
  commonPrompt: string
  routes: OptimizationRoute[]
}

export interface StateNode {
  commit: string
  parents: string[]
  authoredAt: string
  summary: string
}

export interface TraceMatch extends TraceEntry {
  rolloutId: string
  index: number
}

export interface OptimizationEvidenceAccess {
  readTraceRange(rolloutId: string, start: number, limit: number): Promise<{
    rolloutId: string
    totalEntries: number
    start: number
    entries: TraceEntry[]
  }>
  listStateNodes(rolloutId: string, limit: number): Promise<StateNode[]>
  inspectStateTransition(rolloutId: string, commit: string, maxCharacters: number): Promise<unknown>
  searchTrace(query: string, rolloutId: string | undefined, limit: number): Promise<TraceMatch[]>
}

export interface OptimizerInstallOptions {
  agent: Agent
  parameters: ParameterSet
  lanes: OptimizationLane[]
  evidence: OptimizationEvidenceAccess
  softTokenBudget: number
}

export interface OptimizationCapture {
  plan(): OptimizationPlan | undefined
  usedFallback(): boolean
}

/**
 * One semantic optimizer implementation. The engine owns Rollout execution;
 * the optimizer owns comparative credit assignment and the next textual update.
 */
export interface TokenOptimizer {
  readonly id: string
  install(agentContext: Context, options: OptimizerInstallOptions): OptimizationCapture
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    optimization: OptimizationService
  }
}

/** Registry seam analogous to an Optimizer base class plus implementation catalog. */
export default class OptimizationService extends Service {
  private readonly optimizers = new Map<string, TokenOptimizer>()

  constructor(ctx: Context) {
    super(ctx, 'optimization')
  }

  register(optimizer: TokenOptimizer): () => void {
    const id = optimizer.id.trim()
    if (id.length === 0) throw new Error('optimizer id must be non-empty')
    if (this.optimizers.has(id)) throw new Error(`optimizer already registered: ${id}`)
    this.optimizers.set(id, optimizer)
    return () => {
      if (this.optimizers.get(id) === optimizer) this.optimizers.delete(id)
    }
  }

  require(id: string): TokenOptimizer {
    const optimizer = this.optimizers.get(id)
    if (optimizer === undefined) throw new Error(`unknown token optimizer: ${id}`)
    return optimizer
  }

  list(): string[] {
    return [...this.optimizers.keys()].sort()
  }
}

const OptimizationPlanSchema = z.object({
  reflection: z.string().trim().min(1),
  commonPrompt: z.string().trim().min(1),
  routes: z.array(z.object({
    rolloutId: z.string().trim().min(1),
    prompt: z.string().trim().min(1),
  })),
})

export function neutralOptimizationPlan(rolloutIds: readonly string[]): OptimizationPlan {
  return {
    reflection: 'No valid comparative update was submitted; preserve the verified baseline.',
    commonPrompt: 'Continue from the checker-verified baseline and use concrete verifier feedback.',
    routes: rolloutIds.map(rolloutId => ({
      rolloutId,
      prompt: 'Explore independently from the current trusted baseline and record only evidence-backed insights.',
    })),
  }
}

export function validateOptimizationPlan(value: unknown, rolloutIds: readonly string[]): OptimizationPlan {
  const plan = OptimizationPlanSchema.parse(value)
  const expected = [...rolloutIds].sort()
  const actual = plan.routes.map(route => route.rolloutId).sort()
  if (new Set(actual).size !== actual.length || expected.join('\0') !== actual.join('\0')) {
    throw new Error(`optimization routes must cover exactly: ${expected.join(', ')}`)
  }
  return plan
}
