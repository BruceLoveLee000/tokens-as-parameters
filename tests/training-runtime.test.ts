import assert from 'node:assert/strict'
import test from 'node:test'
import { runTrainingLoop } from '@tokens-as-parameters/core-training-runtime'

test('core training runtime composes rollout, evaluation, optimization, and state update without domain semantics', async () => {
  const events: string[] = []
  const result = await runTrainingLoop<number, number, number, number, string>({
    initialState: 1,
    rolloutIds: ['r1', 'r2'],
    maxParallel: 2,
    signal: new AbortController().signal,
    hooks: {
      async rollout(context, rolloutId) {
        events.push(`rollout:${context.epoch}:${rolloutId}:${context.state}`)
        return context.state + (rolloutId === 'r1' ? 1 : 2)
      },
      async evaluate(_context, rolloutId, candidate) {
        events.push(`evaluate:${rolloutId}:${candidate}`)
        return candidate * 10
      },
      async afterEvaluation(context, group) {
        return context.epoch === 2
          ? { kind: 'complete', result: `done:${group.map(item => item.evaluation).join(',')}` }
          : { kind: 'continue' }
      },
      async optimize(_context, group) {
        events.push(`optimize:${group.map(item => item.evaluation).join(',')}`)
        return Math.max(...group.map(item => item.evaluation))
      },
      async apply(_context, _group, decision) {
        events.push(`apply:${decision}`)
        return decision / 10
      },
      async finishEpoch(context) {
        events.push(`finish:${context.epoch}`)
      },
    },
  })

  assert.equal(result, 'done:40,50')
  assert.deepEqual(events.filter(event => event.startsWith('optimize:')), ['optimize:20,30'])
  assert.deepEqual(events.filter(event => event.startsWith('finish:')), ['finish:1', 'finish:2'])
})

test('core training runtime releases partial candidates after evaluation failure', async () => {
  const released: number[][] = []
  await assert.rejects(runTrainingLoop<number, number, number, number, void>({
    initialState: 0,
    rolloutIds: ['r1', 'r2'],
    maxParallel: 1,
    signal: new AbortController().signal,
    hooks: {
      async rollout(_context, rolloutId) {
        return rolloutId === 'r1' ? 1 : 2
      },
      async evaluate(_context, rolloutId, candidate) {
        if (rolloutId === 'r2') throw new Error('evaluation failed')
        return candidate
      },
      async optimize() { return 0 },
      async apply() { return 0 },
      async finishEpoch(_context, candidates) {
        released.push([...candidates])
      },
    },
  }), /evaluation failed/)
  assert.deepEqual(released, [[1, 2]])
})
