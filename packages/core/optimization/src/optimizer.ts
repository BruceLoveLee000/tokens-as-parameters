import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { OptimizationEvidenceAccess, OptimizationLane } from './feedback.js'
import type { ParameterUpdatePlan, TextParameterState } from './parameter.js'

export interface OptimizerInstallOptions {
  agent: Agent
  parameters: TextParameterState
  lanes: OptimizationLane[]
  evidence: OptimizationEvidenceAccess
  softTokenBudget: number
}

export interface OptimizationCapture {
  plan(): ParameterUpdatePlan | undefined
  usedFallback(): boolean
}

/**
 * A semantic optimizer consumes evaluator feedback and proposes atomic updates
 * only for the target agent instance's registered feedback-enabled parameters.
 */
export interface TextOptimizer {
  readonly id: string
  install(agentContext: Context, options: OptimizerInstallOptions): OptimizationCapture
}
