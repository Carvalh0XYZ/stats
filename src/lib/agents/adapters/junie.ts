import { join } from "node:path"
import { fileAdapter } from "./shared/factory"
import { hasTokens, number, object, parseJsonl, string, timestamp, usage } from "./shared/json"

export const junieAdapter = fileAdapter({
  id: "junie",
  label: "Junie",
  roots: (context) => [join(context.home, ".junie", "sessions")],
  file: (name) => name === "events.jsonl",
  parse: (source, context) => parseJsonl({
    agent: "junie",
    source,
    context,
    record(row, index, state) {
      const event = object(row.event) ?? row
      const usages = Array.isArray(event.modelUsage) ? event.modelUsage : []
      const raw = object(usages[0])
      if (!raw) return null
      const tokens = usage(raw)
      const costUsd = number(raw.cost)
      if (!hasTokens(tokens) && costUsd === null) return null
      const end = timestamp(row)
      if (end === null) return null
      const durationMs = number(raw.time)
      const at = durationMs === null ? end : Math.max(0, end - durationMs)
      return {
        identity: `${end}:${index}`,
        sessionId: state.sessionId,
        timestamp: at,
        tokens,
        model: string(raw.model),
        provider: string(raw.provider),
        costUsd,
        durationMs,
        dedupKey: `junie:${state.sessionId}:${end}:${index}`,
      }
    },
  }),
})
