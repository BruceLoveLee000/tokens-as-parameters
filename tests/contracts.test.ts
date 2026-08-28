import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CaseManifestSchema,
  StartProofExperimentSchema,
} from '@tokens-as-parameters/proof-contracts'
import {
  applyParameterUpdatePlan,
  createTextParameterContextSnapshot,
  createTextParameterState,
  validateParameterUpdatePlan,
} from '@tokens-as-parameters/core-optimization'
import {
  createFormalProverParameterState,
  FORMAL_PROVER_MEMORY_PARAMETER_ID,
  FORMAL_PROVER_PLAN_PARAMETER_ID,
  formalProverRouteParameterId,
} from '@tokens-as-parameters/proof-roles'
import {
  ProofRunsProjectionSchema,
} from '@tokens-as-parameters/proof-contracts/dsh-surface'

const HASH = 'a'.repeat(64)

function manifest() {
  return {
    schemaVersion: '1.0',
    caseId: 'lean-positive',
    claimScope: 'lean-model-vs-spec',
    description: 'A minimal positive proof case.',
    editableFiles: ['Proof.lean'],
    lockedInputs: [{ path: 'Spec.lean', sha256: HASH }],
    lean: {
      workingDirectory: '.',
      proofFile: 'Proof.lean',
      theoremFile: 'Proof.lean',
      module: 'Proof',
      theoremName: 'top',
      theoremSignatureSha256: HASH,
      obligations: ['helper', 'top'],
    },
    provenance: { license: 'Apache-2.0' },
  }
}

test('case manifest keeps frozen inputs outside the editable surface', () => {
  assert.equal(CaseManifestSchema.parse(manifest()).lean.buildArgv[0], 'lake')
  const invalid = manifest()
  invalid.lockedInputs = [{ path: 'Proof.lean', sha256: HASH }]
  assert.equal(CaseManifestSchema.safeParse(invalid).success, false)
})

test('experiment configuration supplies reproducible defaults without a workspace path', () => {
  const parsed = StartProofExperimentSchema.parse({ caseId: 'lean-positive' })
  assert.equal(parsed.search.rollouts, 2)
  assert.equal(parsed.search.reflection.enabled, true)
  assert.equal(parsed.search.maxCumulativeTokensPerLane, 20_000_000)
  assert.equal(parsed.search.optimizer, 'relative-reflection')
  assert.equal(parsed.search.verifier, 'lean')
  assert.deepEqual(parsed.search.parameterFeedback, { memory: true, plan: true, routes: true })
  assert.equal(StartProofExperimentSchema.safeParse({
    caseId: 'lean-positive',
    search: {
      parameterFeedback: { memory: false, plan: false, routes: false },
      reflection: { enabled: true },
    },
  }).success, false)
  assert.equal(StartProofExperimentSchema.safeParse({
    caseId: 'lean-positive',
    caseRoot: '/tmp/arbitrary-workspace',
  }).success, false)
})

test('text parameter updates are instance-selected, atomic, and revisioned', () => {
  const state = createTextParameterState({
    moduleId: 'test-agent',
    version: 'v1',
    parameters: [
      {
        definition: { id: 'task', description: 'Immutable user task.', scope: 'run' },
        content: 'Prove the theorem.',
        requiresFeedback: false,
      },
      {
        definition: { id: 'plan', description: 'Search plan.', scope: 'run' },
        content: 'Explore independently.',
      },
    ],
  })
  const context = createTextParameterContextSnapshot({
    id: 'run-1/epoch-1/r1',
    state,
    parameterIds: ['task', 'plan'],
    metadata: { rolloutId: 'r1' },
  })
  assert.deepEqual(context.parameters, [
    { parameterId: 'task', revision: 'v1' },
    { parameterId: 'plan', revision: 'v1' },
  ])

  const plan = validateParameterUpdatePlan({
    baseStateVersion: 'v1',
    reflection: 'The first route found a reusable decomposition.',
    updates: [{ parameterId: 'plan', content: 'Generalize that decomposition.' }],
  }, state)
  const next = applyParameterUpdatePlan(state, plan, 'v2')
  assert.equal(next.parameters.find(parameter => parameter.id === 'task')?.revision, 'v1')
  assert.equal(next.parameters.find(parameter => parameter.id === 'plan')?.revision, 'v2')
  assert.throws(() => validateParameterUpdatePlan({
    baseStateVersion: 'v1',
    reflection: 'Attempt to mutate the task.',
    updates: [{ parameterId: 'task', content: 'Prove something easier.' }],
  }, state), /frozen/)
  assert.throws(() => validateParameterUpdatePlan({
    baseStateVersion: 'stale',
    reflection: 'Stale feedback.',
    updates: [],
  }, state), /stale/)
})

test('formal prover owns its domain parameter architecture above Core', () => {
  const state = createFormalProverParameterState('run-1/initial', ['r1', 'r2'], {
    memory: false,
    plan: true,
    routes: true,
  })
  assert.equal(state.moduleId, 'formal-prover')
  assert.equal(state.parameters.find(parameter => parameter.id === FORMAL_PROVER_MEMORY_PARAMETER_ID)?.requiresFeedback, false)
  assert.equal(state.parameters.find(parameter => parameter.id === FORMAL_PROVER_PLAN_PARAMETER_ID)?.requiresFeedback, true)
  assert.equal(state.parameters.find(parameter => parameter.id === formalProverRouteParameterId('r2'))?.scope, 'lane')
  assert.equal(state.parameters.some(parameter => parameter.id.includes('fdiv')), false)
})

test('proof run Web projection is a bounded controller-owned view', () => {
  const parsed = ProofRunsProjectionSchema.parse({
    activeRunId: 'run-1',
    runs: [{
      runId: 'run-1',
      caseId: 'lean-positive',
      state: 'CONSOLIDATING',
      createdAt: '2026-08-28T00:00:00.000Z',
      updatedAt: '2026-08-28T00:01:00.000Z',
      epoch: 2,
      trustedObligationsClosed: 1,
      obligationsTotal: 2,
      totalTokens: 42_000,
      sessionTokens: { 'run-1-e2-r1': 42_000 },
      activeSessionIds: ['run-1-e2-r1'],
      lanes: [{
        rolloutId: 'r1',
        sessionId: 'run-1-e2-r1',
        epoch: 2,
        tokens: 42_000,
        obligationsClosed: 1,
        obligationsTotal: 2,
        checkpointable: true,
        finalAccepted: false,
      }],
    }],
  })
  assert.equal(parsed.runs[0]?.state, 'CONSOLIDATING')
  assert.equal(parsed.runs[0]?.lanes[0]?.checkpointable, true)
  assert.equal(parsed.runs[0]?.sessionTokens['run-1-e2-r1'], 42_000)
})
