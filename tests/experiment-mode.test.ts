import assert from 'node:assert/strict'
import { access, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import test from 'node:test'
import {
  discoverExperimentCases,
  resolveExperimentCase,
} from '@tokens-as-parameters/proof-contracts/experiment-catalog'
import { loadCaseManifest } from '@tokens-as-parameters/proof-contracts/case-manifest'
import { materializeExperimentCase } from '@tokens-as-parameters/proof-runtime'

const benchmarkRoot = fileURLToPath(new URL('../benchmarks/', import.meta.url))

test('experiment catalog exposes only complete versioned cases', async () => {
  const cases = await discoverExperimentCases(benchmarkRoot)
  assert.deepEqual(cases.map(item => item.caseId), ['lean-smoke-positive'])
  const smoke = await resolveExperimentCase(benchmarkRoot, 'lean-smoke-positive')
  assert.equal(smoke.catalogPath, 'lean-smoke-positive')
  assert.equal(smoke.claimScope, 'lean-model-vs-spec')
  assert.deepEqual(smoke.resolvedCase.manifest.lean.buildArgv, ['lake', 'build', 'Smoke'])
  await assert.rejects(
    resolveExperimentCase(benchmarkRoot, 'fdiv-r14-checkpoint'),
    /unknown experiment case/,
  )
})

test('experiment materialization copies immutable case inputs but not generated state', async () => {
  const source = (await resolveExperimentCase(benchmarkRoot, 'lean-smoke-positive')).resolvedCase.root
  const target = await mkdtemp(join(tmpdir(), 'tap-experiment-materialization-'))
  await materializeExperimentCase(source, target)
  const copied = await loadCaseManifest(target)
  assert.equal(copied.manifest.caseId, 'lean-smoke-positive')
  assert.equal(
    await readFile(join(target, 'inputs', 'SmokeSpec.lean'), 'utf8'),
    await readFile(join(source, 'inputs', 'SmokeSpec.lean'), 'utf8'),
  )
  await assert.rejects(access(join(target, '.git')))
  await assert.rejects(access(join(target, '.lake')))
})
