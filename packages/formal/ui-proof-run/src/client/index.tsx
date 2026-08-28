import { useEffect, useMemo, useState } from 'react'
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  ProofRunsProjection,
  ProofRunView,
} from '@tokens-as-parameters/proof-contracts/dsh-surface'

const NS = 'proofRun'

const zh = {
  'view.label': '证明运行',
  'empty.title': '当前会话还没有证明运行',
  'empty.body': '使用 /chip_proof <case-id> 启动实验后，Proof Runtime 状态会实时显示在这里。',
  'run.history': '运行记录',
  'run.active': '运行中',
  'run.terminal': '已结束',
  'metric.state': '任务状态',
  'metric.elapsed': '运行时长',
  'metric.progress': '可信进度',
  'metric.epoch': '当前轮次',
  'metric.tokens': '总 Token',
  'pipeline.title': 'Proof Runtime 状态机',
  'stage.PREPARING': '预检查',
  'stage.PROVING': '并行证明',
  'stage.CONSOLIDATING': '可信合并',
  'stage.REFLECTING': '相对反思',
  'stage.REVIEWING': '白盒审查',
  'sessions.title': 'Agent 会话',
  'sessions.empty': '当前阶段没有活动 Agent；可回看最近一轮会话。',
  'session.open': '打开会话',
  'session.active': '活动',
  'session.completed': '本轮完成',
  'session.prover': '证明器',
  'session.reflector': '反思器',
  'session.reviewer': '审查器',
  'session.other': '运行组件',
  'action.stop': '停止运行',
  'action.stopping': '正在停止…',
  'action.failed': '操作失败：{message}',
  'terminal.reason': '结束原因',
} as const

const en: Record<keyof typeof zh, string> = {
  'view.label': 'Proof Run',
  'empty.title': 'No proof run belongs to this session yet',
  'empty.body': 'Start an experiment with /chip_proof <case-id>; Proof Runtime state will stream here.',
  'run.history': 'Run history',
  'run.active': 'running',
  'run.terminal': 'finished',
  'metric.state': 'Run state',
  'metric.elapsed': 'Elapsed',
  'metric.progress': 'Trusted progress',
  'metric.epoch': 'Epoch',
  'metric.tokens': 'Total tokens',
  'pipeline.title': 'Proof Runtime state machine',
  'stage.PREPARING': 'Preflight',
  'stage.PROVING': 'Parallel proof',
  'stage.CONSOLIDATING': 'Trusted merge',
  'stage.REFLECTING': 'Relative reflection',
  'stage.REVIEWING': 'White-box review',
  'sessions.title': 'Agent sessions',
  'sessions.empty': 'No Agent is active in this stage; the latest epoch remains available.',
  'session.open': 'Open session',
  'session.active': 'active',
  'session.completed': 'epoch complete',
  'session.prover': 'Prover',
  'session.reflector': 'Reflector',
  'session.reviewer': 'Reviewer',
  'session.other': 'Runtime component',
  'action.stop': 'Stop run',
  'action.stopping': 'Stopping…',
  'action.failed': 'Action failed: {message}',
  'terminal.reason': 'Terminal reason',
}

type ProofRunKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    proofRun: ProofRunKey
  }
}

interface DashboardActions {
  stop(runId: string): Promise<{ ok: true } | { ok: false; message: string }>
  openSession(sessionId: string): Promise<{ ok: true } | { ok: false; message: string }>
}

type DashboardProps = ConvViewProps & InjectFace<DashboardActions> & PropsLocale<typeof NS>

const TERMINAL = new Set<ProofRunView['state']>(['PROVED', 'DISPROVED', 'UNKNOWN', 'ABORTED', 'FAILED'])
const PIPELINE: ReadonlyArray<Extract<ProofRunView['state'], 'PREPARING' | 'PROVING' | 'CONSOLIDATING' | 'REFLECTING' | 'REVIEWING'>> = [
  'PREPARING', 'PROVING', 'CONSOLIDATING', 'REFLECTING', 'REVIEWING',
]

const STYLE = `
.tap-proof{box-sizing:border-box;height:100%;overflow:auto;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);padding:24px}.tap-proof *{box-sizing:border-box}.tap-proof__empty{height:100%;display:grid;place-content:center;text-align:center;gap:8px;color:var(--dsw-alias-label-tertiary)}.tap-proof__empty h2{margin:0;color:var(--dsw-alias-label-primary);font-size:18px}.tap-proof__empty p{margin:0;max-width:560px;font-size:13px;line-height:1.6}.tap-proof__head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}.tap-proof__identity{min-width:0}.tap-proof__case{font-size:22px;font-weight:650;line-height:1.25}.tap-proof__id{margin-top:4px;color:var(--dsw-alias-label-caption);font:12px/1.4 var(--ds-font-family-code);overflow:hidden;text-overflow:ellipsis}.tap-proof__controls{display:flex;gap:8px;align-items:center}.tap-proof select,.tap-proof button{font:inherit}.tap-proof__select{max-width:320px;height:34px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);padding:0 10px}.tap-proof__stop{height:34px;border:0;border-radius:8px;background:var(--dsw-alias-state-error-primary);color:white;padding:0 14px;cursor:pointer}.tap-proof__stop:disabled{opacity:.5;cursor:default}.tap-proof__metrics{display:grid;grid-template-columns:repeat(5,minmax(116px,1fr));gap:10px;margin-bottom:18px}.tap-proof__metric,.tap-proof__panel{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:12px}.tap-proof__metric{padding:12px}.tap-proof__metric-label{color:var(--dsw-alias-label-tertiary);font-size:12px}.tap-proof__metric-value{margin-top:6px;font-size:18px;font-weight:650}.tap-proof__state{display:inline-flex;align-items:center;gap:7px}.tap-proof__dot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-label-caption)}.tap-proof__dot--live{background:var(--dsw-alias-state-success-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-success-primary) 15%,transparent)}.tap-proof__dot--bad{background:var(--dsw-alias-state-error-primary)}.tap-proof__panel{padding:16px;margin-bottom:14px}.tap-proof__panel h3{font-size:14px;margin:0 0 14px}.tap-proof__pipeline{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.tap-proof__stage{position:relative;min-height:50px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;padding:9px;color:var(--dsw-alias-label-tertiary);font-size:12px}.tap-proof__stage--active{border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 9%,transparent);color:var(--dsw-alias-label-primary);font-weight:600}.tap-proof__sessions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.tap-proof__session{display:flex;align-items:center;gap:10px;min-width:0;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:11px}.tap-proof__session-main{min-width:0;flex:1}.tap-proof__session-title{font-size:13px;font-weight:600}.tap-proof__session-id{margin-top:3px;color:var(--dsw-alias-label-caption);font:11px/1.35 var(--ds-font-family-code);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tap-proof__session-meta{margin-top:5px;color:var(--dsw-alias-label-tertiary);font-size:11px}.tap-proof__open{height:30px;flex:none;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0 10px}.tap-proof__reason{margin-top:10px;padding:10px 12px;border-radius:8px;background:var(--dsw-specific-tip);font-size:12px;line-height:1.5}.tap-proof__error{margin:10px 0;color:var(--dsw-alias-state-error-primary);font-size:12px}@media(max-width:900px){.tap-proof{padding:16px}.tap-proof__head{flex-direction:column}.tap-proof__controls{width:100%}.tap-proof__select{flex:1}.tap-proof__metrics{grid-template-columns:repeat(2,1fr)}.tap-proof__pipeline{grid-template-columns:1fr}.tap-proof__sessions{grid-template-columns:1fr}}
`

function formatTokens(value: number): string {
  if (value < 1_000) return String(value)
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1)}K`
  return `${(value / 1_000_000).toFixed(2)}M`
}

function formatDuration(startedAt: string | undefined, completedAt: string | undefined, now: number): string {
  if (startedAt === undefined) return '—'
  const end = completedAt === undefined ? now : Date.parse(completedAt)
  const seconds = Math.max(0, Math.floor((end - Date.parse(startedAt)) / 1_000))
  const hours = Math.floor(seconds / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  const rest = seconds % 60
  return hours > 0 ? `${hours}h ${minutes}m` : minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`
}

function sessionRole(id: string): 'prover' | 'reflector' | 'reviewer' | 'other' {
  if (id.endsWith('-reflector')) return 'reflector'
  if (id.endsWith('-final-review')) return 'reviewer'
  if (/-r\d+$/.test(id)) return 'prover'
  return 'other'
}

function runSessions(run: ProofRunView): Array<{
  id: string
  active: boolean
  role: ReturnType<typeof sessionRole>
  detail: string
}> {
  const active = new Set(run.activeSessionIds)
  const latestEpoch = Math.max(run.epoch, ...run.lanes.map(lane => lane.epoch))
  const ids = new Set([
    ...run.activeSessionIds,
    ...run.lanes.filter(lane => lane.epoch === latestEpoch).map(lane => lane.sessionId),
  ])
  return [...ids].map(id => {
    const lane = run.lanes.find(item => item.sessionId === id)
    return {
      id,
      active: active.has(id),
      role: sessionRole(id),
      detail: lane === undefined
        ? `${formatTokens(run.sessionTokens[id] ?? 0)} · epoch ${run.epoch}`
        : `${formatTokens(lane.tokens)} · ${lane.obligationsClosed}/${lane.obligationsTotal}`,
    }
  })
}

function ProofRunDashboard({ useProjection, stop, openSession, t }: DashboardProps): JSX.Element {
  const projection = useProjection('proofRuns') as ProofRunsProjection | undefined
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [stopping, setStopping] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const runs = projection?.runs ?? []
  const effectiveId = selectedId !== null && runs.some(run => run.runId === selectedId)
    ? selectedId
    : projection?.activeRunId ?? runs[0]?.runId ?? null
  const run = runs.find(item => item.runId === effectiveId)
  const isTerminal = run === undefined || TERMINAL.has(run.state)
  const sessions = useMemo(() => run === undefined ? [] : runSessions(run), [run])

  useEffect(() => {
    if (isTerminal) return undefined
    const timer = window.setInterval(() => { setNow(Date.now()) }, 1_000)
    return () => { window.clearInterval(timer) }
  }, [isTerminal])

  if (run === undefined) {
    return <div className="tap-proof"><div className="tap-proof__empty"><h2>{t('empty.title')}</h2><p>{t('empty.body')}</p></div></div>
  }

  const handleStop = async (): Promise<void> => {
    setStopping(true)
    setActionError(null)
    const result = await stop(run.runId)
    setStopping(false)
    if (!result.ok) setActionError(t('action.failed', { message: result.message }))
  }

  return <div className="tap-proof" data-proof-run={run.runId}>
    <div className="tap-proof__head">
      <div className="tap-proof__identity">
        <div className="tap-proof__case">{run.caseId}</div>
        <div className="tap-proof__id">{run.runId}</div>
      </div>
      <div className="tap-proof__controls">
        <select className="tap-proof__select" aria-label={t('run.history')} value={run.runId} onChange={event => { setSelectedId(event.target.value) }}>
          {runs.map(item => <option key={item.runId} value={item.runId}>{item.caseId} · {item.state} · {item.createdAt.slice(0, 19)}</option>)}
        </select>
        {!isTerminal && <button className="tap-proof__stop" type="button" disabled={stopping} onClick={() => { void handleStop() }}>{stopping ? t('action.stopping') : t('action.stop')}</button>}
      </div>
    </div>
    {actionError !== null && <div className="tap-proof__error" role="alert">{actionError}</div>}
    <div className="tap-proof__metrics">
      <Metric label={t('metric.state')} value={<span className="tap-proof__state"><span className={`tap-proof__dot ${!isTerminal ? 'tap-proof__dot--live' : run.state === 'FAILED' || run.state === 'DISPROVED' ? 'tap-proof__dot--bad' : ''}`} />{run.state}</span>} />
      <Metric label={t('metric.elapsed')} value={formatDuration(run.startedAt, run.completedAt, now)} />
      <Metric label={t('metric.progress')} value={`${run.trustedObligationsClosed}/${run.obligationsTotal}`} />
      <Metric label={t('metric.epoch')} value={String(run.epoch)} />
      <Metric label={t('metric.tokens')} value={formatTokens(run.totalTokens)} />
    </div>
    <section className="tap-proof__panel">
      <h3>{t('pipeline.title')}</h3>
      <div className="tap-proof__pipeline">
        {PIPELINE.map(stage => <div key={stage} className={`tap-proof__stage ${run.state === stage ? 'tap-proof__stage--active' : ''}`}><strong>{t(`stage.${stage}`)}</strong><div>{stage}</div></div>)}
      </div>
    </section>
    <section className="tap-proof__panel">
      <h3>{t('sessions.title')}</h3>
      {sessions.length === 0 ? <div className="tap-proof__metric-label">{t('sessions.empty')}</div> : <div className="tap-proof__sessions">
        {sessions.map(session => <div className="tap-proof__session" key={session.id}>
          <span className={`tap-proof__dot ${session.active ? 'tap-proof__dot--live' : ''}`} />
          <div className="tap-proof__session-main">
            <div className="tap-proof__session-title">{t(`session.${session.role}`)} · {session.active ? t('session.active') : t('session.completed')}</div>
            <div className="tap-proof__session-id">{session.id}</div>
            <div className="tap-proof__session-meta">{session.detail}</div>
          </div>
          <button className="tap-proof__open" type="button" onClick={() => { void openSession(session.id).then(result => { if (!result.ok) setActionError(t('action.failed', { message: result.message })) }) }}>{t('session.open')}</button>
        </div>)}
      </div>}
      {run.stopReason !== undefined && <div className="tap-proof__reason"><strong>{t('terminal.reason')}：</strong>{run.stopReason}</div>}
    </section>
  </div>
}

function Metric({ label, value }: { label: string; value: JSX.Element | string }): JSX.Element {
  return <div className="tap-proof__metric"><div className="tap-proof__metric-label">{label}</div><div className="tap-proof__metric-value">{value}</div></div>
}

export const inject = ['slots', 'sessions', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-proof-run: dictionaries')
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = '@tokens-as-parameters/ui-proof-run'
    style.textContent = STYLE
    document.head.appendChild(style)
    return () => { style.remove() }
  }, 'ui-proof-run: styles')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'proof-run',
    order: 20,
    locale: NS,
    label: () => t('view.label'),
    inject: (ownerSessionId): DashboardActions => ({
      async stop(runId) {
        const binding = ctx.sessions.binding(ownerSessionId)
        if (binding === undefined) return { ok: false, message: 'owner session is unavailable' }
        const result = await binding.session.command(`/proof-stop ${runId}`)
        if (!result.ok) return { ok: false, message: `${result.error.message} (${result.error.code})` }
        return result.value.matched ? { ok: true } : { ok: false, message: 'proof-stop command is unavailable' }
      },
      async openSession(rawSessionId) {
        const sessionId = rawSessionId as SessionId
        try {
          await ctx.sessions.refreshSubagents(ownerSessionId)
          const address = ctx.sessions.subagentAddress(sessionId)
          if (address !== undefined) ctx.sessions.openSubagent(address)
          else ctx.sessions.open(sessionId)
          return { ok: true }
        } catch (error) {
          return { ok: false, message: error instanceof Error ? error.message : String(error) }
        }
      },
    }),
  }, ProofRunDashboard))
}
