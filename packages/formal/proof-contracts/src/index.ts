import { z } from 'zod'
import type {
  ParameterUpdatePlan,
  OptimizationDecision,
  TextParameterContextSnapshot,
  TextParameterState,
  TokenUsageSummary,
  TraceEntry,
} from '@tokens-as-parameters/core-optimization'
import type { CommandReceipt } from '@tokens-as-parameters/core-state-git'

export type {
  ParameterUpdatePlan,
  OptimizationDecision,
  TextParameterContextSnapshot,
  TextParameterState,
  TokenUsageSummary,
  TraceEntry,
} from '@tokens-as-parameters/core-optimization'
export type { CommandReceipt } from '@tokens-as-parameters/core-state-git'

export const CASE_SCHEMA_VERSION = '1.0' as const
export const RUN_SCHEMA_VERSION = '1.0' as const

const RelativePathSchema = z.string().trim().min(1).refine(
  value => !value.startsWith('/') && !value.split('/').includes('..'),
  'path must be relative and must not escape the case root',
)

export const LockedInputSchema = z.object({
  path: RelativePathSchema,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
})

export const ExternalDependencySchema = z.object({
  name: z.string().trim().min(1),
  root: z.string().trim().min(1),
  commit: z.string().regex(/^[a-f0-9]{40,64}$/),
})

export const CaseManifestSchema = z.object({
  schemaVersion: z.literal(CASE_SCHEMA_VERSION),
  caseId: z.string().trim().min(1).max(160),
  claimScope: z.enum(['lean-model-vs-spec', 'rtl-vs-spec']),
  description: z.string().trim().min(1),
  git: z.object({
    baselineCommit: z.string().regex(/^[a-f0-9]{7,40}$/).optional(),
  }).default({}),
  editableFiles: z.array(RelativePathSchema).min(1),
  lockedInputs: z.array(LockedInputSchema).min(1),
  externalDependencies: z.array(ExternalDependencySchema).default([]),
  lean: z.object({
    workingDirectory: RelativePathSchema,
    proofFile: RelativePathSchema,
    theoremFile: RelativePathSchema,
    module: z.string().trim().min(1),
    theoremName: z.string().trim().min(1),
    theoremSignatureSha256: z.string().regex(/^[a-f0-9]{64}$/),
    obligations: z.array(z.string().trim().min(1)).min(1),
    dependencyCacheArgv: z.array(z.string().min(1)).min(1).optional(),
    buildArgv: z.array(z.string().min(1)).min(1).default(['lake', 'build']),
    allowedAxioms: z.array(z.string().trim().min(1)).default([
      'propext',
      'Classical.choice',
      'Quot.sound',
    ]),
  }),
  provenance: z.object({
    sourceRepository: z.string().optional(),
    sourceCommit: z.string().optional(),
    license: z.string().trim().min(1),
    notes: z.string().optional(),
  }),
}).superRefine((value, context) => {
  const editable = new Set(value.editableFiles)
  for (const locked of value.lockedInputs) {
    if (editable.has(locked.path)) {
      context.addIssue({
        code: 'custom',
        path: ['lockedInputs'],
        message: `locked input is also editable: ${locked.path}`,
      })
    }
  }
  if (!editable.has(value.lean.proofFile)) {
    context.addIssue({
      code: 'custom',
      path: ['lean', 'proofFile'],
      message: 'lean.proofFile must be included in editableFiles',
    })
  }
})

export type CaseManifest = z.infer<typeof CaseManifestSchema>

export const ProofSearchConfigSchema = z.object({
  provider: z.string().trim().min(1).default('deepseek-official'),
  model: z.string().trim().min(1).default('deepseek-v4-flash'),
  prover: z.string().trim().min(1).default('formal-code-agent'),
  loss: z.string().trim().min(1).default('lean-dual-check'),
  optimizer: z.string().trim().min(1).default('relative-reflection'),
  verifier: z.string().trim().min(1).default('lean'),
  rollouts: z.number().int().min(1).max(16).default(2),
  maxParallel: z.number().int().min(1).max(16).default(2),
  maxOutputTokensPerRequest: z.number().int().min(1_000).max(512_000).default(64_000),
  maxStepsPerLane: z.number().int().min(1).max(10_000).default(200),
  /** @deprecated Retained for old experiment manifests; model-step depth is the primary lane boundary. */
  maxCumulativeTokensPerLane: z.number().int().min(10_000).max(100_000_000).default(20_000_000),
  totalTokenBudget: z.number().int().min(10_000).max(1_000_000_000).default(300_000_000),
  maxWallTimeSeconds: z.number().int().min(60).max(604_800).default(43_200),
  parameterFeedback: z.object({
    memory: z.boolean().default(true),
    plan: z.boolean().default(true),
    routes: z.boolean().default(true),
  }).default({ memory: true, plan: true, routes: true }),
  reflection: z.object({
    enabled: z.boolean().default(true),
    maxSteps: z.number().int().min(1).max(1_000).default(32),
    /** @deprecated Retained for old manifests; maxSteps is the active boundary. */
    softTokenBudget: z.number().int().min(10_000).max(10_000_000).default(500_000),
    maxOutputTokensPerRequest: z.number().int().min(4_000).max(256_000).default(64_000),
  }).default({
    enabled: true,
    maxSteps: 32,
    softTokenBudget: 500_000,
    maxOutputTokensPerRequest: 64_000,
  }),
  lossJudge: z.object({
    maxSteps: z.number().int().min(1).max(1_000).default(24),
    maxOutputTokensPerRequest: z.number().int().min(4_000).max(256_000).default(32_000),
  }).default({
    maxSteps: 24,
    maxOutputTokensPerRequest: 32_000,
  }),
  whiteboxReview: z.boolean().default(true),
}).superRefine((value, context) => {
  if (value.reflection.enabled && !Object.values(value.parameterFeedback).some(Boolean)) {
    context.addIssue({
      code: 'custom',
      path: ['parameterFeedback'],
      message: 'reflection requires at least one feedback-enabled Formal Prover text parameter',
    })
  }
})

export type ProofSearchConfig = z.infer<typeof ProofSearchConfigSchema>

export const StartProofExperimentSchema = z.object({
  caseId: z.string().trim().min(1).max(160),
  search: ProofSearchConfigSchema.default({
    provider: 'deepseek-official',
    model: 'deepseek-v4-flash',
    prover: 'formal-code-agent',
    loss: 'lean-dual-check',
    optimizer: 'relative-reflection',
    verifier: 'lean',
    rollouts: 2,
    maxParallel: 2,
    maxOutputTokensPerRequest: 64_000,
    maxStepsPerLane: 200,
    maxCumulativeTokensPerLane: 20_000_000,
    totalTokenBudget: 300_000_000,
    maxWallTimeSeconds: 43_200,
    parameterFeedback: { memory: true, plan: true, routes: true },
    reflection: {
      enabled: true,
      maxSteps: 32,
      softTokenBudget: 500_000,
      maxOutputTokensPerRequest: 64_000,
    },
    lossJudge: {
      maxSteps: 24,
      maxOutputTokensPerRequest: 32_000,
    },
    whiteboxReview: true,
  }),
}).strict()

export type StartProofExperiment = z.infer<typeof StartProofExperimentSchema>

export interface ExperimentCaseSummary {
  caseId: string
  claimScope: CaseManifest['claimScope']
  description: string
  catalogPath: string
}

export interface ProofExperimentSource {
  catalogPath: string
  manifestSha256: string
  sourceCommit: string
  workspace: 'workspace'
}

export type RunState =
  | 'PREPARING'
  | 'PROVING'
  | 'CONSOLIDATING'
  | 'REFLECTING'
  | 'REVIEWING'
  | 'PROVED'
  | 'DISPROVED'
  | 'UNKNOWN'
  | 'ABORTED'
  | 'FAILED'

export interface ProofHygieneFinding {
  kind: 'admit' | 'axiom' | 'unsafe' | 'signature' | 'locked-input' | 'unauthorized-change' | 'build' | 'axiom-audit'
  message: string
  path?: string
}

export interface ProofReceipt {
  schemaVersion: typeof RUN_SCHEMA_VERSION
  checkedAt: string
  caseId: string
  claimScope: CaseManifest['claimScope']
  worktree: string
  build: CommandReceipt
  lockedInputsMatch: boolean
  theoremSignatureMatches: boolean
  obligationsClosed: number
  obligationsTotal: number
  closedObligations: string[]
  openObligations: string[]
  verifiedDeclarations: string[]
  checkpointDeclarations: string[]
  findings: ProofHygieneFinding[]
  obligationAxiomAudit?: {
    command: CommandReceipt
    accepted: string[]
    rejected: Array<{
      name: string
      observed: string[]
      forbidden: string[]
    }>
  }
  checkpointAxiomAudit?: {
    command: CommandReceipt
    accepted: string[]
    rejected: Array<{
      name: string
      observed: string[]
      forbidden: string[]
    }>
  }
  axiomAudit?: {
    command: CommandReceipt
    observed: string[]
    forbidden: string[]
  }
  checkpointable: boolean
  finalAccepted: boolean
}

export interface LaneEvidence {
  rolloutId: string
  sessionId: string
  epoch: number
  route: string
  contextSnapshot: TextParameterContextSnapshot
  baseCommit: string
  commit?: string
  steps: number
  tokens: number
  tokenUsage: TokenUsageSummary
  receipt: ProofReceipt
  loss: ProofLossReport
  traceTail: TraceEntry[]
}

export interface WhiteboxReview {
  approved: boolean
  risk: 'low' | 'medium' | 'high'
  findings: Array<{ type: string; explanation: string }>
  recommendation: string
}

export type ProofCandidateStatus = 'INVALID' | 'EXPLORATORY' | 'VERIFIED'
export type ProofLossVerdict = 'invalid' | 'no-progress' | 'progress' | 'solved'

export interface ProofLossReport {
  schemaVersion: typeof RUN_SCHEMA_VERSION
  pluginId: string
  evaluatedAt: string
  verdict: ProofLossVerdict
  candidateStatus: ProofCandidateStatus
  summary: string
  ruleBased: {
    buildPassed: boolean
    lockedInputsMatch: boolean
    theoremSignatureMatches: boolean
    obligationsClosed: number
    obligationsTotal: number
    closedObligations: string[]
    openObligations: string[]
    forbiddenAxiomFindings: number
    findings: ProofHygieneFinding[]
  }
  whitebox?: WhiteboxReview
  metrics: Record<string, number | string | boolean>
}

export interface ProofRunSnapshot {
  schemaVersion: typeof RUN_SCHEMA_VERSION
  runId: string
  /** DSH session that started this run. Older persisted runs may predate this field. */
  ownerSessionId?: string
  caseId: string
  claimScope: CaseManifest['claimScope']
  mode: 'experiment'
  experiment: ProofExperimentSource
  state: RunState
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
  epoch: number
  trustedCommit: string
  searchBaseCommit: string
  trustedObligationsClosed: number
  obligationsTotal: number
  totalTokens: number
  tokenUsage: TokenUsageSummary
  /** Per-DSH-session usage for live UI. Older persisted runs may predate this field. */
  sessionTokenUsage?: Record<string, TokenUsageSummary>
  activeSessionIds: string[]
  lanes: LaneEvidence[]
  parameterState: TextParameterState
  latestReflection?: ParameterUpdatePlan
  latestOptimization?: OptimizationDecision
  finalReceipt?: ProofReceipt
  whiteboxReview?: WhiteboxReview
  stopReason?: string
  error?: string
  config: StartProofExperiment
}

export interface ProofDomainEvent {
  sequence: number
  timestamp: string
  runId: string
  type: string
  state: RunState
  message: string
  epoch?: number
  rolloutId?: string
  sessionId?: string
  data?: unknown
}
