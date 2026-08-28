import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { Context, Service } from '@deepseek-ai/cordis'
import type { Agent, AgentHandle } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-presets'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-subprocess'
import type OptimizationService from '@tokens-as-parameters/core-optimization'
import {
  applyParameterUpdatePlan,
  createTextParameterContextSnapshot,
  neutralParameterUpdatePlan,
  requireTextParameter,
  type OptimizationCapture,
  type OptimizationLane,
  type ParameterUpdatePlan,
  type TextParameterState,
  type TraceEntry,
} from '@tokens-as-parameters/core-optimization'
import {
  RUN_SCHEMA_VERSION,
  StartProofExperimentSchema,
  type CaseManifest,
  type ExperimentCaseSummary,
  type LaneEvidence,
  type ProofReceipt,
  type ProofRunSnapshot,
  type WhiteboxReview,
} from '@tokens-as-parameters/proof-contracts'
import {
  ProofRunsProjectionSchema,
  toProofRunView,
  type ProofRunsProjection,
} from '@tokens-as-parameters/proof-contracts/dsh-surface'
import { DshCommandRunner, GitState } from '@tokens-as-parameters/core-state-git'
import {
  hashFile,
  loadCaseManifest,
  resolveInside,
  type ResolvedCase,
} from '@tokens-as-parameters/proof-contracts/case-manifest'
import {
  discoverExperimentCases,
  resolveExperimentCase,
} from '@tokens-as-parameters/proof-contracts/experiment-catalog'
import type ProofVerificationService from '@tokens-as-parameters/proof-verification'
import type { ProofVerifier } from '@tokens-as-parameters/proof-verification'
import type ProofRoleService from '@tokens-as-parameters/proof-roles'
import {
  createFormalProverParameterState,
  FORMAL_PROVER_MEMORY_PARAMETER_ID,
  FORMAL_PROVER_PLAN_PARAMETER_ID,
  formalProverRouteParameterId,
} from '@tokens-as-parameters/proof-roles'
import type ProofObserverService from '@tokens-as-parameters/proof-observer'
import {
  emptyTokenUsage,
  lastTurnReason,
  sessionTokens,
  sessionTrace,
  sessionTraceTail,
  sessionUsage,
} from '@tokens-as-parameters/core-telemetry'

declare module '@deepseek-ai/cordis' {
  interface Context {
    proofRuns: ProofRunService
  }
}

export interface Config {
  benchmarkRoot?: string
  defaultRunRoot?: string
  preserveWorktrees?: boolean
}

interface RunRecord {
  snapshot: ProofRunSnapshot
  owner: Agent
  directory: string
  resolvedCase: ResolvedCase
  controller: AbortController
  handles: Set<AgentHandle>
  accountedSessionUsage: Map<string, ProofRunSnapshot['tokenUsage']>
  persisting: Promise<void>
  task: Promise<void>
}

interface LaneRuntime {
  evidence: LaneEvidence
  baseCommit: string
  worktree: string
  handle: AgentHandle
  detachObserver: () => void
}

interface ConsolidationResult {
  commit: string
  receipt: ProofReceipt
  worktree: string
}

function runId(caseId: string): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  const safe = caseId.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 80)
  return `${safe}-${stamp}-${randomUUID().slice(0, 8)}`
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function terminal(state: ProofRunSnapshot['state']): boolean {
  return ['PROVED', 'DISPROVED', 'UNKNOWN', 'ABORTED', 'FAILED'].includes(state)
}

const MATERIALIZATION_EXCLUDES = new Set([
  '.git',
  '.lake',
  '.tokens-as-parameters',
  'node_modules',
])

const ROOT_MATERIALIZATION_EXCLUDES = new Set(['.worktrees', 'build', 'dist', 'lib', 'runs', 'temp', 'tmp'])

async function copyExperimentDirectory(source: string, target: string, depth: number): Promise<void> {
  await mkdir(target, { recursive: true })
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (MATERIALIZATION_EXCLUDES.has(entry.name) || (depth === 0 && ROOT_MATERIALIZATION_EXCLUDES.has(entry.name))) {
      continue
    }
    const from = join(source, entry.name)
    const to = join(target, entry.name)
    if (entry.isSymbolicLink()) {
      throw new Error(`experiment case contains an unsupported symbolic link: ${from}`)
    }
    if (entry.isDirectory()) {
      await copyExperimentDirectory(from, to, depth + 1)
    } else if (entry.isFile()) {
      await copyFile(from, to)
    } else {
      throw new Error(`experiment case contains an unsupported filesystem entry: ${from}`)
    }
  }
}

export function materializeExperimentCase(source: string, target: string): Promise<void> {
  return copyExperimentDirectory(source, target, 0)
}

function isProofRunSnapshot(value: unknown): value is ProofRunSnapshot {
  if (value === null || typeof value !== 'object') return false
  const candidate = value as Partial<ProofRunSnapshot>
  return candidate.schemaVersion === RUN_SCHEMA_VERSION
    && typeof candidate.runId === 'string'
    && typeof candidate.caseId === 'string'
    && candidate.mode === 'experiment'
    && candidate.experiment !== null
    && typeof candidate.experiment === 'object'
    && typeof candidate.state === 'string'
    && typeof candidate.trustedCommit === 'string'
    && typeof candidate.searchBaseCommit === 'string'
    && typeof candidate.config === 'object'
}

async function mapLimit<T, R>(
  values: readonly T[],
  limit: number,
  operation: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(values.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor
      cursor += 1
      const value = values[index]
      if (value !== undefined) output[index] = await operation(value, index)
    }
  })
  await Promise.all(workers)
  return output
}

function proofTask(manifest: CaseManifest): string {
  return [
    `Prove the locked formal claim ${manifest.lean.theoremName} in ${manifest.lean.proofFile}.`,
    `The claim scope is ${manifest.claimScope}.`,
    `Open obligations: ${manifest.lean.obligations.join(', ')}. Use lean_check_candidate to measure actual status.`,
    'Work directly in the provided isolated Git worktree. Preserve all locked inputs and record evidence-backed insights as the proof state changes.',
  ].join('\n')
}

function optimizationLane(evidence: LaneEvidence): OptimizationLane {
  const receipt = evidence.receipt
  return {
    rolloutId: evidence.rolloutId,
    sessionId: evidence.sessionId,
    epoch: evidence.epoch,
    ...(evidence.commit === undefined ? {} : { commit: evidence.commit }),
    tokens: evidence.tokens,
    tokenUsage: evidence.tokenUsage,
    contextSnapshot: evidence.contextSnapshot,
    evaluation: {
      objective: 'close-verifier-declared-proof-obligations',
      verdict: receipt.finalAccepted ? 'accepted' : receipt.checkpointable ? 'progress' : 'rejected',
      summary: `${receipt.obligationsClosed}/${receipt.obligationsTotal} obligations are checker-trusted`,
      metrics: {
        obligationsClosed: receipt.obligationsClosed,
        obligationsTotal: receipt.obligationsTotal,
        checkpointable: receipt.checkpointable,
        finalAccepted: receipt.finalAccepted,
      },
      evidence: receipt,
    },
    traceTail: evidence.traceTail,
  }
}

export default class ProofRunService extends Service {
  static inject = ['agents', 'subprocess', 'optimization', 'proofVerification', 'proofRoles', 'proofObserver']

  private readonly records = new Map<string, RunRecord>()
  private readonly runner: DshCommandRunner
  private readonly git: GitState
  private readonly config: Required<Config>

  constructor(
    ctx: Context,
    config: Config = {},
    private readonly roles: ProofRoleService = ctx.proofRoles,
    private readonly optimization: OptimizationService = ctx.optimization,
    private readonly verification: ProofVerificationService = ctx.proofVerification,
    private readonly observer: ProofObserverService = ctx.proofObserver,
  ) {
    super(ctx, 'proofRuns')
    this.runner = new DshCommandRunner(ctx)
    this.git = new GitState(this.runner)
    this.config = {
      benchmarkRoot: resolve(config.benchmarkRoot ?? join(process.cwd(), 'benchmarks')),
      defaultRunRoot: resolve(config.defaultRunRoot ?? join(process.cwd(), '.tokens-as-parameters', 'runs')),
      preserveWorktrees: config.preserveWorktrees ?? true,
    }
    ctx.inject(['sessionProjections'], projectionCtx => {
      projectionCtx.sessionProjections.register<'proofRuns', ProofRunsProjection>({
        key: 'proofRuns',
        stateSchema: ProofRunsProjectionSchema,
        init: () => ({ activeRunId: null, runs: [] }),
        apply: (state, event) => event.type === 'tokens-as-parameters/proof-runs'
          ? event.data
          : state,
        wire: { viewSchema: ProofRunsProjectionSchema, view: state => state },
        stateVersion: 1,
      })
    })
    ctx.on('session/event', (session, event) => {
      if (event.type !== 'assistant/message' || event.data.usage === undefined) return
      const record = [...this.records.values()].find(candidate => (
        [...candidate.handles].some(handle => handle.agent.session === session)
      ))
      if (record === undefined) return
      this.accountSessionUsage(record, String(session.id), sessionUsage(session.events))
      record.snapshot.updatedAt = new Date().toISOString()
      void this.persist(record)
    })
    ctx.effect(() => async () => {
      const records = [...this.records.values()]
      records.forEach(record => {
        if (!terminal(record.snapshot.state)) record.controller.abort('plugin disposed')
        record.handles.forEach(handle => handle.agent.cancel({ kind: 'disposed' }))
      })
      await Promise.allSettled(records.map(record => record.task))
      await Promise.allSettled(records.flatMap(record => [...record.handles].map(handle => handle.dispose())))
    }, 'tokens-as-parameters.proof-runs()')
  }

  private verifier(record: RunRecord): ProofVerifier {
    return this.verification.require(record.snapshot.config.search.verifier)
  }

  async list(): Promise<ProofRunSnapshot[]> {
    const snapshots = new Map<string, ProofRunSnapshot>()
    for (const snapshot of await this.readHistoricalSnapshots()) snapshots.set(snapshot.runId, snapshot)
    for (const record of this.records.values()) snapshots.set(record.snapshot.runId, clone(record.snapshot))
    return [...snapshots.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }

  async get(id: string): Promise<ProofRunSnapshot | undefined> {
    const record = this.records.get(id)
    if (record !== undefined) return clone(record.snapshot)
    if (!/^[A-Za-z0-9._-]+$/.test(id)) return undefined
    try {
      const parsed: unknown = JSON.parse(await readFile(join(this.config.defaultRunRoot, id, 'run.json'), 'utf8'))
      return isProofRunSnapshot(parsed) ? this.asHistoricalSnapshot(parsed) : undefined
    } catch {
      return undefined
    }
  }

  async listExperimentCases(): Promise<ExperimentCaseSummary[]> {
    return (await discoverExperimentCases(this.config.benchmarkRoot)).map(item => ({
      caseId: item.caseId,
      claimScope: item.claimScope,
      description: item.description,
      catalogPath: item.catalogPath,
    }))
  }

  async startExperiment(input: unknown, owner: Agent): Promise<ProofRunSnapshot> {
    const config = StartProofExperimentSchema.parse(input)
    const catalogCase = await resolveExperimentCase(this.config.benchmarkRoot, config.caseId)
    const sourceCommit = await this.git.requireCleanCommit(catalogCase.resolvedCase.root)
    const id = runId(catalogCase.caseId)
    const root = resolve(this.config.defaultRunRoot, id)
    const workspace = join(root, 'workspace')
    await materializeExperimentCase(catalogCase.resolvedCase.root, workspace)
    const resolvedCase = await loadCaseManifest(workspace)
    const baseline = await this.git.initializeRepository(
      workspace,
      `experiment: freeze ${catalogCase.caseId} from ${sourceCommit}`,
    )
    const now = new Date().toISOString()
    const rolloutIds = Array.from({ length: config.search.rollouts }, (_, index) => `r${index + 1}`)
    const parameterState = createFormalProverParameterState(
      `${id}/initial`,
      rolloutIds,
      config.search.parameterFeedback,
    )
    const snapshot: ProofRunSnapshot = {
      schemaVersion: RUN_SCHEMA_VERSION,
      runId: id,
      ownerSessionId: String(owner.id),
      caseId: resolvedCase.manifest.caseId,
      claimScope: resolvedCase.manifest.claimScope,
      mode: 'experiment',
      experiment: {
        catalogPath: catalogCase.catalogPath,
        manifestSha256: await hashFile(catalogCase.resolvedCase.manifestPath),
        sourceCommit,
        workspace: 'workspace',
      },
      state: 'PREPARING',
      createdAt: now,
      updatedAt: now,
      epoch: 0,
      trustedCommit: baseline,
      searchBaseCommit: baseline,
      trustedObligationsClosed: 0,
      obligationsTotal: resolvedCase.manifest.lean.obligations.length,
      totalTokens: 0,
      tokenUsage: emptyTokenUsage(),
      sessionTokenUsage: {},
      activeSessionIds: [],
      lanes: [],
      parameterState,
      config,
    }
    const controller = new AbortController()
    const record: RunRecord = {
      snapshot,
      owner,
      directory: root,
      resolvedCase,
      controller,
      handles: new Set(),
      accountedSessionUsage: new Map(),
      persisting: Promise.resolve(),
      task: Promise.resolve(),
    }
    this.records.set(id, record)
    await this.observer.registerRun(id, root, 'PREPARING')
    await this.persist(record)
    await this.observer.emit({
      runId: id,
      type: 'experiment/workspace-materialized',
      state: 'PREPARING',
      message: `materialized immutable case ${catalogCase.caseId} at source commit ${sourceCommit}`,
      data: {
        catalogPath: catalogCase.catalogPath,
        manifestSha256: record.snapshot.experiment.manifestSha256,
        sourceCommit,
        baselineCommit: baseline,
        workspace: record.snapshot.experiment.workspace,
      },
    })
    record.task = this.execute(record, owner)
      .catch(async (error: unknown) => {
        if (record.controller.signal.aborted) {
          await this.finalize(record, 'ABORTED', 'proof run was stopped')
          return
        }
        record.snapshot.error = error instanceof Error ? error.stack ?? error.message : String(error)
        await this.finalize(record, 'FAILED', error instanceof Error ? error.message : String(error))
      })
      .finally(() => this.disposeRemainingHandles(record))
    return clone(snapshot)
  }

  async stop(id: string): Promise<ProofRunSnapshot> {
    const record = this.records.get(id)
    if (record === undefined) throw new Error(`unknown proof run: ${id}`)
    if (!terminal(record.snapshot.state)) {
      record.controller.abort('user stop')
      record.handles.forEach(handle => handle.agent.cancel({ kind: 'user' }))
      await record.task
    }
    return clone(record.snapshot)
  }

  private async execute(record: RunRecord, owner: Agent): Promise<void> {
    const started = Date.now()
    record.snapshot.startedAt = new Date(started).toISOString()
    await this.transition(record, 'PREPARING', 'validating the frozen baseline')
    const baselineWorktree = this.worktreePath(record.snapshot.runId, 0, 'baseline')
    await this.git.createWorktree(record.resolvedCase.root, record.snapshot.trustedCommit, baselineWorktree, record.controller.signal)
    let baselineReceipt: ProofReceipt
    try {
      baselineReceipt = await this.verifier(record).check(
        record.resolvedCase,
        baselineWorktree,
        0,
        record.controller.signal,
        record.snapshot.trustedCommit,
      )
    } catch (error) {
      if (!this.config.preserveWorktrees) await this.git.removeWorktree(record.resolvedCase.root, baselineWorktree)
      throw error
    }
    const fatalPreflightKinds = new Set([
      'admit',
      'axiom',
      'unsafe',
      'signature',
      'locked-input',
      'unauthorized-change',
      'build',
    ])
    if (
      !baselineReceipt.lockedInputsMatch
      || !baselineReceipt.theoremSignatureMatches
      || baselineReceipt.build.exitCode !== 0
      || baselineReceipt.findings.some(finding => fatalPreflightKinds.has(finding.kind))
    ) {
      throw new Error('frozen baseline failed the trusted preflight checker')
    }
    record.snapshot.trustedObligationsClosed = baselineReceipt.obligationsClosed
    await this.persist(record)
    if (baselineReceipt.finalAccepted) {
      try {
        await this.acceptFinalCandidate(record, owner, baselineWorktree, baselineReceipt)
      } finally {
        if (!this.config.preserveWorktrees) await this.git.removeWorktree(record.resolvedCase.root, baselineWorktree)
      }
      return
    }
    if (!this.config.preserveWorktrees) await this.git.removeWorktree(record.resolvedCase.root, baselineWorktree)

    const rolloutIds = Array.from(
      { length: record.snapshot.config.search.rollouts },
      (_, index) => `r${index + 1}`,
    )
    let parameterState = record.snapshot.parameterState
    let epoch = 0
    while (true) {
      epoch += 1
      this.throwIfStopped(record)
      if (Date.now() - started > record.snapshot.config.search.maxWallTimeSeconds * 1_000) {
        await this.finalize(record, 'UNKNOWN', 'wall-time budget exhausted')
        return
      }
      if (record.snapshot.totalTokens >= record.snapshot.config.search.totalTokenBudget) {
        await this.finalize(record, 'UNKNOWN', 'total token budget exhausted')
        return
      }
      record.snapshot.epoch = epoch
      record.snapshot.lanes = []
      await this.transition(record, 'PROVING', `starting epoch ${epoch}`)
      const lanes = await mapLimit(
        rolloutIds,
        record.snapshot.config.search.maxParallel,
        rolloutId => this.runLane(record, owner, epoch, rolloutId, parameterState),
      )
      record.snapshot.lanes = lanes.map(lane => lane.evidence)
      lanes.forEach(lane => this.accountSessionUsage(
        record,
        lane.evidence.sessionId,
        lane.evidence.tokenUsage,
      ))
      await this.persist(record)

      const finalLane = lanes
        .filter(lane => lane.evidence.receipt.finalAccepted)
        .sort((left, right) => right.evidence.receipt.obligationsClosed - left.evidence.receipt.obligationsClosed)[0]
      if (finalLane !== undefined) {
        try {
          await this.acceptFinalCandidate(record, owner, finalLane.worktree, finalLane.evidence.receipt)
        } finally {
          await this.disposeLanes(record, lanes)
        }
        return
      }

      await this.transition(record, 'CONSOLIDATING', `merging checker-trusted progress from epoch ${epoch}`)
      const consolidation = await this.consolidate(record, epoch, lanes)
      if (consolidation.receipt.checkpointable) {
        const obligationProgress = consolidation.receipt.obligationsClosed > record.snapshot.trustedObligationsClosed
        record.snapshot.trustedCommit = consolidation.commit
        if (obligationProgress) {
          record.snapshot.trustedObligationsClosed = consolidation.receipt.obligationsClosed
        }
        await this.observer.emit({
          runId: record.snapshot.runId,
          type: obligationProgress ? 'proof/trusted-baseline-advanced' : 'proof/helper-checkpoint-advanced',
          state: record.snapshot.state,
          message: obligationProgress
            ? `trusted progress advanced to ${consolidation.receipt.obligationsClosed}/${consolidation.receipt.obligationsTotal}`
            : `checker-clean helper checkpoint advanced with ${consolidation.receipt.checkpointDeclarations.length} declaration(s)`,
          epoch,
          data: {
            commit: consolidation.commit,
            closed: consolidation.receipt.closedObligations,
            checkpointDeclarations: consolidation.receipt.checkpointDeclarations,
          },
        })
      }
      if (consolidation.receipt.finalAccepted) {
        try {
          await this.acceptFinalCandidate(record, owner, consolidation.worktree, consolidation.receipt)
        } finally {
          await this.disposeLanes(record, lanes)
          if (!this.config.preserveWorktrees) {
            await this.git.removeWorktree(record.resolvedCase.root, consolidation.worktree)
          }
        }
        return
      }
      const plan = record.snapshot.config.search.reflection.enabled
        ? await this.runReflection(record, owner, epoch, lanes, parameterState)
        : neutralParameterUpdatePlan(parameterState)
      const nextParameterState = applyParameterUpdatePlan(
        parameterState,
        plan,
        `${record.snapshot.runId}/epoch-${epoch}`,
      )
      record.snapshot.latestReflection = plan
      record.snapshot.parameterState = nextParameterState
      await this.observer.emit({
        runId: record.snapshot.runId,
        type: 'parameter/update-applied',
        state: record.snapshot.state,
        message: `epoch ${epoch} atomically updated ${plan.updates.length} text parameter(s)`,
        epoch,
        data: {
          fromVersion: parameterState.version,
          toVersion: nextParameterState.version,
          parameterIds: plan.updates.map(update => update.parameterId),
        },
      })
      if (record.snapshot.config.search.reflection.enabled) {
        const stateWorktree = this.worktreePath(record.snapshot.runId, epoch, 'reflection-state')
        await this.git.createWorktree(
          record.resolvedCase.root,
          record.snapshot.trustedCommit,
          stateWorktree,
          record.controller.signal,
        )
        try {
          const state = await this.git.createReflectionState(
            record.resolvedCase.root,
            stateWorktree,
            record.snapshot.runId,
            epoch,
            record.snapshot.trustedCommit,
            lanes.flatMap(lane => lane.evidence.commit === undefined ? [] : [lane.evidence.commit]),
            plan,
            nextParameterState,
            record.controller.signal,
          )
          record.snapshot.searchBaseCommit = state.commit
          await this.observer.emit({
            runId: record.snapshot.runId,
            type: 'reflection/state-committed',
            state: record.snapshot.state,
            message: `epoch ${epoch} reflection became the next search-base node`,
            epoch,
            data: { commit: state.commit, path: state.path },
          })
        } finally {
          if (!this.config.preserveWorktrees) {
            await this.git.removeWorktree(record.resolvedCase.root, stateWorktree)
          }
        }
      } else {
        record.snapshot.searchBaseCommit = record.snapshot.trustedCommit
      }
      parameterState = nextParameterState
      await this.persist(record)
      await this.disposeLanes(record, lanes)
      if (!this.config.preserveWorktrees) {
        await this.git.removeWorktree(record.resolvedCase.root, consolidation.worktree)
      }
    }
  }

  private async runLane(
    record: RunRecord,
    owner: Agent,
    epoch: number,
    rolloutId: string,
    parameters: TextParameterState,
  ): Promise<LaneRuntime> {
    const worktree = this.worktreePath(record.snapshot.runId, epoch, rolloutId)
    const baseCommit = record.snapshot.searchBaseCommit
    await this.git.createWorktree(record.resolvedCase.root, baseCommit, worktree, record.controller.signal)
    const sessionId = SessionId(`${record.snapshot.runId}-e${epoch}-${rolloutId}`)
    const routeParameterId = formalProverRouteParameterId(rolloutId)
    const route = requireTextParameter(parameters, routeParameterId).content
    const contextSnapshot = createTextParameterContextSnapshot({
      id: `${record.snapshot.runId}/epoch-${epoch}/${rolloutId}`,
      state: parameters,
      parameterIds: [
        FORMAL_PROVER_MEMORY_PARAMETER_ID,
        FORMAL_PROVER_PLAN_PARAMETER_ID,
        routeParameterId,
      ],
      metadata: {
        runId: record.snapshot.runId,
        epoch,
        rolloutId,
        sessionId: String(sessionId),
      },
    })
    await this.observer.emit({
      runId: record.snapshot.runId,
      type: 'parameter/context-rendered',
      state: record.snapshot.state,
      message: `rendered parameter state ${parameters.version} for ${rolloutId}`,
      epoch,
      rolloutId,
      sessionId: String(sessionId),
      data: contextSnapshot,
    })
    const handle = await this.ctx.agents.create({
      sessionId,
      meta: {
        cwd: worktree,
        parentSession: owner.id,
        origin: 'subagent',
        delegationDepth: (owner.session.header.delegationDepth ?? 0) + 1,
      },
      agentOptions: {
        provider: record.snapshot.config.search.provider,
        model: record.snapshot.config.search.model,
        maxTokens: record.snapshot.config.search.maxOutputTokensPerRequest,
      },
      signal: record.controller.signal,
      setup: agentCtx => {
        const agent = agentCtx.agent
        if (agent === undefined) throw new Error('DSH did not associate the unpublished prover agent')
        this.ctx.get('agentPresets')?.composeFrom(agentCtx, owner.ctx)
        this.roles.installProver(agentCtx, {
          agent,
          runId: record.snapshot.runId,
          epoch,
          rolloutId,
          parameters,
          worktree,
          baseCommit,
          baselineClosed: record.snapshot.trustedObligationsClosed,
          resolvedCase: record.resolvedCase,
          verifier: this.verifier(record),
          git: this.git,
          signal: record.controller.signal,
        })
      },
    })
    record.handles.add(handle)
    record.snapshot.activeSessionIds.push(String(sessionId))
    await this.persist(record)
    const detachObserver = this.observer.attachSession(handle.agent, {
      runId: record.snapshot.runId,
      epoch,
      rolloutId,
      role: 'prover',
    })
    handle.agent.followup(createUserMessage({
      source: { kind: 'user' },
      content: [{ type: 'text', text: proofTask(record.resolvedCase.manifest) }],
    }))
    await handle.agent.whenIdle()
    while (
      !record.controller.signal.aborted
      && lastTurnReason(handle.agent.session.events) === 'max-tokens'
      && sessionTokens(handle.agent.session.events) < record.snapshot.config.search.maxCumulativeTokensPerLane
    ) {
      handle.agent.followup(createUserMessage({
        source: { kind: 'user' },
        content: [{
          type: 'text',
          text: 'The previous response ended at its per-request output boundary, while this lane still has cumulative budget. Continue in the same session from the current worktree and Lean state. Do not restart the proof from scratch.',
        }],
      }))
      await handle.agent.whenIdle()
    }
    const receipt = await this.verifier(record).check(
      record.resolvedCase,
      worktree,
      record.snapshot.trustedObligationsClosed,
      record.controller.signal,
      baseCommit,
    )
    const commit = await this.git.commitPaths(
      worktree,
      record.resolvedCase.manifest.editableFiles,
      `candidate(${rolloutId}): epoch ${epoch} closes ${receipt.obligationsClosed}/${receipt.obligationsTotal}`,
      record.controller.signal,
    )
    const tokenUsage = sessionUsage(handle.agent.session.events)
    const evidence: LaneEvidence = {
      rolloutId,
      sessionId: String(sessionId),
      epoch,
      route,
      contextSnapshot,
      commit,
      tokens: tokenUsage.totalTokens,
      tokenUsage,
      receipt,
      traceTail: sessionTraceTail(handle.agent.session.events),
    }
    return { evidence, baseCommit, worktree, handle, detachObserver }
  }

  private async consolidate(record: RunRecord, epoch: number, lanes: readonly LaneRuntime[]): Promise<ConsolidationResult> {
    const rolloutId = 'consolidator'
    const worktree = this.worktreePath(record.snapshot.runId, epoch, rolloutId)
    await this.git.createWorktree(record.resolvedCase.root, record.snapshot.searchBaseCommit, worktree, record.controller.signal)
    const proofRelative = record.resolvedCase.manifest.lean.proofFile
    const proofPath = resolveInside(worktree, proofRelative)
    let source = await readFile(proofPath, 'utf8')
    let bestReceipt = await this.verifier(record).check(
      record.resolvedCase,
      worktree,
      record.snapshot.trustedObligationsClosed,
      record.controller.signal,
      record.snapshot.searchBaseCommit,
    )
    const candidates = [...lanes].sort(
      (left, right) => right.evidence.receipt.obligationsClosed - left.evidence.receipt.obligationsClosed,
    )
    for (const lane of candidates) {
      if (!lane.evidence.receipt.checkpointable) continue
      const newlyClosed = lane.evidence.receipt.closedObligations.filter(
        name => !bestReceipt.closedObligations.includes(name),
      )
      const acceptedUnits = [...new Set([
        ...newlyClosed,
        ...lane.evidence.receipt.checkpointDeclarations,
      ])]
      if (acceptedUnits.length === 0) continue
      const candidateSource = await readFile(resolveInside(lane.worktree, proofRelative), 'utf8')
      const proposed = this.verifier(record).consolidate(source, candidateSource, acceptedUnits)
      await writeFile(proofPath, proposed, 'utf8')
      const receipt = await this.verifier(record).check(
        record.resolvedCase,
        worktree,
        bestReceipt.obligationsClosed,
        record.controller.signal,
        record.snapshot.searchBaseCommit,
      )
      if (receipt.checkpointable || receipt.finalAccepted) {
        source = proposed
        bestReceipt = receipt
      } else {
        await writeFile(proofPath, source, 'utf8')
      }
    }
    const commit = await this.git.commitPaths(
      worktree,
      record.resolvedCase.manifest.editableFiles,
      `consolidate: epoch ${epoch} trusted ${bestReceipt.obligationsClosed}/${bestReceipt.obligationsTotal}`,
      record.controller.signal,
    )
    return { commit, receipt: bestReceipt, worktree }
  }

  private async runReflection(
    record: RunRecord,
    owner: Agent,
    epoch: number,
    lanes: LaneRuntime[],
    parameters: TextParameterState,
  ): Promise<ParameterUpdatePlan> {
    await this.transition(record, 'REFLECTING', `comparing epoch ${epoch} trajectories`)
    const laneStateNodes = new Map(await Promise.all(lanes.map(async lane => [
      lane.evidence.rolloutId,
      await this.git.stateNodes(lane.worktree, 1_000, lane.baseCommit, record.controller.signal),
    ] as const)))
    const sessionId = SessionId(`${record.snapshot.runId}-e${epoch}-reflector`)
    let capture: OptimizationCapture | undefined
    const optimizer = this.optimization.require(record.snapshot.config.search.optimizer)
    const laneTraces = new Map(lanes.map(lane => [
      lane.evidence.rolloutId,
      sessionTrace(lane.handle.agent.session.events),
    ]))
    const laneWorktrees = new Map(lanes.map(lane => [lane.evidence.rolloutId, lane.worktree]))
    const optimizationLanes = lanes.map(lane => optimizationLane(lane.evidence))
    const git = this.git
    const requireLane = (rolloutId: string): LaneRuntime => {
      const lane = lanes.find(item => item.evidence.rolloutId === rolloutId)
      if (lane === undefined) throw new Error(`unknown rollout: ${rolloutId}`)
      return lane
    }
    const handle = await this.ctx.agents.create({
      sessionId,
      meta: {
        cwd: record.directory,
        parentSession: owner.id,
        origin: 'subagent',
        delegationDepth: (owner.session.header.delegationDepth ?? 0) + 1,
      },
      agentOptions: {
        provider: record.snapshot.config.search.provider,
        model: record.snapshot.config.search.model,
        maxTokens: record.snapshot.config.search.reflection.maxOutputTokensPerRequest,
      },
      signal: record.controller.signal,
      setup: agentCtx => {
        const agent = agentCtx.agent
        if (agent === undefined) throw new Error('DSH did not associate the unpublished reflector agent')
        capture = optimizer.install(agentCtx, {
          agent,
          parameters,
          lanes: optimizationLanes,
          evidence: {
            async inspectParameterUsage(parameterId, rolloutId) {
              const parameter = requireTextParameter(parameters, parameterId)
              if (rolloutId !== undefined) requireLane(rolloutId)
              return {
                parameter,
                exposures: optimizationLanes
                  .filter(lane => rolloutId === undefined || lane.rolloutId === rolloutId)
                  .filter(lane => lane.contextSnapshot.parameters.some(exposure => (
                    exposure.parameterId === parameter.id
                    && exposure.revision === parameter.revision
                  )))
                  .map(lane => ({
                    rolloutId: lane.rolloutId,
                    sessionId: lane.sessionId,
                    contextSnapshotId: lane.contextSnapshot.id,
                    parameterStateVersion: lane.contextSnapshot.parameterStateVersion,
                    parameterRevision: parameter.revision,
                    tokens: lane.tokens,
                    ...(lane.commit === undefined ? {} : { commit: lane.commit }),
                    evaluation: lane.evaluation,
                  })),
              }
            },
            async readTraceRange(rolloutId, requestedStart, requestedLimit) {
              requireLane(rolloutId)
              const trace = laneTraces.get(rolloutId) ?? []
              const start = Math.max(0, Math.min(trace.length, Math.floor(requestedStart)))
              const limit = Math.max(1, Math.min(100, Math.floor(requestedLimit)))
              return {
                rolloutId,
                totalEntries: trace.length,
                start,
                entries: trace.slice(start, start + limit),
              }
            },
            async listStateNodes(rolloutId, requestedLimit) {
              requireLane(rolloutId)
              const limit = Math.max(1, Math.min(1_000, Math.floor(requestedLimit)))
              return (laneStateNodes.get(rolloutId) ?? []).slice(0, limit)
            },
            async inspectStateTransition(rolloutId, commit, maxCharacters) {
              const lane = requireLane(rolloutId)
              const nodes = laneStateNodes.get(rolloutId) ?? []
              if (!nodes.some(node => node.commit === commit)) {
                throw new Error(`commit is not a visible state node for ${rolloutId}`)
              }
              const trace = laneTraces.get(rolloutId) ?? []
              const anchor = trace.findIndex(entry => entry.text.includes(commit))
              const start = anchor < 0 ? Math.max(0, trace.length - 8) : Math.max(0, anchor - 4)
              return {
                rolloutId,
                commit,
                git: await git.inspectTransition(
                  laneWorktrees.get(rolloutId) ?? lane.worktree,
                  commit,
                  maxCharacters,
                  record.controller.signal,
                ),
                traceStart: start,
                traceContext: trace.slice(start, start + 9),
              }
            },
            async searchTrace(query, rolloutId, requestedLimit) {
              const normalized = query.toLocaleLowerCase()
              const limit = Math.max(1, Math.min(100, Math.floor(requestedLimit)))
              if (rolloutId !== undefined) requireLane(rolloutId)
              return optimizationLanes
                .filter(lane => rolloutId === undefined || lane.rolloutId === rolloutId)
                .flatMap(lane => (laneTraces.get(lane.rolloutId) ?? []).map((entry, index) => ({
                  rolloutId: lane.rolloutId,
                  index,
                  ...entry,
                })))
                .filter(entry => entry.text.toLocaleLowerCase().includes(normalized))
                .slice(0, limit)
            },
          },
          softTokenBudget: record.snapshot.config.search.reflection.softTokenBudget,
        })
      },
    })
    record.handles.add(handle)
    record.snapshot.activeSessionIds.push(String(sessionId))
    await this.persist(record)
    const detach = this.observer.attachSession(handle.agent, {
      runId: record.snapshot.runId,
      epoch,
      rolloutId: 'reflector',
      role: 'reflector',
    })
    try {
      handle.agent.followup(createUserMessage({
        source: { kind: 'user' },
        content: [{
          type: 'text',
          text: 'Compare the current epoch trajectories and the exact text-parameter revisions they consumed. Explore evidence as needed, then submit one concise atomic update for only the registered parameters that should change.',
        }],
      }))
      await handle.agent.whenIdle()
      while (
        capture?.plan() === undefined
        && lastTurnReason(handle.agent.session.events) === 'max-tokens'
        && sessionTokens(handle.agent.session.events) <= record.snapshot.config.search.reflection.softTokenBudget
          + record.snapshot.config.search.reflection.maxOutputTokensPerRequest
      ) {
        handle.agent.followup(createUserMessage({
          source: { kind: 'user' },
          content: [{
            type: 'text',
            text: 'Continue the same comparative reflection. Preserve the evidence already gathered and submit the atomic parameter update when ready.',
          }],
        }))
        await handle.agent.whenIdle()
      }
      this.accountSessionUsage(record, String(sessionId), sessionUsage(handle.agent.session.events))
      return capture?.plan() ?? neutralParameterUpdatePlan(parameters)
    } finally {
      detach()
      record.handles.delete(handle)
      record.snapshot.activeSessionIds = record.snapshot.activeSessionIds.filter(id => id !== String(sessionId))
      await handle.dispose()
      await this.persist(record)
    }
  }

  private async acceptFinalCandidate(
    record: RunRecord,
    owner: Agent,
    worktree: string,
    receipt: ProofReceipt,
  ): Promise<void> {
    record.snapshot.finalReceipt = receipt
    if (!record.snapshot.config.search.whiteboxReview) {
      await this.promoteFinalCandidate(record, worktree, receipt)
      await this.finalize(record, 'PROVED', 'Lean checker accepted the complete theorem; white-box review disabled by experiment config')
      return
    }
    await this.transition(record, 'REVIEWING', 'running read-only white-box reward-hacking review')
    const sessionId = SessionId(`${record.snapshot.runId}-final-review`)
    let capture: ReturnType<ProofRoleService['installReviewer']> | undefined
    const handle = await this.ctx.agents.create({
      sessionId,
      meta: {
        cwd: worktree,
        parentSession: owner.id,
        origin: 'subagent',
        delegationDepth: (owner.session.header.delegationDepth ?? 0) + 1,
      },
      agentOptions: {
        provider: record.snapshot.config.search.provider,
        model: record.snapshot.config.search.model,
        maxTokens: record.snapshot.config.search.reflection.maxOutputTokensPerRequest,
      },
      signal: record.controller.signal,
      setup: agentCtx => {
        const agent = agentCtx.agent
        if (agent === undefined) throw new Error('DSH did not associate the unpublished reviewer agent')
        this.ctx.get('agentPresets')?.composeFrom(agentCtx, owner.ctx)
        capture = this.roles.installReviewer(agentCtx, { agent, resolvedCase: record.resolvedCase, receipt })
      },
    })
    record.handles.add(handle)
    record.snapshot.activeSessionIds.push(String(sessionId))
    await this.persist(record)
    const detach = this.observer.attachSession(handle.agent, {
      runId: record.snapshot.runId,
      epoch: record.snapshot.epoch,
      rolloutId: 'reviewer',
      role: 'reviewer',
    })
    try {
      handle.agent.followup(createUserMessage({
        source: { kind: 'user' },
        content: [{
          type: 'text',
          text: 'Inspect the checker-accepted Lean candidate for semantic reward hacking. Submit the final white-box review after reading the relevant proof and interfaces.',
        }],
      }))
      await handle.agent.whenIdle()
      this.accountSessionUsage(record, String(sessionId), sessionUsage(handle.agent.session.events))
      const review: WhiteboxReview | undefined = capture?.review()
      if (review !== undefined) record.snapshot.whiteboxReview = review
      if (review?.approved === true) {
        await this.promoteFinalCandidate(record, worktree, receipt)
        await this.finalize(record, 'PROVED', 'Lean checker and white-box review accepted the complete theorem')
      } else {
        await this.finalize(record, 'UNKNOWN', review === undefined
          ? 'checker passed but reviewer did not submit a valid assessment'
          : `checker passed but white-box review vetoed the candidate: ${review.recommendation}`)
      }
    } finally {
      detach()
      record.handles.delete(handle)
      record.snapshot.activeSessionIds = record.snapshot.activeSessionIds.filter(id => id !== String(sessionId))
      await handle.dispose()
      await this.persist(record)
    }
  }

  private async promoteFinalCandidate(
    record: RunRecord,
    worktree: string,
    receipt: ProofReceipt,
  ): Promise<void> {
    if (!receipt.finalAccepted || receipt.obligationsClosed !== receipt.obligationsTotal) {
      throw new Error('cannot promote an incomplete Lean receipt as the trusted final candidate')
    }
    const commit = await this.git.head(worktree, record.controller.signal)
    record.snapshot.trustedCommit = commit
    record.snapshot.searchBaseCommit = commit
    record.snapshot.trustedObligationsClosed = receipt.obligationsClosed
  }

  private async disposeLanes(record: RunRecord, lanes: readonly LaneRuntime[]): Promise<void> {
    for (const lane of lanes) {
      lane.detachObserver()
      record.handles.delete(lane.handle)
      record.snapshot.activeSessionIds = record.snapshot.activeSessionIds.filter(
        id => id !== lane.evidence.sessionId,
      )
      await lane.handle.dispose()
      if (!this.config.preserveWorktrees) {
        await this.git.removeWorktree(record.resolvedCase.root, lane.worktree)
      }
    }
    await this.persist(record)
  }

  private async disposeRemainingHandles(record: RunRecord): Promise<void> {
    const handles = [...record.handles]
    record.handles.clear()
    handles.forEach(handle => this.accountSessionUsage(
      record,
      String(handle.agent.session.id),
      sessionUsage(handle.agent.session.events),
    ))
    await Promise.allSettled(handles.map(handle => handle.dispose()))
    record.snapshot.activeSessionIds = []
    await this.persist(record)
  }

  private async readHistoricalSnapshots(): Promise<ProofRunSnapshot[]> {
    let entries: string[]
    try {
      entries = await readdir(this.config.defaultRunRoot)
    } catch {
      return []
    }
    const snapshots = await Promise.all(entries
      .filter(entry => /^[A-Za-z0-9._-]+$/.test(entry))
      .map(async entry => {
        try {
          const parsed: unknown = JSON.parse(await readFile(
            join(this.config.defaultRunRoot, entry, 'run.json'),
            'utf8',
          ))
          return isProofRunSnapshot(parsed) ? this.asHistoricalSnapshot(parsed) : undefined
        } catch {
          return undefined
        }
      }))
    return snapshots.filter((snapshot): snapshot is ProofRunSnapshot => snapshot !== undefined)
  }

  private asHistoricalSnapshot(snapshot: ProofRunSnapshot): ProofRunSnapshot {
    if (terminal(snapshot.state)) return clone(snapshot)
    const recovered = clone(snapshot)
    recovered.state = 'ABORTED'
    recovered.activeSessionIds = []
    recovered.stopReason = 'DSH process ended before this run reached a terminal state'
    recovered.completedAt ??= recovered.updatedAt
    return recovered
  }

  private addTokenUsage(record: RunRecord, usage: ProofRunSnapshot['tokenUsage']): void {
    record.snapshot.tokenUsage.inputTokens += usage.inputTokens
    record.snapshot.tokenUsage.outputTokens += usage.outputTokens
    record.snapshot.tokenUsage.cacheReadTokens += usage.cacheReadTokens
    record.snapshot.tokenUsage.cacheWriteTokens += usage.cacheWriteTokens
    record.snapshot.tokenUsage.reasoningTokens += usage.reasoningTokens
    record.snapshot.tokenUsage.totalTokens += usage.totalTokens
    record.snapshot.totalTokens = record.snapshot.tokenUsage.totalTokens
  }

  private accountSessionUsage(
    record: RunRecord,
    sessionId: string,
    usage: ProofRunSnapshot['tokenUsage'],
  ): void {
    const previous = record.accountedSessionUsage.get(sessionId) ?? emptyTokenUsage()
    const delta: ProofRunSnapshot['tokenUsage'] = {
      inputTokens: Math.max(0, usage.inputTokens - previous.inputTokens),
      outputTokens: Math.max(0, usage.outputTokens - previous.outputTokens),
      cacheReadTokens: Math.max(0, usage.cacheReadTokens - previous.cacheReadTokens),
      cacheWriteTokens: Math.max(0, usage.cacheWriteTokens - previous.cacheWriteTokens),
      reasoningTokens: Math.max(0, usage.reasoningTokens - previous.reasoningTokens),
      totalTokens: Math.max(0, usage.totalTokens - previous.totalTokens),
    }
    record.accountedSessionUsage.set(sessionId, { ...usage })
    record.snapshot.sessionTokenUsage ??= {}
    record.snapshot.sessionTokenUsage[sessionId] = { ...usage }
    this.addTokenUsage(record, delta)
  }

  private worktreePath(id: string, epoch: number, lane: string): string {
    return join(tmpdir(), 'tokens-as-parameters', id, `epoch-${epoch}`, lane)
  }

  private throwIfStopped(record: RunRecord): void {
    if (record.controller.signal.aborted) throw new Error('proof run stopped')
  }

  private async transition(record: RunRecord, state: ProofRunSnapshot['state'], message: string): Promise<void> {
    record.snapshot.state = state
    record.snapshot.updatedAt = new Date().toISOString()
    this.observer.setState(record.snapshot.runId, state)
    await this.observer.emit({
      runId: record.snapshot.runId,
      type: `run/${state.toLocaleLowerCase()}`,
      state,
      message,
      epoch: record.snapshot.epoch,
    })
    await this.persist(record)
  }

  private async finalize(
    record: RunRecord,
    state: Extract<ProofRunSnapshot['state'], 'PROVED' | 'DISPROVED' | 'UNKNOWN' | 'ABORTED' | 'FAILED'>,
    reason: string,
  ): Promise<void> {
    if (terminal(record.snapshot.state) && record.snapshot.completedAt !== undefined) return
    if (state === 'PROVED' && (
      record.snapshot.finalReceipt?.finalAccepted !== true
      || record.snapshot.trustedObligationsClosed !== record.snapshot.obligationsTotal
    )) {
      throw new Error('PROVED requires a final accepted receipt and complete trusted progress')
    }
    record.snapshot.state = state
    record.snapshot.stopReason = reason
    record.snapshot.completedAt = new Date().toISOString()
    record.snapshot.updatedAt = record.snapshot.completedAt
    record.snapshot.activeSessionIds = []
    this.observer.setState(record.snapshot.runId, state)
    await this.observer.emit({
      runId: record.snapshot.runId,
      type: 'run/finalized',
      state,
      message: reason,
      epoch: record.snapshot.epoch,
    })
    await this.persist(record)
  }

  private persist(record: RunRecord): Promise<void> {
    const snapshot = clone(record.snapshot)
    record.persisting = record.persisting.then(async () => {
      await this.observer.persistSnapshot(record.directory, snapshot)
      this.publishProjection(record.owner, snapshot)
    })
    return record.persisting
  }

  private publishProjection(owner: Agent, snapshot: ProofRunSnapshot): void {
    const current = this.ctx.get('sessionProjections')?.stateOf(owner.session, 'proofRuns')
      ?? { activeRunId: null, runs: [] }
    const runs = new Map(current.runs.map(run => [run.runId, run]))
    runs.set(snapshot.runId, toProofRunView(snapshot))
    const ordered = [...runs.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    const active = ordered.find(run => !terminal(run.state))
    owner.session.append('tokens-as-parameters/proof-runs', {
      activeRunId: active?.runId ?? null,
      runs: ordered,
    })
  }
}
