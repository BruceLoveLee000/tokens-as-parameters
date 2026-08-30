import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { CommandRunner } from './command-runner.js'
import type {
  OptimizationDecision,
  StateNode,
  TextParameterState,
} from '@tokens-as-parameters/core-optimization'

export { DshCommandRunner } from './command-runner.js'
export type { CommandReceipt, CommandRunner, CommandSpec } from './command-runner.js'

export type GitStateNode = StateNode

async function expectSuccess(runner: CommandRunner, argv: readonly string[], cwd: string, signal?: AbortSignal): Promise<string> {
  const receipt = await runner.run({
    argv,
    cwd,
    timeoutMs: 10 * 60_000,
    maxOutputBytes: 4_000_000,
    ...(signal === undefined ? {} : { signal }),
  })
  if (receipt.exitCode !== 0 || receipt.signal !== null) {
    throw new Error(`${argv.join(' ')} failed: ${(receipt.stderr || receipt.stdout).slice(-2_000)}`)
  }
  return receipt.stdout.trim()
}

export class GitState {
  constructor(private readonly runner: CommandRunner) {}

  async initializeRepository(root: string, message: string, signal?: AbortSignal): Promise<string> {
    await expectSuccess(this.runner, ['git', 'init', '--quiet'], root, signal)
    await expectSuccess(this.runner, ['git', 'add', '--all'], root, signal)
    await expectSuccess(this.runner, [
      'git',
      '-c', 'user.name=Tokens as Parameters Experiment',
      '-c', 'user.email=experiment@tokens-as-parameters.invalid',
      'commit', '--quiet', '--no-verify', '-m', message,
    ], root, signal)
    return this.head(root, signal)
  }

  async requireCleanCommit(root: string, signal?: AbortSignal): Promise<string> {
    const commit = await this.resolve(root, 'HEAD', signal)
    const status = await expectSuccess(this.runner, [
      'git', 'status', '--porcelain=v1', '--untracked-files=all', '--', '.',
    ], root, signal)
    if (status.length > 0) {
      throw new Error('experiment case has uncommitted changes; commit the case snapshot before starting a run')
    }
    return commit
  }

  head(root: string, signal?: AbortSignal): Promise<string> {
    return expectSuccess(this.runner, ['git', 'rev-parse', 'HEAD'], root, signal)
  }

  resolve(root: string, revision: string, signal?: AbortSignal): Promise<string> {
    return expectSuccess(this.runner, ['git', 'rev-parse', `${revision}^{commit}`], root, signal)
  }

  async createWorktree(root: string, revision: string, target: string, signal?: AbortSignal): Promise<void> {
    await mkdir(dirname(target), { recursive: true })
    await expectSuccess(this.runner, ['git', 'worktree', 'add', '--detach', target, revision], root, signal)
  }

  async removeWorktree(root: string, target: string): Promise<void> {
    const receipt = await this.runner.run({
      argv: ['git', 'worktree', 'remove', '--force', target],
      cwd: root,
      timeoutMs: 2 * 60_000,
    })
    if (receipt.exitCode !== 0) {
      await this.runner.run({ argv: ['git', 'worktree', 'prune'], cwd: root, timeoutMs: 60_000 })
    }
  }

  async changedFiles(worktree: string, signal?: AbortSignal): Promise<string[]> {
    const output = await expectSuccess(this.runner, ['git', 'status', '--porcelain=v1'], worktree, signal)
    return output.length === 0
      ? []
      : output.split('\n').map(line => line.slice(3).trim()).filter(Boolean)
  }

  async stateNodes(
    worktree: string,
    limit = 200,
    sinceExclusive?: string,
    signal?: AbortSignal,
  ): Promise<GitStateNode[]> {
    const boundedLimit = Math.max(1, Math.min(1_000, Math.floor(limit)))
    const output = await expectSuccess(this.runner, [
      'git', 'log', `--max-count=${boundedLimit}`, '--format=%H%x09%P%x09%aI%x09%s',
      ...(sinceExclusive === undefined ? [] : [`${sinceExclusive}..HEAD`]),
    ], worktree, signal)
    if (output.length === 0) return []
    return output.split('\n').flatMap(line => {
      const [commit, parents = '', authoredAt, ...summary] = line.split('\t')
      if (commit === undefined || authoredAt === undefined) return []
      return [{
        commit,
        parents: parents.length === 0 ? [] : parents.split(' '),
        authoredAt,
        summary: summary.join('\t'),
      }]
    })
  }

  async inspectTransition(
    worktree: string,
    commit: string,
    maxCharacters = 30_000,
    signal?: AbortSignal,
  ): Promise<string> {
    const output = await expectSuccess(this.runner, [
      'git', 'show', '--no-ext-diff', '--format=fuller', '--stat', '--patch', commit,
    ], worktree, signal)
    const limit = Math.max(1_000, Math.min(100_000, Math.floor(maxCharacters)))
    return output.length <= limit ? output : `${output.slice(0, limit)}\n\n[transition truncated at ${limit} characters]`
  }

  async readStateFile(
    worktree: string,
    commit: string,
    path: string,
    maxCharacters = 30_000,
    signal?: AbortSignal,
  ): Promise<string> {
    if (path.startsWith('/') || path.split('/').includes('..')) throw new Error('state file path must be repository-relative')
    const output = await expectSuccess(this.runner, ['git', 'show', `${commit}:${path}`], worktree, signal)
    const limit = Math.max(1_000, Math.min(100_000, Math.floor(maxCharacters)))
    return output.length <= limit ? output : `${output.slice(0, limit)}\n\n[file truncated at ${limit} characters]`
  }

  async compareStateFile(
    worktree: string,
    leftCommit: string,
    rightCommit: string,
    path: string,
    maxCharacters = 30_000,
    signal?: AbortSignal,
  ): Promise<string> {
    if (path.startsWith('/') || path.split('/').includes('..')) throw new Error('state file path must be repository-relative')
    const receipt = await this.runner.run({
      argv: ['git', 'diff', '--no-ext-diff', leftCommit, rightCommit, '--', path],
      cwd: worktree,
      timeoutMs: 60_000,
      maxOutputBytes: 4_000_000,
      ...(signal === undefined ? {} : { signal }),
    })
    if (receipt.exitCode === null || ![0, 1].includes(receipt.exitCode) || receipt.signal !== null) {
      throw new Error('git state-file diff failed')
    }
    const output = receipt.stdout
    const limit = Math.max(1_000, Math.min(100_000, Math.floor(maxCharacters)))
    return output.length <= limit ? output : `${output.slice(0, limit)}\n\n[diff truncated at ${limit} characters]`
  }

  async commitPaths(
    worktree: string,
    paths: readonly string[],
    message: string,
    signal?: AbortSignal,
  ): Promise<string> {
    if (paths.length === 0) return this.head(worktree, signal)
    await expectSuccess(this.runner, ['git', 'add', '--force', '--all', '--', ...paths], worktree, signal)
    const diff = await this.runner.run({
      argv: ['git', 'diff', '--cached', '--quiet'],
      cwd: worktree,
      timeoutMs: 60_000,
      ...(signal === undefined ? {} : { signal }),
    })
    if (diff.exitCode === 0) return this.head(worktree, signal)
    if (diff.exitCode !== 1) throw new Error('git diff --cached --quiet failed')
    await expectSuccess(this.runner, [
      'git',
      '-c', 'user.name=Tokens as Parameters Agent',
      '-c', 'user.email=agent@tokens-as-parameters.invalid',
      'commit', '--no-verify', '-m', message,
    ], worktree, signal)
    return this.head(worktree, signal)
  }

  async commitSourceState(worktree: string, message: string, signal?: AbortSignal): Promise<string> {
    const changed = await this.changedFiles(worktree, signal)
    const sourceExtensions = /\.(?:lean|md|txt|json|toml|ya?ml)$/i
    const credentialName = /(^|\/)(?:\.env(?:\..*)?|.*(?:credential|secret|token|api[-_]?key).*)$/i
    const generatedPath = /(^|\/)(?:\.lake|node_modules|build|dist|lib|logs?|traces?)(\/|$)/i
    const paths = changed.filter(path => sourceExtensions.test(path))
      .filter(path => !credentialName.test(path) && !generatedPath.test(path))
    return this.commitPaths(worktree, paths, message, signal)
  }

  async recordInsight(
    worktree: string,
    runId: string,
    epoch: number,
    rolloutId: string,
    summary: string,
    insight: string,
    signal?: AbortSignal,
  ): Promise<{ commit: string; path: string }> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const path = join('.tokens-as-parameters', 'insights', `epoch-${epoch}`, rolloutId, `${timestamp}.md`)
    const absolute = join(worktree, path)
    await mkdir(dirname(absolute), { recursive: true })
    await writeFile(absolute, [
      '---',
      `runId: ${runId}`,
      `epoch: ${epoch}`,
      `rolloutId: ${rolloutId}`,
      `createdAt: ${new Date().toISOString()}`,
      '---',
      '',
      `# ${summary.trim()}`,
      '',
      insight.trim(),
      '',
    ].join('\n'), 'utf8')
    // This path is generated by the Runtime from structured arguments. Commit it
    // explicitly: the generic source checkpoint intentionally rejects paths whose
    // names contain "token", which includes our own .tokens-as-parameters folder.
    const commit = await this.commitPaths(
      worktree,
      [path],
      `state(${rolloutId}): ${summary.trim().slice(0, 72)}`,
      signal,
    )
    return { commit, path }
  }

  async createReflectionState(
    repositoryRoot: string,
    worktree: string,
    runId: string,
    epoch: number,
    trustedCommit: string,
    laneCommits: readonly string[],
    decision: OptimizationDecision,
    parameterState: TextParameterState,
    signal?: AbortSignal,
  ): Promise<{ commit: string; path: string }> {
    const path = join('.tokens-as-parameters', 'reflections', `epoch-${epoch}.md`)
    const absolute = join(worktree, path)
    await mkdir(dirname(absolute), { recursive: true })
    await writeFile(absolute, [
      '---',
      `runId: ${runId}`,
      `epoch: ${epoch}`,
      `createdAt: ${new Date().toISOString()}`,
      `trustedProofCommit: ${trustedCommit}`,
      `laneCommits: [${laneCommits.join(', ')}]`,
      `baseParameterState: ${decision.parameterUpdate.baseStateVersion}`,
      `nextParameterState: ${parameterState.version}`,
      '---',
      '',
      '# Comparative reflection',
      '',
      decision.parameterUpdate.reflection.trim(),
      '',
      '## Atomic parameter updates',
      '',
      ...(decision.parameterUpdate.updates.length === 0
        ? ['No parameter content changed.', '']
        : decision.parameterUpdate.updates.flatMap(update => [
            `### ${update.parameterId}`,
            '',
            update.content.trim(),
            '',
          ])),
      '## Next rollout schedule',
      '',
      ...decision.nextRollouts.flatMap(directive => [
        `### ${directive.rolloutId} from ${directive.baseStateId}`,
        '',
        directive.task.trim(),
        '',
      ]),
      '## Active parameter state',
      '',
      ...parameterState.parameters.flatMap(parameter => [
        `### ${parameter.id} @ ${parameter.revision}${parameter.requiresFeedback ? '' : ' (frozen)'}`,
        '',
        parameter.content.trim(),
        '',
      ]),
    ].join('\n'), 'utf8')
    const temporaryCommit = await this.commitPaths(
      worktree,
      [path],
      `reflection: epoch ${epoch} search direction`,
      signal,
    )
    const tree = await expectSuccess(this.runner, ['git', 'rev-parse', `${temporaryCommit}^{tree}`], worktree, signal)
    const parents = [...new Set([trustedCommit, ...laneCommits])]
    const commit = await expectSuccess(this.runner, [
      'git',
      '-c', 'user.name=Tokens as Parameters Agent',
      '-c', 'user.email=agent@tokens-as-parameters.invalid',
      'commit-tree', tree,
      ...parents.flatMap(parent => ['-p', parent]),
      '-m', `reflection: epoch ${epoch} search direction`,
    ], worktree, signal)
    const ref = `refs/tokens-as-parameters/runs/${runId}/reflections/e${epoch}`
    await expectSuccess(this.runner, ['git', 'update-ref', ref, commit], repositoryRoot, signal)
    return { commit, path }
  }
}
