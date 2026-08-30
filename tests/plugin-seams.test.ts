import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createTextParameterContextSnapshot,
  createTextParameterState,
  neutralOptimizationDecision,
  validateOptimizationDecision,
  type OptimizationLane,
} from '@tokens-as-parameters/core-optimization'
import {
  RUN_SCHEMA_VERSION,
  type ProofReceipt,
} from '@tokens-as-parameters/proof-contracts'
import { evaluateLeanProofLoss } from '@tokens-as-parameters/loss-lean-dual'

const usage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
}

function optimizerFixture() {
  const parameters = createTextParameterState({
    moduleId: 'test-prover',
    version: 'v1',
    parameters: [{
      definition: { id: 'route', description: 'Next rollout route.', scope: 'lane' },
      content: 'Explore independently.',
    }],
  })
  const snapshot = createTextParameterContextSnapshot({
    id: 'run/e1/r1',
    state: parameters,
    parameterIds: ['route'],
  })
  const lanes: OptimizationLane[] = [{
    rolloutId: 'r1',
    sessionId: 'session-r1',
    epoch: 1,
    commit: 'candidate-r1',
    tokens: 0,
    tokenUsage: usage,
    contextSnapshot: snapshot,
    evaluation: {
      objective: 'proof',
      verdict: 'progress',
      summary: 'one obligation closed',
      metrics: {},
      evidence: {},
    },
    traceTail: [],
  }]
  const eligibleStates = [
    { id: 'trusted', status: 'VERIFIED' as const, summary: 'trusted baseline' },
    { id: 'candidate-r1', status: 'VERIFIED' as const, summary: 'lane progress', rolloutId: 'r1' },
  ]
  return { parameters, lanes, eligibleStates }
}

test('Optimizer plugin validates parameter updates and independently selects rollout parents', () => {
  const fixture = optimizerFixture()
  const decision = validateOptimizationDecision({
    parameterUpdate: {
      baseStateVersion: 'v1',
      reflection: 'The candidate contains useful verified progress.',
      updates: [{ parameterId: 'route', content: 'Continue the verified decomposition.' }],
    },
    nextRollouts: [{
      rolloutId: 'r1',
      baseStateId: 'candidate-r1',
      task: 'Close the remaining theorem from this parent.',
    }],
  }, fixture)
  assert.equal(decision.nextRollouts[0]?.baseStateId, 'candidate-r1')
  assert.throws(() => validateOptimizationDecision({
    ...decision,
    nextRollouts: [{ ...decision.nextRollouts[0]!, baseStateId: 'invalid-candidate' }],
  }, fixture), /ineligible/)
  assert.equal(neutralOptimizationDecision(fixture).nextRollouts[0]?.baseStateId, 'candidate-r1')
})

function receipt(overrides: Partial<ProofReceipt> = {}): ProofReceipt {
  return {
    schemaVersion: RUN_SCHEMA_VERSION,
    checkedAt: '2026-08-30T00:00:00.000Z',
    caseId: 'test-case',
    claimScope: 'lean-model-vs-spec',
    worktree: '/tmp/test-worktree',
    build: {
      argv: ['lake', 'build'],
      cwd: '/tmp/test-worktree',
      exitCode: 0,
      signal: null,
      stdout: '',
      stderr: '',
      stdoutTruncated: false,
      stderrTruncated: false,
      durationMs: 1,
    },
    lockedInputsMatch: true,
    theoremSignatureMatches: true,
    obligationsClosed: 1,
    obligationsTotal: 2,
    closedObligations: ['helper'],
    openObligations: ['top'],
    verifiedDeclarations: ['helper'],
    checkpointDeclarations: [],
    findings: [],
    checkpointable: true,
    finalAccepted: false,
    ...overrides,
  }
}

test('dual Loss requires white-box approval on every rollout and preserves semantic progress', () => {
  const missingJudge = evaluateLeanProofLoss('lean-dual-check', {
    receipt: receipt(),
    baselineClosed: 0,
  }, true)
  assert.equal(missingJudge.verdict, 'invalid')
  assert.equal(missingJudge.candidateStatus, 'INVALID')

  const progress = evaluateLeanProofLoss('lean-dual-check', {
    receipt: receipt(),
    baselineClosed: 0,
    whitebox: {
      approved: true,
      risk: 'low',
      findings: [],
      recommendation: 'Continue from this candidate.',
    },
  }, true)
  assert.equal(progress.verdict, 'progress')
  assert.equal(progress.candidateStatus, 'VERIFIED')

  const solved = evaluateLeanProofLoss('lean-dual-check', {
    receipt: receipt({
      obligationsClosed: 2,
      closedObligations: ['helper', 'top'],
      openObligations: [],
      finalAccepted: true,
    }),
    baselineClosed: 1,
    whitebox: {
      approved: true,
      risk: 'low',
      findings: [],
      recommendation: 'Accept.',
    },
  }, true)
  assert.equal(solved.verdict, 'solved')
})
