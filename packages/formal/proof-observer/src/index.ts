import { appendFile, mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import {
  type ProofDomainEvent,
  type ProofRunSnapshot,
  type RunState,
} from '@tokens-as-parameters/proof-contracts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    proofObserver: ProofObserverService
  }
}

interface SessionLink {
  runId: string
  epoch: number
  rolloutId: string
  role: 'prover' | 'reflector' | 'reviewer'
}

function describe(event: SessionEvent): string {
  if (event.type === 'tool/call') return `tool call: ${event.data.name}`
  if (event.type === 'tool/result') return `tool result: ${event.data.message.content[0].isError === true ? 'error' : 'success'}`
  if (event.type === 'turn/end') return `turn ended: ${event.data.reason.kind}`
  if (event.type === 'assistant/message') return 'assistant step completed'
  return event.type
}

export default class ProofObserverService extends Service {
  static inject = ['agents']

  private readonly runDirectories = new Map<string, string>()
  private readonly runStates = new Map<string, RunState>()
  private readonly sequences = new Map<string, number>()
  private readonly sessions = new Map<string, SessionLink>()
  private pendingWrite = Promise.resolve()

  constructor(ctx: Context) {
    super(ctx, 'proofObserver')
    ctx.on('session/event', (session, event) => {
      const link = this.sessions.get(String(session.id))
      if (link === undefined) return
      void this.emit({
        runId: link.runId,
        type: `dsh/session/${event.type}`,
        state: this.runStates.get(link.runId) ?? 'PREPARING',
        message: describe(event),
        epoch: link.epoch,
        rolloutId: link.rolloutId,
        sessionId: String(session.id),
        data: event.type === 'assistant/message'
          ? { usage: event.data.usage }
          : event.type === 'tool/call'
            ? { name: event.data.name, callId: String(event.data.callId) }
            : event.type === 'turn/end'
              ? { reason: event.data.reason }
              : undefined,
      })
    })
  }

  async registerRun(runId: string, directory: string, state: RunState): Promise<void> {
    this.runDirectories.set(runId, directory)
    this.runStates.set(runId, state)
    this.sequences.set(runId, 0)
    await mkdir(directory, { recursive: true })
  }

  setState(runId: string, state: RunState): void {
    this.runStates.set(runId, state)
  }

  attachSession(agent: Agent, link: SessionLink): () => void {
    const id = String(agent.id)
    this.sessions.set(id, link)
    return () => { this.sessions.delete(id) }
  }

  async emit(input: Omit<ProofDomainEvent, 'sequence' | 'timestamp'>): Promise<ProofDomainEvent> {
    const sequence = (this.sequences.get(input.runId) ?? 0) + 1
    this.sequences.set(input.runId, sequence)
    const event: ProofDomainEvent = {
      ...input,
      sequence,
      timestamp: new Date().toISOString(),
    }
    const directory = this.runDirectories.get(input.runId)
    if (directory !== undefined) {
      this.pendingWrite = this.pendingWrite.then(() => appendFile(
        join(directory, 'events.jsonl'),
        `${JSON.stringify(event)}\n`,
        'utf8',
      ))
      await this.pendingWrite
    }
    return event
  }

  async persistSnapshot(directory: string, snapshot: ProofRunSnapshot): Promise<void> {
    await mkdir(directory, { recursive: true })
    const path = join(directory, 'run.json')
    const temporary = join(dirname(path), `.run-${process.pid}.tmp`)
    await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
    await rename(temporary, path)
  }
}
