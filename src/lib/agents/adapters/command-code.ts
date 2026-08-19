import { join } from "node:path"
import { fileAdapter } from "./shared/factory"
import { number, parseJsonl, string, timestamp } from "./shared/json"

export const commandCodeAdapter = fileAdapter({
  id: "command-code",
  label: "Command Code",
  roots: (context) => [join(context.home, ".commandcode", "projects")],
  file: (name) => name.endsWith(".jsonl"),
  parse: (source, context) => parseJsonl({
    agent: "command-code",
    source,
    context,
    record(row, index, state) {
      const role = string(row.role)
      if (role !== "assistant") return null
      const chars = number(row.contentLength ?? row.messageLength ?? row.length ?? row.character_count)
      if (chars === null || chars <= 0) return null
      const at = timestamp(row)
      if (at === null) return null
      const identity = string(row.id) ?? `${at}:${index}`
      return {
        identity,
        sessionId: string(row.sessionId) ?? state.sessionId,
        project: string(row.project),
        timestamp: at,
        tokens: { input: 0, output: Math.ceil(chars / 4), cacheRead: 0, cacheWrite: 0, reasoning: 0 },
        model: string(row.model),
        dedupKey: `command-code:${state.sessionId}:${identity}`,
        estimatedTokens: true,
      }
    },
  }),
})
