import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { LaneEvidence, TokenUsageSummary, TraceEntry } from './contracts.js'

export function emptyTokenUsage(): TokenUsageSummary {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
  }
}

export function sessionUsage(events: readonly SessionEvent[]): TokenUsageSummary {
  const summary = emptyTokenUsage()
  for (const event of events) {
    if (event.type !== 'assistant/message' || event.data.usage === undefined) continue
    const usage = event.data.usage
    summary.inputTokens += usage.inputTokens
    summary.outputTokens += usage.outputTokens
    summary.cacheReadTokens += usage.cacheReadTokens ?? 0
    summary.cacheWriteTokens += usage.cacheWriteTokens ?? 0
    summary.reasoningTokens += usage.reasoningTokens ?? 0
  }
  summary.totalTokens = summary.inputTokens
    + summary.outputTokens
    + summary.cacheReadTokens
    + summary.cacheWriteTokens
  return summary
}

export function sessionTokens(events: readonly SessionEvent[]): number {
  return sessionUsage(events).totalTokens
}

function textFrom(value: unknown, output: string[] = []): string[] {
  if (typeof value === 'string') output.push(value)
  else if (Array.isArray(value)) value.forEach(item => textFrom(item, output))
  else if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(item => textFrom(item, output))
  }
  return output
}

function compact(value: unknown, limit = 2_000): string {
  const text = textFrom(value).join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return text.length <= limit ? text : text.slice(-limit)
}

export function sessionTrace(events: readonly SessionEvent[]): TraceEntry[] {
  const output: TraceEntry[] = []
  for (const event of events) {
    if (event.type === 'assistant/message') {
      output.push({ kind: 'assistant', text: compact(event.data.message.content, 3_000) })
    } else if (event.type === 'tool/call') {
      output.push({ kind: 'tool-call', text: `${event.data.name} ${compact(event.data.arguments, 1_000)}` })
    } else if (event.type === 'tool/result') {
      output.push({ kind: 'tool-result', text: compact(event.data.message.content, 2_000) })
    } else if (event.type === 'turn/end') {
      output.push({ kind: 'turn-end', text: JSON.stringify(event.data.reason) })
    }
  }
  return output
}

export function sessionTraceTail(events: readonly SessionEvent[], limit = 24): LaneEvidence['traceTail'] {
  return sessionTrace(events).slice(-limit)
}

export function lastTurnReason(events: readonly SessionEvent[]): string | undefined {
  const event = events.findLast(item => item.type === 'turn/end')
  return event?.type === 'turn/end' ? event.data.reason.kind : undefined
}
