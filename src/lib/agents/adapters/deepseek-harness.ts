import { promises as fs } from "node:fs"
import { join } from "node:path"
import * as zlib from "node:zlib"
import { envPath } from "../types"
import { fileAdapter } from "./shared/factory"
import { hasTokens, makeEventForDecoded, nested, object, string, timestamp, usage } from "./shared/zstd"

export const deepseekHarnessAdapter = fileAdapter({
  id: "deepseek-harness",
  label: "DeepSeek Harness",
  roots: (context) => [join(envPath(context.env, "DSH_HOME") ?? join(context.home, ".dsh"), "sessions")],
  file: (name) => name === "session.jsonl" || name === "session.jsonl.zstd",
  kind: "dsh",
  parse: async (source, context) => {
    let bytes = await fs.readFile(source.path)
    if (source.path.endsWith(".zstd")) {
      const decompress = "zstdDecompressSync" in zlib
        ? (zlib as typeof zlib & { zstdDecompressSync(data: Uint8Array): Buffer }).zstdDecompressSync
        : null
      if (!decompress) {
        context.warn("Node does not support zstd decompression; source skipped")
        return { events: [] }
      }
      try {
        bytes = decompress(bytes)
      } catch {
        context.warn("zstd source could not be decompressed")
        return { events: [] }
      }
    }
    return makeEventForDecoded("deepseek-harness", source, context, bytes.toString("utf8"), (row, index, state) => {
      if (string(row.type) === "session") {
        state.sessionId = string(row.id) ?? state.sessionId
        state.project = string(row.cwd)
        return null
      }
      if (string(row.type) !== "assistant/message") return null
      const raw = nested(row, "data", "usage")
      if (!raw) return null
      const tokens = usage(raw)
      if (!hasTokens(tokens)) return null
      const message = nested(row, "data", "message")
      const sourceData = object(message?.source)
      const at = timestamp(row)
      if (at === null) return null
      const identity = string(message?.id) ?? `${at}:${index}`
      return { identity, sessionId: state.sessionId, project: state.project, timestamp: at, tokens, model: string(sourceData?.model), provider: string(sourceData?.provider), dedupKey: `dsh:${state.sessionId}:${identity}` }
    })
  },
})
