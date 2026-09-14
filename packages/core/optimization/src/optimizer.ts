import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { OptimizationEvidenceAccess, OptimizationLane } from './feedback.js'
import {
  neutralParameterUpdatePlan,
  validateParameterUpdatePlan,
  type ParameterUpdatePlan,
  type TextParameterState,
} from './parameter.js'

export type OptimizationStateStatus = 'VERIFIED' | 'EXPLORATORY'

export interface OptimizationStateRef {
  id: string
  status: OptimizationStateStatus
  summary: string
  rolloutId?: string
}

/** One optimizer-selected parent and assignment for a future rollout. */
export interface RolloutDirective {
  rolloutId: string
  baseStateId: string
  task: string
}

/**
 * One semantic optimizer step updates textual parameters and schedules the next
 * forward passes. It never edits a solution workspace directly.
 */
export interface OptimizationDecision {
  parameterUpdate: ParameterUpdatePlan
  nextRollouts: RolloutDirective[]
}

export interface OptimizerInstallOptions {
  agent: Agent
  parameters: TextParameterState
  lanes: OptimizationLane[]
  eligibleStates: OptimizationStateRef[]
  evidence: OptimizationEvidenceAccess
  maxSteps: number
}

export interface OptimizationCapture {
  decision(): OptimizationDecision | undefined
  usedFallback(): boolean
}

function assertUnique(values: readonly string[], subject: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${subject} must be unique`)
}

export function validateOptimizationDecision(
  value: OptimizationDecision,
  options: Pick<OptimizerInstallOptions, 'parameters' | 'lanes' | 'eligibleStates'>,
): OptimizationDecision {
  const parameterUpdate = validateParameterUpdatePlan(value.parameterUpdate, options.parameters)
  const rolloutIds = options.lanes.map(lane => lane.rolloutId)
  const submittedIds = value.nextRollouts.map(directive => directive.rolloutId)
  assertUnique(submittedIds, 'next-rollout ids')
  if (submittedIds.length !== rolloutIds.length || rolloutIds.some(id => !submittedIds.includes(id))) {
    throw new Error(`nextRollouts must schedule exactly: ${rolloutIds.join(', ')}`)
  }
  const eligible = new Set(options.eligibleStates.map(state => state.id))
  return {
    parameterUpdate,
    nextRollouts: value.nextRollouts.map(directive => {
      const task = directive.task.trim()
      if (!eligible.has(directive.baseStateId)) {
        throw new Error(`ineligible rollout base state: ${directive.baseStateId}`)
      }
      if (task.length === 0) throw new Error(`next-rollout task is empty: ${directive.rolloutId}`)
      return { ...directive, task }
    }),
  }
}

export function neutralOptimizationDecision(
  options: Pick<OptimizerInstallOptions, 'parameters' | 'lanes' | 'eligibleStates'>,
): OptimizationDecision {
  const fallback = options.eligibleStates.find(state => state.status === 'VERIFIED')
    ?? options.eligibleStates[0]
  if (fallback === undefined) throw new Error('optimizer requires at least one eligible solution state')
  return {
    parameterUpdate: neutralParameterUpdatePlan(options.parameters),
    nextRollouts: options.lanes.map(lane => {
      const own = lane.commit === undefined
        ? undefined
        : options.eligibleStates.find(state => state.id === lane.commit)
      return {
        rolloutId: lane.rolloutId,
        baseStateId: (own ?? fallback).id,
        task: 'Continue from the selected verified or exploratory state and pursue checker-visible progress.',
      }
    }),
  }
}

/**
 * A semantic optimizer consumes evaluator feedback and proposes atomic updates
 * only for the target agent instance's registered feedback-enabled parameters.
 */
export interface TextOptimizer {
  readonly id: string
  install(agentContext: Context, options: OptimizerInstallOptions): OptimizationCapture
}
