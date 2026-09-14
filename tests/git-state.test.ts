import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import type { CommandReceipt, CommandRunner, CommandSpec } from '@tokens-as-parameters/core-state-git'
import { GitState } from '@tokens-as-parameters/core-state-git'
import {
  applyParameterUpdatePlan,
  createTextParameterState,
} from '@tokens-as-parameters/core-optimization'

const execFileAsync = promisify(execFile)

class LocalRunner implements CommandRunner {
  async run(spec: CommandSpec): Promise<CommandReceipt> {
    const executable = spec.argv[0]
    if (executable === undefined) throw new Error('empty command')
    const startedAt = Date.now()
    try {
      const result = await execFileAsync(executable, spec.argv.slice(1), {
        cwd: spec.cwd,
        encoding: 'utf8',
        maxBuffer: spec.maxOutputBytes ?? 4_000_000,
        timeout: spec.timeoutMs,
        ...(spec.signal === undefined ? {} : { signal: spec.signal }),
        ...(spec.env === undefined ? {} : { env: { ...process.env, ...spec.env } }),
      })
      return {
        argv: [...spec.argv], cwd: spec.cwd, exitCode: 0, signal: null,
        stdout: result.stdout, stderr: result.stderr,
        stdoutTruncated: false, stderrTruncated: false, durationMs: Date.now() - startedAt,
      }
    } catch (error: unknown) {
      const failure = error as { code?: number | string; signal?: NodeJS.Signals; stdout?: string; stderr?: string }
      return {
        argv: [...spec.argv], cwd: spec.cwd,
        exitCode: typeof failure.code === 'number' ? failure.code : null,
        signal: failure.signal ?? null,
        stdout: failure.stdout ?? '', stderr: failure.stderr ?? '',
        stdoutTruncated: false, stderrTruncated: false, durationMs: Date.now() - startedAt,
      }
    }
  }
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await execFileAsync('git', args, { cwd, encoding: 'utf8' })
  return result.stdout.trim()
}

test('reflection state records consumed lane tips without merging their proof trees', async () => {
  const repository = await mkdtemp(join(tmpdir(), 'tap-reflection-git-test-'))
  await git(repository, 'init', '-q')
  await git(repository, 'config', 'user.name', 'Test User')
  await git(repository, 'config', 'user.email', 'test@example.invalid')
  await writeFile(join(repository, 'Proof.lean'), 'theorem top : True := by sorry\n', 'utf8')
  await git(repository, 'add', 'Proof.lean')
  await git(repository, 'commit', '-q', '-m', 'baseline')
  const baseline = await git(repository, 'rev-parse', 'HEAD')

  await git(repository, 'switch', '-q', '-c', 'lane-r1')
  await writeFile(join(repository, 'Proof.lean'), 'theorem top : True := by trivial\n', 'utf8')
  await git(repository, 'commit', '-qam', 'lane r1')
  const laneOne = await git(repository, 'rev-parse', 'HEAD')

  await git(repository, 'switch', '-q', '-c', 'lane-r2', baseline)
  await writeFile(join(repository, 'Proof.lean'), 'theorem top : True := by simp\n', 'utf8')
  await git(repository, 'commit', '-qam', 'lane r2')
  const laneTwo = await git(repository, 'rev-parse', 'HEAD')

  const state = new GitState(new LocalRunner())
  const worktree = `${repository}-reflection-wt`
  await state.createWorktree(repository, baseline, worktree)
  const parameters = createTextParameterState({
    moduleId: 'test-agent',
    version: 'v1',
    parameters: [{
      definition: { id: 'search.plan', description: 'Search direction.', scope: 'run' },
      content: 'Explore independently.',
    }],
  })
  const plan = {
    baseStateVersion: 'v1',
    reflection: 'Both lanes closed the same goal through distinct tactics.',
    updates: [{ parameterId: 'search.plan', content: 'Preserve the checker-clean theorem.' }],
  }
  const nextParameters = applyParameterUpdatePlan(parameters, plan, 'v2')
  const decision = {
    parameterUpdate: plan,
    nextRollouts: [
      { rolloutId: 'r1', baseStateId: laneOne, task: 'Continue the trivial route.' },
      { rolloutId: 'r2', baseStateId: laneTwo, task: 'Continue the simp route.' },
    ],
  }
  const reflection = await state.createReflectionState(
    repository,
    worktree,
    'run-test',
    1,
    baseline,
    [laneOne, laneTwo],
    decision,
    nextParameters,
  )

  assert.deepEqual(
    (await git(repository, 'show', '-s', '--format=%P', reflection.commit)).split(' '),
    [baseline, laneOne, laneTwo],
  )
  assert.equal(await git(repository, 'show', `${reflection.commit}:Proof.lean`), 'theorem top : True := by sorry')
  assert.match(
    await git(repository, 'show', `${reflection.commit}:${reflection.path}`),
    /Both lanes closed the same goal[\s\S]*Continue the trivial route/,
  )
  assert.equal(
    await git(repository, 'rev-parse', 'refs/tokens-as-parameters/runs/run-test/reflections/e1'),
    reflection.commit,
  )
})

test('source checkpoints include new proof files but exclude credential-named artifacts', async () => {
  const repository = await mkdtemp(join(tmpdir(), 'tap-source-state-test-'))
  await git(repository, 'init', '-q')
  await git(repository, 'config', 'user.name', 'Test User')
  await git(repository, 'config', 'user.email', 'test@example.invalid')
  await writeFile(join(repository, 'Proof.lean'), 'theorem top : True := by sorry\n', 'utf8')
  await git(repository, 'add', 'Proof.lean')
  await git(repository, 'commit', '-q', '-m', 'baseline')

  await writeFile(join(repository, 'ProofView.lean'), 'theorem helper : True := by trivial\n', 'utf8')
  await writeFile(join(repository, 'api-token.md'), 'must not enter history\n', 'utf8')
  const state = new GitState(new LocalRunner())
  const commit = await state.commitSourceState(repository, 'candidate source state')

  assert.match(await git(repository, 'show', `${commit}:ProofView.lean`), /theorem helper/)
  await assert.rejects(git(repository, 'show', `${commit}:api-token.md`))
})

test('source checkpoints preserve tracked nested paths whose porcelain status starts with a space', async () => {
  const repository = await mkdtemp(join(tmpdir(), 'tap-tracked-source-state-test-'))
  await git(repository, 'init', '-q')
  await git(repository, 'config', 'user.name', 'Test User')
  await git(repository, 'config', 'user.email', 'test@example.invalid')
  await mkdir(join(repository, 'verifier'), { recursive: true })
  const proof = join(repository, 'verifier', 'SmokeProof.lean')
  await writeFile(proof, 'theorem top : True := by sorry\n', 'utf8')
  await git(repository, 'add', 'verifier/SmokeProof.lean')
  await git(repository, 'commit', '-q', '-m', 'baseline')

  await writeFile(proof, 'theorem top : True := by trivial\n', 'utf8')
  const state = new GitState(new LocalRunner())
  const commit = await state.commitSourceState(repository, 'candidate source state')

  assert.equal(
    await git(repository, 'show', `${commit}:verifier/SmokeProof.lean`),
    'theorem top : True := by trivial',
  )
  assert.equal(await git(repository, 'status', '--porcelain'), '')
})

test('source checkpoints commit tracked proof-source deletions', async () => {
  const repository = await mkdtemp(join(tmpdir(), 'tap-deleted-source-state-test-'))
  await git(repository, 'init', '-q')
  await git(repository, 'config', 'user.name', 'Test User')
  await git(repository, 'config', 'user.email', 'test@example.invalid')
  await writeFile(join(repository, 'Scratch.lean'), 'theorem scratch : True := by trivial\n', 'utf8')
  await git(repository, 'add', 'Scratch.lean')
  await git(repository, 'commit', '-q', '-m', 'baseline')

  await unlink(join(repository, 'Scratch.lean'))
  const state = new GitState(new LocalRunner())
  const commit = await state.commitSourceState(repository, 'remove obsolete proof scratch')

  await assert.rejects(git(repository, 'show', `${commit}:Scratch.lean`))
  assert.equal(await git(repository, 'status', '--porcelain'), '')
})

test('recorded insights become Git state nodes despite the protected token path filter', async () => {
  const repository = await mkdtemp(join(tmpdir(), 'tap-insight-state-test-'))
  await git(repository, 'init', '-q')
  await git(repository, 'config', 'user.name', 'Test User')
  await git(repository, 'config', 'user.email', 'test@example.invalid')
  await writeFile(join(repository, 'Proof.lean'), 'theorem top : True := by sorry\n', 'utf8')
  await git(repository, 'add', 'Proof.lean')
  await git(repository, 'commit', '-q', '-m', 'baseline')

  const state = new GitState(new LocalRunner())
  await writeFile(join(repository, 'Proof.lean'), 'theorem top : True := by trivial\n', 'utf8')
  const insight = await state.recordInsight(
    repository,
    'run-test',
    1,
    'r1',
    'Reduced the goal',
    'The remaining equality follows after exposing the normalization helper.',
  )

  assert.match(
    await git(repository, 'show', `${insight.commit}:${insight.path}`),
    /Reduced the goal[\s\S]*normalization helper/,
  )
  assert.equal(
    await git(repository, 'show', `${insight.commit}:Proof.lean`),
    'theorem top : True := by trivial',
  )
  assert.equal(await git(repository, 'status', '--porcelain'), '')
})

test('experiment snapshot requires a clean source and initializes an isolated baseline', async () => {
  const source = await mkdtemp(join(tmpdir(), 'tap-experiment-source-test-'))
  await git(source, 'init', '-q')
  await git(source, 'config', 'user.name', 'Test User')
  await git(source, 'config', 'user.email', 'test@example.invalid')
  await writeFile(join(source, 'case.json'), '{}\n', 'utf8')
  await git(source, 'add', 'case.json')
  await git(source, 'commit', '-q', '-m', 'case baseline')

  const state = new GitState(new LocalRunner())
  const sourceCommit = await state.requireCleanCommit(source)
  assert.equal(sourceCommit, await git(source, 'rev-parse', 'HEAD'))
  await writeFile(join(source, 'case.json'), '{ "dirty": true }\n', 'utf8')
  await assert.rejects(state.requireCleanCommit(source), /uncommitted changes/)

  const isolated = await mkdtemp(join(tmpdir(), 'tap-experiment-isolated-test-'))
  await writeFile(join(isolated, 'case.json'), '{}\n', 'utf8')
  const isolatedCommit = await state.initializeRepository(isolated, 'experiment baseline')
  assert.equal(isolatedCommit, await git(isolated, 'rev-parse', 'HEAD'))
  assert.equal(await git(isolated, 'status', '--porcelain'), '')
})
