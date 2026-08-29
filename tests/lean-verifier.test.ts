import assert from 'node:assert/strict'
import { access, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
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
  transplantDeclarations,
} from '@tokens-as-parameters/verifier-lean'

class FakeRunner implements CommandRunner {
  readonly calls: CommandSpec[] = []

  constructor(
    private readonly buildExitCode = 0,
    private readonly axiomOutput = "'helper' does not depend on any axioms\n'top' does not depend on any axioms",
    private readonly changedPaths = '',
    private readonly baselineProof?: string,
  ) {}

  async run(spec: CommandSpec): Promise<CommandReceipt> {
    this.calls.push(spec)
    const audit = spec.argv.includes('lean')
    const changed = spec.argv[0] === 'git' && spec.argv[1] === 'diff'
    const show = spec.argv[0] === 'git' && spec.argv[1] === 'show'
    return {
      argv: [...spec.argv],
      cwd: spec.cwd,
      exitCode: show && this.baselineProof === undefined ? 1 : audit || show ? 0 : this.buildExitCode,
      signal: null,
      stdout: audit ? this.axiomOutput : changed ? this.changedPaths : show ? this.baselineProof ?? '' : '',
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

test('forbidden obligation dependencies do not count as trusted progress', async () => {
  const { root, resolved } = await fixture()
  const runner = new FakeRunner(0, "'helper' does not depend on any axioms\n'top' depends on axioms: [sorryAx]")
  const receipt = await new LeanVerifier(runner).check(resolved, root)
  assert.equal(receipt.finalAccepted, false)
  assert.equal(receipt.obligationsClosed, 1)
  assert.deepEqual(receipt.openObligations, ['top'])
  assert.deepEqual(receipt.axiomAudit?.forbidden, ['sorryAx'])
})

test('candidate changes outside the declared editable surface are rejected', async () => {
  const { root, resolved } = await fixture()
  const runner = new FakeRunner(
    0,
    "'helper' does not depend on any axioms\n'top' does not depend on any axioms",
    'formal/Injected.lean\n',
  )
  const receipt = await new LeanVerifier(runner).check(resolved, root, 0, undefined, 'deadbeef')
  assert.equal(receipt.finalAccepted, false)
  assert.equal(receipt.findings.some(finding => finding.kind === 'unauthorized-change'), true)
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

test('checker-clean helper-only progress is checkpointable and semantically transplantable', async () => {
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

  const merged = transplantDeclarations(baselineProof, candidateProof, receipt.checkpointDeclarations)
  assert.equal(merged.includes('theorem bridge : True := by\n  exact helper'), true)
  assert.equal(merged.indexOf('theorem bridge'), merged.lastIndexOf('theorem bridge'))
  assert.equal(merged.indexOf('theorem bridge') < merged.indexOf('theorem top'), true)
})
