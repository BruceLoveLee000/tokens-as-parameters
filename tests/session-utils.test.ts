import assert from 'node:assert/strict'
import test from 'node:test'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { sessionSteps, sessionTokens, sessionUsage } from '@tokens-as-parameters/core-telemetry'
import { shouldEnterProverSubmitOnly } from '@tokens-as-parameters/prover-code-agent'

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
  assert.equal(sessionSteps(events), 1)
})

test('prover enters submit-only mode at the model-step depth boundary', () => {
  assert.equal(shouldEnterProverSubmitOnly(199, 200), false)
  assert.equal(shouldEnterProverSubmitOnly(200, 200), true)
  assert.equal(shouldEnterProverSubmitOnly(201, 200), true)
})
