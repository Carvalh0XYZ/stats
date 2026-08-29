import { join } from "node:path"
import type { TokenBreakdown } from "../../usage/types"
import { tokenCount } from "../../usage/parse"
import { envPath } from "../types"
import { fileAdapter } from "./shared/factory"
import type { JsonRecord } from "./shared/json"
import {
  hasTokens,
  nested,
  number,
  object,
  parseJsonl,
  string,
  timestamp,
  usage,
} from "./shared/json"

/** xAI reports cost in ticks: 1 USD = 10^10 ticks. */
const USD_TICKS_PER_DOLLAR = 10_000_000_000

export const grokBuildAdapter = fileAdapter({
  id: "grok-build",
  label: "Grok Build",
  version: 2,
  roots: (context) => [
    join(
      envPath(context.env, "GROK_HOME") ?? join(context.home, ".grok"),
      "sessions"
    ),
  ],
  file: (name) => name === "updates.jsonl",
  parse: async (source, context) => {
    let priorTotal = 0
    return parseJsonl({
      agent: "grok-build",
      source,
      context,
      record(row, index, state) {
        const update = nested(row, "params", "update") ?? row
        const raw = nested(update, "usage") ?? nested(row, "usage")
        if (!raw) return null
        const tokens = grokTokens(raw)
        if (!hasTokens(tokens)) {
          const total = number(raw.totalTokens ?? raw.total_tokens)
          if (total === null) return null
          tokens.input = Math.max(0, Math.round(total) - priorTotal)
          priorTotal = Math.max(priorTotal, Math.round(total))
        }
        if (!hasTokens(tokens)) return null
        const meta = nested(row, "params", "_meta") ?? nested(row, "_meta")
        const at = timestamp(
          meta ?? {},
          meta?.agentTimestampMs ?? update.timestamp ?? row.timestamp
        )
        if (at === null) return null
        const identity =
          string(update.prompt_id) ??
          string(meta?.eventId) ??
          string(update.id) ??
          string(row.id) ??
          `${at}:${index}`
        const ticks = number(raw.costUsdTicks ?? raw.cost_in_usd_ticks)
        return {
          identity,
          sessionId: state.sessionId,
          timestamp: at,
          tokens,
          model: grokModel(update, row, raw),
          provider: "xai",
          costUsd:
            ticks !== null && ticks >= 0 ? ticks / USD_TICKS_PER_DOLLAR : null,
          durationMs: number(raw.apiDurationMs ?? update.elapsed_ms),
          dedupKey: `${state.sessionId}:${identity}`,
        }
      },
    })
  },
})

/**
 * Grok's inputTokens include cache, and reasoningTokens are already inside
 * outputTokens. Split those buckets so totals and catalog fallbacks do not
 * double-count. `cachedReadTokens` is Grok-specific; the shared helper
 * does not map it.
 */
function grokTokens(raw: JsonRecord): TokenBreakdown {
  const tokens = usage(raw)
  const cacheRead =
    tokenCount(raw.cachedReadTokens ?? raw.cached_read_tokens) ||
    tokens.cacheRead
  const cacheWrite = tokens.cacheWrite
  const reasoning = tokens.reasoning
  if (cacheRead > 0) tokens.input = Math.max(0, tokens.input - cacheRead)
  if (cacheWrite > 0) tokens.input = Math.max(0, tokens.input - cacheWrite)
  if (reasoning > 0) tokens.output = Math.max(0, tokens.output - reasoning)
  tokens.cacheRead = cacheRead
  return tokens
}

function grokModel(
  update: JsonRecord,
  row: JsonRecord,
  raw: JsonRecord
): string | null {
  const explicit = string(update.model) ?? string(row.model)
  if (explicit) return stripBuildSuffix(explicit)
  const [model] = Object.keys(object(raw.modelUsage) ?? {})
  return model ? stripBuildSuffix(model) : null
}

/** CLI SKUs are `grok-4.6-build`; models.dev lists `grok-4.6`. */
function stripBuildSuffix(id: string): string {
  return id.replace(/-build$/u, "")
}
