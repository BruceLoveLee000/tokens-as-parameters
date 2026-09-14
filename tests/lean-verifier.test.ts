import assert from 'node:assert/strict'
import { access, cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { CaseManifest } from '@tokens-as-parameters/proof-contracts'
import { hashFile, type ResolvedCase } from '@tokens-as-parameters/proof-contracts/case-manifest'
import type { CommandReceipt, CommandRunner, CommandSpec } from '@tokens-as-parameters/core-state-git'
import {
  LeanVerifier,
  declarationSources,
  obligationStatus,
  parseAxiomAudit,
  parseNamedAxiomAudits,
  proofHygiene,
  stripLeanComments,
  theoremSignatureSha256,
} from '@tokens-as-parameters/verifier-lean'

class FakeRunner implements CommandRunner {
  readonly calls: CommandSpec[] = []

  constructor(
    private readonly buildExitCode = 0,
    private readonly axiomOutput = "'helper' does not depend on any axioms\n'top' does not depend on any axioms",
    private readonly changedPaths = '',
    private readonly baselineProof?: string,
    private readonly headCommit = 'candidate-1',
  ) {}

  async run(spec: CommandSpec): Promise<CommandReceipt> {
    this.calls.push(spec)
    if (spec.argv[0] === 'cp') {
      const source = spec.argv.at(-2)
      const target = spec.argv.at(-1)
      if (source === undefined || target === undefined) throw new Error('invalid copy command')
      await cp(source, target, { recursive: true })
    }
    const audit = spec.argv.includes('lean')
    const changed = spec.argv[0] === 'git' && spec.argv[1] === 'diff'
    const show = spec.argv[0] === 'git' && spec.argv[1] === 'show'
    const head = spec.argv[0] === 'git' && spec.argv[1] === 'rev-parse'
    return {
      argv: [...spec.argv],
      cwd: spec.cwd,
      exitCode: show && this.baselineProof === undefined ? 1 : audit || show ? 0 : this.buildExitCode,
      signal: null,
      stdout: audit ? this.axiomOutput : changed ? this.changedPaths : show ? this.baselineProof ?? '' : head ? `${this.headCommit}\n` : '',
      stderr: '',
      stdoutTruncated: false,
      stderrTruncated: false,
      durationMs: 1,
    }
  }
}

const PROOF = [
  'import Spec',
  '',
  'theorem helper : True := by',
  '  trivial',
  '',
  'theorem top : True := by',
  '  exact helper',
  '',
].join('\n')

async function fixture(): Promise<{ root: string; resolved: ResolvedCase }> {
  const root = await mkdtemp(join(tmpdir(), 'tap-verifier-test-'))
  await mkdir(join(root, 'formal'))
  await writeFile(join(root, 'formal', 'Spec.lean'), 'def frozenValue : Nat := 1\n', 'utf8')
  await writeFile(join(root, 'formal', 'Proof.lean'), PROOF, 'utf8')
  const locked = await hashFile(join(root, 'formal', 'Spec.lean'))
  const manifest: CaseManifest = {
    schemaVersion: '1.0',
    caseId: 'unit-positive',
    claimScope: 'lean-model-vs-spec',
    description: 'Verifier unit fixture.',
    git: {},
    editableFiles: ['formal/Proof.lean'],
    lockedInputs: [{ path: 'formal/Spec.lean', sha256: locked }],
    externalDependencies: [],
    lean: {
      workingDirectory: 'formal',
      proofFile: 'formal/Proof.lean',
      theoremFile: 'formal/Proof.lean',
      module: 'Proof',
      theoremName: 'top',
      theoremSignatureSha256: theoremSignatureSha256(PROOF, 'top'),
      obligations: ['helper', 'top'],
      buildArgv: ['lake', 'build'],
      allowedAxioms: ['propext', 'Classical.choice', 'Quot.sound'],
    },
    provenance: { license: 'Apache-2.0' },
  }
  return {
    root,
    resolved: {
      root,
      manifestPath: join(root, 'case.json'),
      manifest,
      lockedInputs: [{ path: 'formal/Spec.lean', sha256: locked }],
    },
  }
}

test('Lean source parsing ignores nested comments but preserves string content', () => {
  const source = '/* outer /* axiom fake */ still comment */\ntheorem x : String := "-- not a comment"\n'
  const clean = stripLeanComments(source)
  assert.equal(clean.includes('axiom fake'), false)
  assert.equal(clean.includes('"-- not a comment"'), true)
  assert.deepEqual([...declarationSources(source).keys()], ['x'])
})

test('obligation and hygiene checks distinguish concrete proofs from sorry and axioms', () => {
  const source = 'theorem done : True := by trivial\ntheorem pending : True := by sorry\naxiom shortcut : False\n'
  assert.deepEqual(obligationStatus(source, ['done', 'pending']), { closed: ['done'], open: ['pending'] })
  assert.deepEqual(proofHygiene(source, 'Proof.lean').map(item => item.kind), ['axiom'])
})

test('axiom audit parser extracts Lean dependencies', () => {
  assert.deepEqual(
    parseAxiomAudit("'top' depends on axioms: [propext, Classical.choice]"),
    ['propext', 'Classical.choice'],
  )
  assert.deepEqual(parseAxiomAudit("'top' does not depend on any axioms"), [])
  assert.deepEqual(
    parseNamedAxiomAudits("'helper' does not depend on any axioms\n'top' depends on axioms: [sorryAx]"),
    new Map([['helper', []], ['top', ['sorryAx']]]),
  )
})

test('verifier accepts only a built, frozen, closed and axiom-clean candidate', async () => {
  const { root, resolved } = await fixture()
  const runner = new FakeRunner()
  const receipt = await new LeanVerifier(runner).check(resolved, root)
  assert.equal(receipt.finalAccepted, true)
  assert.equal(receipt.obligationsClosed, 2)
  assert.equal(receipt.lockedInputsMatch, true)
  assert.equal(runner.calls.length, 2)

  await writeFile(join(root, 'formal', 'Spec.lean'), 'def frozenValue : Nat := 2\n', 'utf8')
  const mutated = await new LeanVerifier(new FakeRunner()).check(resolved, root)
  assert.equal(mutated.finalAccepted, false)
  assert.equal(mutated.lockedInputsMatch, false)
})

test('trusted verifier receipt binds the exact clean candidate commit', async () => {
  const { root, resolved } = await fixture()
  const accepted = await new LeanVerifier(new FakeRunner()).check(
    resolved,
    root,
    0,
    undefined,
    undefined,
    'candidate-1',
  )
  assert.equal(accepted.candidateCommit, 'candidate-1')
  assert.equal(accepted.finalAccepted, true)

  const stale = await new LeanVerifier(new FakeRunner(0, undefined, '', undefined, 'different-head')).check(
    resolved,
    root,
    0,
    undefined,
    undefined,
    'candidate-1',
  )
  assert.equal(stale.finalAccepted, false)
  assert.equal(stale.findings.some(finding => finding.kind === 'candidate-state'), true)
})

test('forbidden obligation dependencies do not count as trusted progress', async () => {
  const { root, resolved } = await fixture()
  const runner = new FakeRunner(0, "'helper' does not depend on any axioms\n'top' depends on axioms: [sorryAx]")
  const receipt = await new LeanVerifier(runner).check(resolved, root)
  assert.equal(receipt.finalAccepted, false)
  assert.equal(receipt.obligationsClosed, 1)
  assert.deepEqual(receipt.openObligations, ['top'])
  assert.deepEqual(receipt.axiomAudit?.forbidden, ['sorryAx'])
})

test('candidate may add proof-side Lean sources outside the legacy editable hint', async () => {
  const { root, resolved } = await fixture()
  await writeFile(join(root, 'formal', 'Injected.lean'), 'theorem additional_helper : True := by trivial\n', 'utf8')
  const runner = new FakeRunner(
    0,
    "'helper' does not depend on any axioms\n'top' does not depend on any axioms",
    'formal/Injected.lean\n',
  )
  const receipt = await new LeanVerifier(runner).check(resolved, root, 0, undefined, 'deadbeef')
  assert.equal(receipt.finalAccepted, true)
  assert.equal(receipt.findings.some(finding => finding.kind === 'unauthorized-change'), false)
})

test('candidate may delete an unlocked proof-side Lean source without an unreadable-source failure', async () => {
  const { root, resolved } = await fixture()
  const runner = new FakeRunner(
    0,
    "'helper' does not depend on any axioms\n'top' does not depend on any axioms",
    'formal/RemovedScratch.lean\n',
  )

  const receipt = await new LeanVerifier(runner).check(resolved, root, 0, undefined, 'deadbeef')

  assert.equal(receipt.finalAccepted, true)
  assert.equal(
    receipt.findings.some(finding => finding.message.includes('unable to inspect changed Lean source')),
    false,
  )
})

test('verifier removes prior Lean build outputs before checking trust', async () => {
  const { root, resolved } = await fixture()
  const buildArtifact = join(root, 'formal', '.lake', 'build', 'lib', 'Proof.olean')
  const configArtifact = join(root, 'formal', '.lake', 'config', 'lakefile.olean')
  await mkdir(join(root, 'formal', '.lake', 'build', 'lib'), { recursive: true })
  await mkdir(join(root, 'formal', '.lake', 'config'), { recursive: true })
  await writeFile(buildArtifact, 'untrusted build output', 'utf8')
  await writeFile(configArtifact, 'untrusted Lake config', 'utf8')

  const receipt = await new LeanVerifier(new FakeRunner()).check(resolved, root)

  assert.equal(receipt.finalAccepted, true)
  await assert.rejects(access(buildArtifact))
  await assert.rejects(access(configArtifact))
})

test('Lean baseline preparation runs only the manifest-declared cache command', async () => {
  const { root, resolved } = await fixture()
  resolved.manifest.lean.dependencyCacheArgv = ['lake', 'exe', 'cache', 'get']
  const runner = new FakeRunner()

  const sharedCacheRoot = await mkdtemp(join(tmpdir(), 'tap-lean-shared-cache-'))
  await new LeanVerifier(runner).prepareBaselineEnvironment(resolved, root, sharedCacheRoot)

  assert.deepEqual(runner.calls.map(call => call.argv), [['lake', 'exe', 'cache', 'get']])
  assert.equal(runner.calls[0]?.cwd, join(root, 'formal'))
})

test('Lean baseline preparation hydrates and publishes a dependency-fingerprinted shared cache', async () => {
  const { root, resolved } = await fixture()
  resolved.manifest.lean.dependencyCacheArgv = ['lake', 'exe', 'cache', 'get']
  const sharedCacheRoot = await mkdtemp(join(tmpdir(), 'tap-lean-shared-cache-'))
  const sourcePackage = join(root, 'formal', '.lake', 'packages', 'mathlib', 'Mathlib.lean')
  await mkdir(join(sourcePackage, '..'), { recursive: true })
  await writeFile(sourcePackage, 'dependency\n', 'utf8')

  const verifier = new LeanVerifier(new FakeRunner())
  await verifier.prepareBaselineEnvironment(resolved, root, sharedCacheRoot)
  await rm(join(root, 'formal', '.lake', 'packages'), { recursive: true, force: true })
  await verifier.prepareBaselineEnvironment(resolved, root, sharedCacheRoot)

  assert.equal(await readFile(sourcePackage, 'utf8'), 'dependency\n')
})

test('Lean run cache reuses dependencies while keeping worktrees isolated', async () => {
  const { root, resolved } = await fixture()
  const runDirectory = await mkdtemp(join(tmpdir(), 'tap-lean-run-cache-'))
  const lane = await mkdtemp(join(tmpdir(), 'tap-lean-lane-'))
  await mkdir(join(lane, 'formal'), { recursive: true })
  const sourcePackage = join(root, 'formal', '.lake', 'packages', 'mathlib', 'Mathlib.lean')
  await mkdir(join(root, 'formal', '.lake', 'packages', 'mathlib'), { recursive: true })
  await writeFile(sourcePackage, 'source dependency\n', 'utf8')

  const verifier = new LeanVerifier(new FakeRunner())
  await verifier.prepareRunEnvironment(resolved, root, runDirectory)
  await verifier.hydrateRunEnvironment(resolved, runDirectory, lane)

  const lanePackage = join(lane, 'formal', '.lake', 'packages', 'mathlib', 'Mathlib.lean')
  assert.equal(await readFile(lanePackage, 'utf8'), 'source dependency\n')
  await writeFile(lanePackage, 'lane mutation\n', 'utf8')
  assert.equal(await readFile(sourcePackage, 'utf8'), 'source dependency\n')
})

test('checker-clean helper-only evidence is recorded without automatic branch transplantation', async () => {
  const { root, resolved } = await fixture()
  const baselineProof = [
    'import Spec',
    '',
    'theorem helper : True := by',
    '  trivial',
    '',
    'theorem top : True := by',
    '  sorry',
    '',
  ].join('\n')
  const candidateProof = baselineProof.replace(
    'theorem top : True := by',
    'theorem bridge : True := by\n  exact helper\n\ntheorem top : True := by',
  )
  await writeFile(join(root, 'formal', 'Proof.lean'), candidateProof, 'utf8')
  resolved.manifest.lean.theoremSignatureSha256 = theoremSignatureSha256(candidateProof, 'top')
  const runner = new FakeRunner(
    0,
    "'helper' does not depend on any axioms\n'bridge' does not depend on any axioms",
    'formal/Proof.lean\n',
    baselineProof,
  )
  const receipt = await new LeanVerifier(runner).check(resolved, root, 1, undefined, 'deadbeef')
  assert.equal(receipt.obligationsClosed, 1)
  assert.equal(receipt.checkpointable, true)
  assert.deepEqual(receipt.checkpointDeclarations, ['bridge'])

  assert.equal(candidateProof.includes('theorem bridge : True := by\n  exact helper'), true)
})
