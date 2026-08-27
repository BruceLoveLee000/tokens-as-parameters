import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CaseManifestSchema,
  StartProofRunSchema,
  validateReflectionPlan,
} from '../packages/dsh-formal-proof/src/contracts.js'

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

test('run configuration supplies reproducible defaults', () => {
  const parsed = StartProofRunSchema.parse({ caseRoot: '/tmp/case' })
  assert.equal(parsed.search.rollouts, 2)
  assert.equal(parsed.search.reflection.enabled, true)
  assert.equal(parsed.search.maxCumulativeTokensPerLane, 20_000_000)
})

test('relative reflection must cover every rollout exactly once', () => {
  const valid = validateReflectionPlan({
    reflection: 'Lane one found a reusable decomposition.',
    commonPrompt: 'Preserve checker-validated progress.',
    routes: [
      { rolloutId: 'r1', prompt: 'Generalize the decomposition.' },
      { rolloutId: 'r2', prompt: 'Try a direct bit-vector argument.' },
    ],
  }, ['r1', 'r2'])
  assert.equal(valid.routes.length, 2)
  assert.throws(() => validateReflectionPlan({
    reflection: 'Incomplete update.',
    commonPrompt: 'Continue.',
    routes: [{ rolloutId: 'r1', prompt: 'Continue.' }],
  }, ['r1', 'r2']))
})
