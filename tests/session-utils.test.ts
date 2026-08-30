import assert from 'node:assert/strict'
import test from 'node:test'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { sessionTokens, sessionUsage } from '@tokens-as-parameters/core-telemetry'
import { shouldEnterProverSubmitOnly } from '@tokens-as-parameters/proof-roles'

test('token accounting preserves input, output, cache, and reasoning dimensions', () => {
  const events = [{
    type: 'assistant/message',
    data: {
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        cacheReadTokens: 30,
        cacheWriteTokens: 5,
        reasoningTokens: 12,
      },
    },
  }] as unknown as SessionEvent[]
  assert.deepEqual(sessionUsage(events), {
    inputTokens: 100,
    outputTokens: 20,
    cacheReadTokens: 30,
    cacheWriteTokens: 5,
    reasoningTokens: 12,
    totalTokens: 155,
  })
  assert.equal(sessionTokens(events), 155)
})

test('prover enters submit-only mode at the cumulative lane boundary', () => {
  assert.equal(shouldEnterProverSubmitOnly(19_999_999, 20_000_000), false)
  assert.equal(shouldEnterProverSubmitOnly(20_000_000, 20_000_000), true)
  assert.equal(shouldEnterProverSubmitOnly(20_000_001, 20_000_000), true)
})
