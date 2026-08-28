import type { TextParameter, TextParameterContextSnapshot } from './parameter.js'

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
  commit?: string
  tokens: number
  tokenUsage: TokenUsageSummary
  contextSnapshot: TextParameterContextSnapshot
  evaluation: EvaluationRecord
  traceTail: TraceEntry[]
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

export interface ParameterUsageExposure {
  rolloutId: string
  sessionId: string
  contextSnapshotId: string
  parameterStateVersion: string
  parameterRevision: string
  tokens: number
  commit?: string
  evaluation: EvaluationRecord
}

export interface ParameterUsageReport {
  parameter: TextParameter
  exposures: ParameterUsageExposure[]
}

export interface OptimizationEvidenceAccess {
  inspectParameterUsage(parameterId: string, rolloutId?: string): Promise<ParameterUsageReport>
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
