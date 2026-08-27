import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import type { CommandReceipt, CommandRunner, CommandSpec } from '@tokens-as-parameters/core-state-git'
import { GitState } from '@tokens-as-parameters/core-state-git'
import { transplantDeclarations } from '@tokens-as-parameters/verifier-lean'

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

test('semantic consolidation transplants named Lean declarations without replacing frozen context', () => {
  const base = [
    'import FrozenSpec',
    '',
    'theorem first : True := by',
    '  sorry',
    '',
    'theorem second : True := by',
    '  sorry',
    '',
  ].join('\n')
  const candidate = base.replace('theorem second : True := by\n  sorry', 'theorem second : True := by\n  trivial')
  const merged = transplantDeclarations(base, candidate, ['second'])
  assert.equal(merged.includes('theorem first : True := by\n  sorry'), true)
  assert.equal(merged.includes('theorem second : True := by\n  trivial'), true)
  assert.equal(merged.startsWith('import FrozenSpec'), true)
})

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
  const reflection = await state.createReflectionState(
    repository,
    worktree,
    'run-test',
    1,
    baseline,
    [laneOne, laneTwo],
    {
      reflection: 'Both lanes closed the same goal through distinct tactics.',
      commonPrompt: 'Preserve the checker-clean theorem.',
      routes: [
        { rolloutId: 'r1', prompt: 'Generalize the direct proof.' },
        { rolloutId: 'r2', prompt: 'Test simplifier robustness.' },
      ],
    },
  )

  assert.deepEqual(
    (await git(repository, 'show', '-s', '--format=%P', reflection.commit)).split(' '),
    [baseline, laneOne, laneTwo],
  )
  assert.equal(await git(repository, 'show', `${reflection.commit}:Proof.lean`), 'theorem top : True := by sorry')
  assert.match(
    await git(repository, 'show', `${reflection.commit}:${reflection.path}`),
    /Both lanes closed the same goal/,
  )
  assert.equal(
    await git(repository, 'rev-parse', 'refs/tokens-as-parameters/runs/run-test/reflections/e1'),
    reflection.commit,
  )
})
