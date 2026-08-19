import { join } from "node:path"
import { fileAdapter } from "./shared/factory"
import { hasTokens, object, parseJson, string, timestamp, usage } from "./shared/json"

export const augmentAdapter = fileAdapter({
  id: "augment",
  label: "Augment Code",
  roots: (context) => [join(context.home, ".augment", "sessions")],
  file: (name) => name.endsWith(".json"),
  kind: "json",
  parse: (source, context) => parseJson({
    agent: "augment",
    source,
    context,
    values(root) {
      const doc = object(root)
      return Array.isArray(doc?.chatHistory) ? doc.chatHistory : []
    },
    record(row, index, state) {
      if (row.completed !== true) return null
      const exchange = object(row.exchange)
      const nodes = Array.isArray(exchange?.response_nodes) ? exchange.response_nodes : []
      let raw = null
      for (const node of nodes) {
        const candidate = object(object(node)?.token_usage)
        if (candidate && hasTokens(usage(candidate))) raw = candidate
      }
      if (!raw) return null
      const at = timestamp(row, row.finishedAt)
      if (at === null) return null
      const identity = string(exchange?.request_id) ?? string(row.sequenceId) ?? `${at}:${index}`
      return {
        identity,
        sessionId: string(row.sessionId) ?? state.sessionId,
        timestamp: at,
        tokens: usage(raw),
        model: string(exchange?.model_id),
        dedupKey: `augment:${state.sessionId}:${identity}`,
      }
    },
  }),
})
