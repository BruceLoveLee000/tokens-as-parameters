import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-subprocess'
import type { SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'

export interface CommandReceipt {
  argv: string[]
  cwd: string
  exitCode: number | null
  signal: string | null
  stdout: string
  stderr: string
  stdoutTruncated: boolean
  stderrTruncated: boolean
  durationMs: number
}

export interface CommandSpec {
  argv: readonly string[]
  cwd: string
  env?: Readonly<Record<string, string>>
  signal?: AbortSignal
  timeoutMs?: number
  maxOutputBytes?: number
}

export interface CommandRunner {
  run(spec: CommandSpec): Promise<CommandReceipt>
}

export class DshCommandRunner implements CommandRunner {
  constructor(private readonly ctx: Context) {}

  async run(spec: CommandSpec): Promise<CommandReceipt> {
    if (spec.argv.length === 0 || spec.argv[0] === undefined) {
      throw new Error('command argv must contain an executable')
    }
    const startedAt = Date.now()
    const timeoutSignal = spec.timeoutMs === undefined
      ? undefined
      : AbortSignal.timeout(spec.timeoutMs)
    const signals = [spec.signal, timeoutSignal].filter((value): value is AbortSignal => value !== undefined)
    const signal = signals.length === 0 ? undefined : AbortSignal.any(signals)
    const executable = await this.ctx.subprocess.resolveExecutable(spec.argv[0], spec.env, signal)
    const maxBytes = spec.maxOutputBytes ?? 4_000_000
    const handle = this.ctx.subprocess.spawn({
      argv: [executable, ...spec.argv.slice(1)],
      cwd: spec.cwd,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes },
        stderr: { maxBytes },
      },
      graceMs: 2_000,
      ...(signal === undefined ? {} : { signal }),
      ...(spec.env === undefined ? {} : { env: spec.env }),
    } satisfies SubprocessSpawnSpec)
    const outcome = await handle.done
    const stdout = handle.collected.stdout?.readFrom(0)
    const stderr = handle.collected.stderr?.readFrom(0)
    if (stdout === undefined || stderr === undefined) {
      throw new Error('subprocess provider did not return collected output')
    }
    return {
      argv: [...spec.argv],
      cwd: spec.cwd,
      exitCode: outcome.exitCode,
      signal: outcome.signal,
      stdout: stdout.text,
      stderr: stderr.text,
      stdoutTruncated: stdout.lossy,
      stderrTruncated: stderr.lossy,
      durationMs: Date.now() - startedAt,
    }
  }
}
