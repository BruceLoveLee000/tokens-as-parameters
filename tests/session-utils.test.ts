import assert from 'node:assert/strict'
import test from 'node:test'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { sessionTokens, sessionUsage } from '../packages/dsh-formal-proof/src/session-utils.js'

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
