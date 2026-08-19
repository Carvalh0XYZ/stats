import { join } from "node:path"
import { envPath } from "../types"
import { fileAdapter } from "./shared/factory"
import { hasTokens, nested, number, object, parseJson, string, timestamp, usage } from "./shared/json"

export const codebuffAdapter = fileAdapter({
  id: "codebuff",
  label: "Codebuff",
  roots: (context) => {
    const override = envPath(context.env, "CODEBUFF_DATA_DIR")
    return override
      ? [override]
      : ["manicode", "manicode-dev", "manicode-staging"].map((name) => join(context.home, ".config", name))
  },
  file: (name) => name === "chat-messages.json",
  kind: "json",
  parse: (source, context) => parseJson({
    agent: "codebuff",
    source,
    context,
    values: (root) => Array.isArray(root) ? root : [],
    record(row, index, state) {
      if (string(row.role) !== "assistant") return null
      const metadata = object(row.metadata)
      const raw = object(metadata?.usage) ?? nested(metadata, "codebuff", "usage")
      if (!raw) return null
      const tokens = usage(raw)
      const credits = number(raw.credits) ?? number(metadata?.credits)
      if (!hasTokens(tokens) && credits === null) return null
      const at = timestamp(row)
      if (at === null) return null
      const identity = string(row.id) ?? `${at}:${index}`
      return { identity, sessionId: state.sessionId, timestamp: at, tokens, model: string(raw.model), costUsd: credits, dedupKey: `codebuff:${identity}` }
    },
  }),
})
