import { z } from 'zod'
import type {} from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-session-projection/types'
import type { ProofRunSnapshot } from './index.ts'

export const ProofRunViewSchema = z.object({
  runId: z.string(),
  caseId: z.string(),
  state: z.enum([
    'PREPARING',
    'PROVING',
    'CONSOLIDATING',
    'REFLECTING',
    'REVIEWING',
    'PROVED',
    'DISPROVED',
    'UNKNOWN',
    'ABORTED',
    'FAILED',
  ]),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  epoch: z.number().int().nonnegative(),
  trustedObligationsClosed: z.number().int().nonnegative(),
  obligationsTotal: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  sessionTokens: z.record(z.string(), z.number().int().nonnegative()),
  activeSessionIds: z.array(z.string()),
  lanes: z.array(z.object({
    rolloutId: z.string(),
    sessionId: z.string(),
    epoch: z.number().int().positive(),
    tokens: z.number().int().nonnegative(),
    obligationsClosed: z.number().int().nonnegative(),
    obligationsTotal: z.number().int().nonnegative(),
    checkpointable: z.boolean(),
    finalAccepted: z.boolean(),
  })),
  stopReason: z.string().optional(),
  error: z.string().optional(),
})

export type ProofRunView = z.infer<typeof ProofRunViewSchema>

/** Whole post-change state projected onto the DSH session that owns these runs. */
export const ProofRunsProjectionSchema = z.object({
  activeRunId: z.string().nullable(),
  runs: z.array(ProofRunViewSchema),
})

export type ProofRunsProjection = z.infer<typeof ProofRunsProjectionSchema>

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Complete current proof-run collection for the owning DSH session. */
    'tokens-as-parameters/proof-runs': ProofRunsProjection
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    proofRuns: ProofRunsProjection
  }

  interface SessionProjectionStateMap {
    proofRuns: ProofRunsProjection
  }
}

export function toProofRunView(snapshot: ProofRunSnapshot): ProofRunView {
  return {
    runId: snapshot.runId,
    caseId: snapshot.caseId,
    state: snapshot.state,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    ...(snapshot.startedAt === undefined ? {} : { startedAt: snapshot.startedAt }),
    ...(snapshot.completedAt === undefined ? {} : { completedAt: snapshot.completedAt }),
    epoch: snapshot.epoch,
    trustedObligationsClosed: snapshot.trustedObligationsClosed,
    obligationsTotal: snapshot.obligationsTotal,
    totalTokens: snapshot.totalTokens,
    sessionTokens: Object.fromEntries(Object.entries(snapshot.sessionTokenUsage ?? {})
      .map(([sessionId, usage]) => [sessionId, usage.totalTokens])),
    activeSessionIds: [...snapshot.activeSessionIds],
    lanes: snapshot.lanes.map(lane => ({
      rolloutId: lane.rolloutId,
      sessionId: lane.sessionId,
      epoch: lane.epoch,
      tokens: lane.tokens,
      obligationsClosed: lane.receipt.obligationsClosed,
      obligationsTotal: lane.receipt.obligationsTotal,
      checkpointable: lane.receipt.checkpointable,
      finalAccepted: lane.receipt.finalAccepted,
    })),
    ...(snapshot.stopReason === undefined ? {} : { stopReason: snapshot.stopReason }),
    ...(snapshot.error === undefined ? {} : { error: snapshot.error }),
  }
}
