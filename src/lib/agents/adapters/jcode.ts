import { join } from "node:path"
import { envPath } from "../types"
import { fileAdapter } from "./shared/factory"
import { object, parseJson, parseJsonl, string, timestamp, usage } from "./shared/json"
import type { JsonRecord, JsonState } from "./shared/json"

export const jcodeAdapter = fileAdapter({
  id: "jcode",
  label: "Jcode",
  roots: (context) => [join(envPath(context.env, "JCODE_HOME") ?? join(context.home, ".jcode"), "sessions")],
  file: (name) => /^session_.*\.(?:json|journal\.jsonl)$/u.test(name),
  kind: "jcode",
  parse: (source, context) => source.path.endsWith(".jsonl")
    ? parseJsonl({ agent: "jcode", source, context, record: jcodeRecord })
    : parseJson({
        agent: "jcode",
        source,
        context,
        values(root) {
          const doc = object(root)
          return Array.isArray(doc?.messages) ? doc.messages : []
        },
        record: jcodeRecord,
      }),
})

function jcodeRecord(row: JsonRecord, index: number, state: JsonState) {
  const raw = object(row.token_usage)
  if (!raw) return null
  const tokens = usage(raw)
  const at = timestamp(row)
  if (at === null) return null
  const identity = string(row.id) ?? `${at}:${index}`
  return {
    identity,
    sessionId: string(row.session_id) ?? state.sessionId.replace(/\.journal$/u, ""),
    timestamp: at,
    tokens,
    model: string(row.model),
    provider: string(row.provider),
    durationMs: typeof row.tool_duration_ms === "number" ? row.tool_duration_ms : null,
    dedupKey: `jcode:${identity}`,
  }
}
