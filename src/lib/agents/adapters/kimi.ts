import { join } from "node:path"
import { envPath } from "../types"
import { fileAdapter } from "./shared/factory"
import { hasTokens, object, parseJsonl, string, timestamp, usage } from "./shared/json"

export const kimiAdapter = fileAdapter({
  id: "kimi",
  label: "Kimi",
  roots: (context) => [
    join(context.home, ".kimi", "sessions"),
    join(envPath(context.env, "KIMI_CODE_HOME") ?? join(context.home, ".kimi-code"), "sessions"),
  ],
  file: (name) => name.endsWith(".jsonl"),
  parse: (source, context) => parseJsonl({
    agent: "kimi",
    source,
    context,
    record(row, index, state) {
      const type = string(row.type)
      if (type === "session") {
        state.sessionId = string(row.id) ?? state.sessionId
        state.project = string(row.cwd)
        return null
      }
      const payload = object(row.payload) ?? row
      const raw = object(payload.token_usage) ?? (type === "usage.record" ? object(row.usage) : null)
      if (!raw) return null
      const parsed = usage(raw)
      const tokens = {
        input: parsed.input,
        output: parsed.output,
        cacheRead: Number(raw.input_cache_read ?? raw.inputCacheRead ?? 0),
        cacheWrite: Number(raw.input_cache_creation ?? raw.inputCacheCreation ?? 0),
        reasoning: 0,
      }
      if (!hasTokens(tokens)) return null
      const at = timestamp(row)
      if (at === null) return null
      const identity = string(payload.message_id) ?? string(row.id) ?? `${at}:${index}`
      return {
        identity,
        sessionId: state.sessionId,
        project: state.project,
        timestamp: at,
        tokens,
        model: string(row.model),
        dedupKey: `${state.sessionId}:${identity}`,
      }
    },
  }),
})
