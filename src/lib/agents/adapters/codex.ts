import { join } from "node:path"
import type { AgentId } from "../registry"
import type { AgentAdapter } from "../types"
import type { TokenBreakdown } from "../../usage/types"
import { readJsonl, tokenCount, walkFiles } from "../../usage/parse"
import { fileSession, recordOf, textOf, usageEvent } from "./shared/json"

type Totals = Pick<
  TokenBreakdown,
  "input" | "output" | "cacheRead" | "reasoning"
>

export const codexAdapter: AgentAdapter = {
  id: "codex",
  label: "Codex CLI",
  version: 2,
  async *discover(context) {
    const home = context.env.CODEX_HOME?.trim() || join(context.home, ".codex")
    for (const root of [
      join(home, "sessions"),
      join(home, "archived_sessions"),
    ]) {
      for (const path of await walkFiles(root, (name) =>
        name.endsWith(".jsonl")
      )) {
        yield { agent: "codex", path, kind: "jsonl" }
      }
    }
  },
  async parse(source, context) {
    const result = await readJsonl(source.path)
    const resumeOffset = context.resumeOffset ?? 0
    const malformed = result.malformedEnds.filter(
      (end) => end > resumeOffset
    ).length
    if (malformed > 0) context.warn(`${malformed} malformed JSONL record(s)`)
    const events = []
    const sessionId =
      source.path
        .split(/[\\/]/u)
        .at(-1)
        ?.replace(/\.jsonl$/u, "") ?? fileSession(source.path)
    let model: string | null = null
    let provider = "openai"
    let project: string | null = null
    let previous: Totals | null = null
    for (const line of result.lines) {
      const entry = recordOf(line.value)
      const payload = recordOf(entry?.payload)
      if (entry?.type === "session_meta" && payload) {
        provider = textOf(payload.model_provider) ?? provider
        project = textOf(payload.cwd) ?? project
        continue
      }
      if (entry?.type === "turn_context" && payload) {
        const modelInfo = recordOf(payload.model_info)
        model =
          textOf(modelInfo?.slug) ??
          textOf(payload.model) ??
          textOf(payload.model_name) ??
          model
        provider = textOf(payload.model_provider) ?? provider
        project = textOf(payload.cwd) ?? project
        continue
      }
      if (entry?.type !== "event_msg" || payload?.type !== "token_count")
        continue
      const info = recordOf(payload.info)
      if (!info) continue
      model = textOf(info.model) ?? textOf(info.model_name) ?? model
      const total = readTotals(recordOf(info.total_token_usage))
      const last = readTotals(recordOf(info.last_token_usage))
      let tokens: Totals | null = last
      if (!tokens && total)
        tokens = previous ? subtract(total, previous) : total
      if (!tokens) continue
      if (total) previous = total
      if (line.end <= resumeOffset) continue
      const agent: AgentId = provider === "sakana" ? "sakana" : "codex"
      const vector = total ?? tokens
      const dedupKey = `${sessionId}:${vector.input}:${vector.output}:${vector.cacheRead}:${vector.reasoning}`
      const event = usageEvent({
        agent,
        path: source.path,
        identity: dedupKey,
        provider,
        model,
        sessionId,
        project,
        timestamp: entry.timestamp,
        timezone: context.timezone,
        tokens: { ...tokens, cacheWrite: 0 },
        dedupKey,
      })
      if (event) events.push(event)
      else context.warn("token record has no valid timestamp")
    }
    return { events, cursor: result.cursor }
  },
}

function readTotals(value: Record<string, unknown> | null): Totals | null {
  if (!value) return null
  const input = tokenCount(value.input_tokens)
  const cached = tokenCount(
    value.cached_input_tokens ?? value.cache_read_input_tokens
  )
  return {
    input: Math.max(input - cached, 0),
    output: tokenCount(value.output_tokens),
    cacheRead: cached,
    reasoning: tokenCount(value.reasoning_output_tokens),
  }
}

function subtract(now: Totals, old: Totals): Totals | null {
  if (
    now.input < old.input ||
    now.output < old.output ||
    now.cacheRead < old.cacheRead ||
    now.reasoning < old.reasoning
  )
    return null
  return {
    input: now.input - old.input,
    output: now.output - old.output,
    cacheRead: now.cacheRead - old.cacheRead,
    reasoning: now.reasoning - old.reasoning,
  }
}
