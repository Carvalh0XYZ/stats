import { join } from "node:path"
import { envPath } from "../types"
import { fileAdapter } from "./shared/factory"
import { number, object, parseJson, string, timestamp } from "./shared/json"

export const freebuffAdapter = fileAdapter({
  id: "freebuff",
  label: "Freebuff",
  roots: (context) => {
    const override = envPath(context.env, "FREEBUFF_DATA_DIR")
    return override
      ? [override]
      : ["manicode", "manicode-dev", "manicode-staging"].map((name) => join(context.home, ".config", name))
  },
  file: (name) => name === "chat-messages.json",
  kind: "json",
  parse: (source, context) => parseJson({
    agent: "freebuff",
    source,
    context,
    values: (root) => Array.isArray(root) ? root : [],
    record(row, index, state) {
      if (string(row.role) !== "assistant") return null
      const metadata = object(row.metadata)
      if (object(metadata?.usage) || object(object(metadata?.codebuff)?.usage)) return null
      const chars = number(metadata?.contentLength ?? row.contentLength ?? row.messageLength)
      if (chars === null || chars <= 0) return null
      const at = timestamp(row)
      if (at === null) return null
      const identity = string(row.id) ?? `${at}:${index}`
      return {
        identity,
        sessionId: state.sessionId,
        timestamp: at,
        tokens: { input: 0, output: Math.ceil(chars / 4), cacheRead: 0, cacheWrite: 0, reasoning: 0 },
        model: string(metadata?.model) ?? "freebuff-unknown",
        dedupKey: `freebuff:${identity}`,
        estimatedTokens: true,
      }
    },
  }),
})
