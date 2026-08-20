import { join } from "node:path"
import type { AgentId } from "../registry"
import type { AgentAdapter } from "../types"
import type { TokenBreakdown, UsageEvent } from "../../usage/types"
import { readJsonl, tokenCount, walkFiles } from "../../usage/parse"
import { fileSession, recordOf, textOf, usageEvent } from "./shared/json"

/** Raw cumulative or per-turn snapshot from a `token_count` event. */
interface Totals {
  input: number
  output: number
  cacheRead: number
  reasoning: number
}

/** Token-bearing event awaiting a model name from a later record. */
interface PendingEvent {
  provider: string
  project: string | null
  timestamp: unknown
  tokens: TokenBreakdown
  total: Totals | null
}

interface ForkState {
  /** Session id of the fork parent; scopes dedup keys across sibling replays. */
  forkedFromId: string | null
  childSessionId: string | null
  /** Set while skipping replayed parent history in a forked child log. */
  waiting: boolean
  /** Parent session_meta id embedded before replayed parent history. */
  replaySessionId: string | null
  /** Last replayed cumulative totals; replays at or below it are skipped. */
  inheritedBaseline: Totals | null
  inheritedReportedTotal: number | null
  /** turn_ids announced by child-local task_started events during the skip. */
  taskStartedTurnIds: Set<string>
  isUserFork: boolean
}

export const codexAdapter: AgentAdapter = {
  id: "codex",
  label: "Codex CLI",
  version: 3,
  async *discover(context) {
    const home = context.env.CODEX_HOME?.trim() || join(context.home, ".codex")
    for (const root of [join(home, "sessions"), join(home, "archived_sessions")]) {
      for (const path of await walkFiles(root, (name) => name.endsWith(".jsonl"))) {
        yield { agent: "codex", path, kind: "jsonl" }
      }
    }
  },
  // Always parses the whole file (no resume cursor): fork-replay skipping and
  // cumulative-total deltas need state from the top of the log.
  async parse(source, context) {
    const result = await readJsonl(source.path)
    if (result.malformed > 0) context.warn(`${result.malformed} malformed JSONL record(s)`)
    const sessionId = source.path.split(/[\\/]/u).at(-1)?.replace(/\.jsonl$/u, "") ?? fileSession(source.path)
    const events: UsageEvent[] = []
    const pending: PendingEvent[] = []
    let model: string | null = null
    let provider = "openai"
    let project: string | null = null
    let metaSessionId: string | null = null
    let previous: Totals | null = null
    const fork: ForkState = {
      forkedFromId: null,
      childSessionId: null,
      waiting: false,
      replaySessionId: null,
      inheritedBaseline: null,
      inheritedReportedTotal: null,
      taskStartedTurnIds: new Set(),
      isUserFork: false,
    }

    const emit = (entry: PendingEvent, eventModel: string | null): void => {
      const scope = fork.forkedFromId ?? metaSessionId ?? sessionId
      const name = eventModel ?? "unknown"
      const dedupKey = entry.total
        ? `${scope}:${entry.provider}:${name}:${entry.total.input}:${entry.total.output}:${entry.total.cacheRead}:${entry.total.reasoning}`
        : `${scope}:${entry.provider}:${name}:${entry.timestamp}:${entry.tokens.input}:${entry.tokens.output}:${entry.tokens.cacheRead}:${entry.tokens.reasoning}`
      const agent: AgentId = entry.provider === "sakana" ? "sakana" : "codex"
      const event = usageEvent({
        agent,
        path: source.path,
        identity: dedupKey,
        provider: entry.provider,
        model: eventModel,
        sessionId,
        project: entry.project,
        timestamp: entry.timestamp,
        timezone: context.timezone,
        tokens: entry.tokens,
        dedupKey,
      })
      if (event) events.push(event)
      else context.warn("token record has no valid timestamp")
    }
    const flushPending = (resolvedModel: string | null): void => {
      for (const entry of pending) emit(entry, resolvedModel)
      pending.length = 0
    }

    for (const line of result.lines) {
      const entry = recordOf(line.value)
      const payload = recordOf(entry?.payload)
      if (!entry || !payload) continue
      const info = recordOf(payload.info)
      const isTokenCount = entry.type === "event_msg" && payload.type === "token_count"
      const infoModel = isTokenCount && info ? textOf(info.model) ?? textOf(info.model_name) : null
      const modelInfo = recordOf(payload.model_info)
      const payloadModel =
        textOf(modelInfo?.slug) ?? textOf(payload.model) ?? textOf(payload.model_name) ?? infoModel
      const eventModel = payloadModel ?? infoModel

      // Forked child logs replay the parent transcript (including its
      // token_count history) before the child's own turns. Skip everything
      // until a turn_context that belongs to the child itself.
      if (fork.waiting) {
        if (entry.type === "turn_context" && forkTurnStartsOwnSession(fork, textOf(payload.turn_id))) {
          fork.waiting = false
          fork.replaySessionId = null
          fork.taskStartedTurnIds.clear()
          fork.isUserFork = false
          if (fork.childSessionId) metaSessionId = fork.childSessionId
          model = payloadModel
          project = textOf(payload.cwd) ?? project
          continue
        }
        if (entry.type === "event_msg" && payload.type === "task_started") {
          const turnId = textOf(payload.turn_id)
          if (turnId && forkTaskStartsOwnSession(fork, turnId, payload.started_at)) {
            fork.taskStartedTurnIds.add(turnId)
          }
        }
        if (entry.type === "session_meta") {
          const id = textOf(payload.id)
          if (id && fork.childSessionId && fork.childSessionId !== id) fork.replaySessionId = id
        }
        if (isTokenCount && info) {
          const usage = recordOf(info.total_token_usage)
          const totals = readTotals(usage)
          if (usage && totals) {
            previous = totals
            fork.inheritedBaseline = totals
            fork.inheritedReportedTotal = reportedTotal(usage)
          }
        }
        continue
      }

      if (pending.length > 0 && !eventModel && !isTokenCount && entry.type !== "session_meta") {
        flushPending(null)
      }

      if (entry.type === "session_meta") {
        const id = textOf(payload.id)
        if (id) metaSessionId = id
        const source_ = recordOf(payload.source)
        const forkedFromId =
          textOf(payload.forked_from_id) ??
          textOf(recordOf(recordOf(source_?.subagent)?.thread_spawn)?.parent_thread_id)
        if (forkedFromId) {
          // The waiting branch above consumes every record, so a repeated
          // child meta can only be seen after the skip already ended.
          const repeatedChildMeta = id !== null && fork.childSessionId === id
          fork.forkedFromId = forkedFromId
          fork.childSessionId = id
          if (!repeatedChildMeta) {
            fork.waiting = true
            fork.replaySessionId = null
            fork.inheritedBaseline = null
            fork.inheritedReportedTotal = null
            fork.taskStartedTurnIds.clear()
            fork.isUserFork = textOf(payload.thread_source) === "user"
          }
        }
        provider = textOf(payload.model_provider) ?? provider
        project = textOf(payload.cwd) ?? project
        continue
      }
      if (entry.type === "turn_context") {
        model = payloadModel ?? model
        provider = textOf(payload.model_provider) ?? provider
        project = textOf(payload.cwd) ?? project
        if (model) flushPending(model)
        continue
      }
      if (!isTokenCount || !info) continue

      const resolved = payloadModel ?? infoModel ?? model
      if (resolved) {
        model = resolved
        flushPending(resolved)
      }
      const totalUsage = recordOf(info.total_token_usage)
      const total = readTotals(totalUsage)
      const last = readTotals(recordOf(info.last_token_usage))

      // A forked child can replay several parent token_count rows after its
      // first own turn_context; skip while totals stay within the baseline.
      if (skipInheritedSnapshot(fork, totalUsage, total)) continue
      fork.inheritedBaseline = null
      fork.inheritedReportedTotal = null

      let tokens: TokenBreakdown
      let nextTotals: Totals | null
      if (total && last && previous) {
        if (sameTotals(total, previous)) continue
        // Out-of-order snapshots regress slightly and then resume from the
        // true watermark; counting `last` again would double bill the turn.
        if (!subtract(total, previous) && staleRegression(total, previous, last)) continue
        tokens = toTokens(last)
        nextTotals = total
      } else if (total && last) {
        // First event: use last (not the full total) so tokens carried in
        // from a resumed session are not counted again.
        tokens = toTokens(last)
        nextTotals = total
      } else if (total && previous) {
        if (sameTotals(total, previous)) continue
        const delta = subtract(total, previous)
        if (!delta) {
          previous = total
          continue
        }
        tokens = toTokens(delta)
        nextTotals = total
      } else if (total) {
        tokens = toTokens(total)
        nextTotals = total
      } else if (last) {
        tokens = toTokens(last)
        nextTotals = previous
          ? { input: previous.input + last.input, output: previous.output + last.output, cacheRead: previous.cacheRead + last.cacheRead, reasoning: previous.reasoning + last.reasoning }
          : null
      } else {
        continue
      }
      // Skip zero-token snapshots without advancing the baseline so that
      // post-compaction zero totals do not inflate later deltas.
      if (tokens.input === 0 && tokens.output === 0 && tokens.cacheRead === 0 && tokens.reasoning === 0) continue
      previous = nextTotals

      const record: PendingEvent = { provider, project, timestamp: entry.timestamp, tokens, total }
      if (resolved) emit(record, resolved)
      else pending.push(record)
    }
    flushPending(null)
    return { events }
  },
}

function readTotals(value: Record<string, unknown> | null): Totals | null {
  if (!value) return null
  return {
    input: tokenCount(value.input_tokens),
    output: tokenCount(value.output_tokens),
    cacheRead: Math.max(tokenCount(value.cached_input_tokens), tokenCount(value.cache_read_input_tokens)),
    reasoning: tokenCount(value.reasoning_output_tokens),
  }
}

/**
 * Codex reports `input_tokens` inclusive of cached tokens and
 * `reasoning_output_tokens` as a subset of `output_tokens`; split both out so
 * the additive buckets neither double count nor double bill.
 */
function toTokens(totals: Totals): TokenBreakdown {
  const cacheRead = Math.min(totals.cacheRead, totals.input)
  const reasoning = Math.min(totals.reasoning, totals.output)
  return {
    input: totals.input - cacheRead,
    output: totals.output - reasoning,
    cacheRead,
    cacheWrite: 0,
    reasoning,
  }
}

function sameTotals(a: Totals, b: Totals): boolean {
  return a.input === b.input && a.output === b.output && a.cacheRead === b.cacheRead && a.reasoning === b.reasoning
}

function subtract(now: Totals, old: Totals): Totals | null {
  if (now.input < old.input || now.output < old.output || now.cacheRead < old.cacheRead || now.reasoning < old.reasoning) return null
  return {
    input: now.input - old.input,
    output: now.output - old.output,
    cacheRead: now.cacheRead - old.cacheRead,
    reasoning: now.reasoning - old.reasoning,
  }
}

function sumOf(totals: Totals): number {
  return totals.input + totals.output + totals.cacheRead + totals.reasoning
}

/**
 * Some token_count snapshots arrive slightly out of order: the cumulative
 * total regresses by roughly one recent increment, then resumes from the true
 * higher watermark. Treat those as stale snapshots rather than hard resets.
 */
function staleRegression(current: Totals, previous: Totals, last: Totals): boolean {
  const previousTotal = sumOf(previous)
  const currentTotal = sumOf(current)
  const lastTotal = sumOf(last)
  if (previousTotal <= 0 || currentTotal <= 0 || lastTotal <= 0) return false
  return currentTotal * 100 >= previousTotal * 98 || currentTotal + lastTotal * 2 >= previousTotal
}

function reportedTotal(usage: Record<string, unknown>): number | null {
  const value = usage.total_tokens
  return typeof value === "number" && value >= 0 ? value : null
}

function skipInheritedSnapshot(
  fork: ForkState,
  totalUsage: Record<string, unknown> | null,
  total: Totals | null,
): boolean {
  if (totalUsage && fork.inheritedReportedTotal !== null) {
    const reported = reportedTotal(totalUsage)
    if (reported !== null && reported <= fork.inheritedReportedTotal) return true
  }
  if (total && fork.inheritedBaseline) {
    return (
      total.input <= fork.inheritedBaseline.input &&
      total.output <= fork.inheritedBaseline.output &&
      total.cacheRead <= fork.inheritedBaseline.cacheRead &&
      total.reasoning <= fork.inheritedBaseline.reasoning
    )
  }
  return false
}

/**
 * UUID v7 ids order by their 48-bit millisecond prefix (first 12 hex digits).
 * Returns the lowercase 32-hex order key, or null for non-v7 ids.
 */
function uuid7Key(id: string): string | null {
  const parts = id.split("-")
  if (parts.length !== 5 || parts.some((part, index) => part.length !== [8, 4, 4, 4, 12][index])) return null
  if (!parts[2].startsWith("7")) return null
  const key = parts.join("").toLowerCase()
  return /^[0-9a-f]{32}$/u.test(key) ? key : null
}

/**
 * Whether a turn_context seen while skipping replayed parent history belongs
 * to the forked child itself. The child's own turn is minted at or after its
 * session id; replayed parent turns are strictly earlier. Same-millisecond
 * ties resolve through task_started announcements (subagent forks) or the
 * fork millisecond itself (user forks).
 */
function forkTurnStartsOwnSession(fork: ForkState, turnId: string | null): boolean {
  if (fork.replaySessionId === null) return true
  if (!fork.childSessionId) return true
  const childKey = uuid7Key(fork.childSessionId)
  if (!turnId || !childKey) return true
  const turnKey = uuid7Key(turnId)
  if (!turnKey) return fork.isUserFork || fork.taskStartedTurnIds.has(turnId)
  if (turnKey.slice(0, 12) > childKey.slice(0, 12)) return true
  if (turnKey.slice(0, 12) < childKey.slice(0, 12)) return false
  return fork.isUserFork || fork.taskStartedTurnIds.has(turnId)
}

function forkTaskStartsOwnSession(fork: ForkState, turnId: string, startedAt: unknown): boolean {
  if (!fork.childSessionId) return false
  const childKey = uuid7Key(fork.childSessionId)
  if (!childKey) return true
  const turnKey = uuid7Key(turnId)
  if (turnKey) return turnKey.slice(0, 12) >= childKey.slice(0, 12)
  if (typeof startedAt !== "number") return false
  return startedAt >= Math.floor(Number.parseInt(childKey.slice(0, 12), 16) / 1000)
}
