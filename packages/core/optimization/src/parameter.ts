import { z } from 'zod'

export const TEXT_PARAMETER_API_VERSION = '1.0' as const

export type TextParameterScope = 'run' | 'lane'

export interface TextParameterDefinition {
  id: string
  description: string
  scope: TextParameterScope
}

export interface TextParameter extends TextParameterDefinition {
  content: string
  revision: string
  requiresFeedback: boolean
}

export interface TextParameterState {
  schemaVersion: typeof TEXT_PARAMETER_API_VERSION
  moduleId: string
  version: string
  parameters: TextParameter[]
}

export interface TextParameterSeed {
  definition: TextParameterDefinition
  content: string
  requiresFeedback?: boolean
}

export interface TextParameterExposure {
  parameterId: string
  revision: string
}

export interface TextParameterContextSnapshot {
  schemaVersion: typeof TEXT_PARAMETER_API_VERSION
  id: string
  moduleId: string
  parameterStateVersion: string
  parameters: TextParameterExposure[]
  metadata: Record<string, string | number | boolean>
}

export interface TextParameterUpdate {
  parameterId: string
  content: string
}

export interface ParameterUpdatePlan {
  baseStateVersion: string
  reflection: string
  updates: TextParameterUpdate[]
}

const DefinitionSchema = z.object({
  id: z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  description: z.string().trim().min(1),
  scope: z.enum(['run', 'lane']),
})

const UpdatePlanSchema = z.object({
  baseStateVersion: z.string().trim().min(1),
  reflection: z.string().trim().min(1),
  updates: z.array(z.object({
    parameterId: z.string().trim().min(1),
    content: z.string().trim().min(1),
  })),
})

function assertUnique(ids: readonly string[], subject: string): void {
  if (new Set(ids).size !== ids.length) throw new Error(`${subject} ids must be unique`)
}

export function defineTextParameter(input: TextParameterDefinition): TextParameterDefinition {
  return DefinitionSchema.parse(input)
}

export function createTextParameterState(input: {
  moduleId: string
  version: string
  parameters: readonly TextParameterSeed[]
}): TextParameterState {
  const moduleId = input.moduleId.trim()
  const version = input.version.trim()
  if (moduleId.length === 0) throw new Error('text parameter module id must be non-empty')
  if (version.length === 0) throw new Error('text parameter state version must be non-empty')
  const parameters = input.parameters.map(seed => {
    const definition = defineTextParameter(seed.definition)
    const content = seed.content.trim()
    if (content.length === 0) throw new Error(`text parameter content must be non-empty: ${definition.id}`)
    return {
      ...definition,
      content,
      revision: version,
      requiresFeedback: seed.requiresFeedback ?? true,
    }
  })
  assertUnique(parameters.map(parameter => parameter.id), 'text parameter')
  return {
    schemaVersion: TEXT_PARAMETER_API_VERSION,
    moduleId,
    version,
    parameters,
  }
}

export function requireTextParameter(state: TextParameterState, id: string): TextParameter {
  const parameter = state.parameters.find(candidate => candidate.id === id)
  if (parameter === undefined) throw new Error(`unknown text parameter: ${id}`)
  return parameter
}

export function feedbackParameters(state: TextParameterState): TextParameter[] {
  return state.parameters.filter(parameter => parameter.requiresFeedback)
}

export function createTextParameterContextSnapshot(input: {
  id: string
  state: TextParameterState
  parameterIds: readonly string[]
  metadata?: Record<string, string | number | boolean>
}): TextParameterContextSnapshot {
  const id = input.id.trim()
  if (id.length === 0) throw new Error('context snapshot id must be non-empty')
  assertUnique(input.parameterIds, 'context snapshot parameter')
  return {
    schemaVersion: TEXT_PARAMETER_API_VERSION,
    id,
    moduleId: input.state.moduleId,
    parameterStateVersion: input.state.version,
    parameters: input.parameterIds.map(parameterId => {
      const parameter = requireTextParameter(input.state, parameterId)
      return { parameterId, revision: parameter.revision }
    }),
    metadata: { ...input.metadata },
  }
}

export function validateParameterUpdatePlan(
  value: unknown,
  state: TextParameterState,
): ParameterUpdatePlan {
  const plan = UpdatePlanSchema.parse(value)
  if (plan.baseStateVersion !== state.version) {
    throw new Error(`stale parameter update: expected ${state.version}, got ${plan.baseStateVersion}`)
  }
  assertUnique(plan.updates.map(update => update.parameterId), 'parameter update')
  for (const update of plan.updates) {
    const parameter = requireTextParameter(state, update.parameterId)
    if (!parameter.requiresFeedback) {
      throw new Error(`text parameter is frozen for this agent instance: ${update.parameterId}`)
    }
  }
  return plan
}

export function applyParameterUpdatePlan(
  state: TextParameterState,
  value: unknown,
  nextVersion: string,
): TextParameterState {
  const plan = validateParameterUpdatePlan(value, state)
  const version = nextVersion.trim()
  if (version.length === 0) throw new Error('next text parameter state version must be non-empty')
  const updates = new Map(plan.updates.map(update => [update.parameterId, update.content.trim()]))
  return {
    ...state,
    version,
    parameters: state.parameters.map(parameter => {
      const content = updates.get(parameter.id)
      return content === undefined ? parameter : { ...parameter, content, revision: version }
    }),
  }
}

export function neutralParameterUpdatePlan(state: TextParameterState): ParameterUpdatePlan {
  return {
    baseStateVersion: state.version,
    reflection: 'No valid semantic update was submitted; preserve every active text parameter.',
    updates: [],
  }
}
