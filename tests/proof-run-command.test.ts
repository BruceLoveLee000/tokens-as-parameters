import assert from 'node:assert/strict'
import test from 'node:test'
import type { Context } from '@deepseek-ai/cordis'
import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import { apply } from '../packages/formal/tool-proof-run/src/index.ts'

function harness(ownerSessionId = 'owner-session'): {
  command: () => CommandDefinition
  stopped: string[]
} {
  let command: CommandDefinition | undefined
  const stopped: string[] = []
  const ctx = {
    commands: {
      register(definition: CommandDefinition) {
        command = definition
        return () => undefined
      },
    },
    systemPrompt: { section: () => undefined },
    tools: { register: () => undefined },
    proofRuns: {
      async get(runId: string) {
        return runId === 'run-1' ? { runId, ownerSessionId, state: 'PROVING' } : undefined
      },
      async stop(runId: string) {
        stopped.push(runId)
        return { runId, ownerSessionId, state: 'ABORTED' }
      },
    },
  } as unknown as Context
  apply(ctx)
  return {
    command: () => {
      assert.ok(command)
      return command
    },
    stopped,
  }
}

test('proof-stop is a direct owner-scoped DSH command', async () => {
  const testHarness = harness()
  const command = testHarness.command()
  assert.equal(command.name, 'proof-stop')

  const result = await command.handler({
    agent: { id: 'owner-session' },
    rawInput: ' run-1 ',
  } as never)

  assert.deepEqual(result, { kind: 'success', text: 'proof run run-1: ABORTED' })
  assert.deepEqual(testHarness.stopped, ['run-1'])
})

test('proof-stop rejects a different owner before touching the runtime', async () => {
  const testHarness = harness()
  const result = await testHarness.command().handler({
    agent: { id: 'other-session' },
    rawInput: 'run-1',
  } as never)

  assert.deepEqual(result, {
    kind: 'error',
    text: 'proof run run-1 does not belong to this session',
  })
  assert.deepEqual(testHarness.stopped, [])
})
