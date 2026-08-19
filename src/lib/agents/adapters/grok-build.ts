import { join } from "node:path"
import { envPath } from "../types"
import { fileAdapter } from "./shared/factory"
import { hasTokens, nested, number, parseJsonl, string, timestamp, usage } from "./shared/json"

export const grokBuildAdapter = fileAdapter({
  id: "grok-build",
  label: "Grok Build",
  roots: (context) => [join(envPath(context.env, "GROK_HOME") ?? join(context.home, ".grok"), "sessions")],
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
        const total = number(raw.totalTokens ?? raw.total_tokens)
        const tokens = usage(raw)
        if (!hasTokens(tokens) && total !== null) {
          tokens.input = Math.max(0, Math.round(total) - priorTotal)
          priorTotal = Math.max(priorTotal, Math.round(total))
        }
        if (!hasTokens(tokens)) return null
        const at = timestamp(update, row.timestamp)
        if (at === null) return null
        const identity = string(update.id) ?? string(row.id) ?? `${at}:${index}`
        return {
          identity,
          sessionId: state.sessionId,
          timestamp: at,
          tokens,
          model: string(update.model) ?? string(row.model),
          provider: "xai",
          dedupKey: `${state.sessionId}:${identity}`,
        }
      },
    })
  },
})
