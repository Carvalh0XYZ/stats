import { join } from "node:path"
import type { AgentAdapter } from "../types"
import { eventId, localDateOf, readJsonl, timestampOf, tokenCount, walkFiles } from "../../usage/parse"
import { asObject, asText, tokscaleRoot } from "./shared/cache"

export const antigravityAdapter: AgentAdapter = {
  id: "antigravity",
  label: "Google Antigravity",
  version: 1,
  cacheBacked: true,
  async *discover(context) {
    const roots = [join(tokscaleRoot(context), "antigravity-cache", "sessions"), ...context.extraRoots.map((root) => join(root, "antigravity-cache", "sessions"))]
    for (const root of roots) {
      for (const path of await walkFiles(root, (name) => name.endsWith(".jsonl"))) yield { agent: "antigravity", path, kind: "jsonl" }
    }
  },
  async parse(source, context) {
    const data = await readJsonl(source.path, context.resumeOffset)
    for (let count = 0; count < data.malformed; count++) context.warn("Skipped malformed Antigravity JSONL record")
    const events = []
    let modelFromMeta: string | null = null
    for (const line of data.lines) {
      const row = asObject(line.value)
      if (!row) {
        context.warn("Skipped malformed Antigravity usage record")
        continue
      }
      if (row.type === "session_meta") {
        modelFromMeta = asText(row.modelId)
        continue
      }
      if (row.type !== "usage") continue
      const sessionId = asText(row.sessionId)
      const timestamp = timestampOf(row.timestamp)
      const model = asText(row.modelId) ?? modelFromMeta
      if (!sessionId || timestamp === null || !model) {
        context.warn("Skipped malformed Antigravity usage record")
        continue
      }
      const responseId = asText(row.responseId)
      events.push({
        id: eventId("antigravity", source.path, responseId ?? line.end),
        agent: "antigravity" as const,
        provider: asText(row.providerId),
        model,
        sessionId,
        project: asText(row.project),
        timestamp,
        localDate: localDateOf(timestamp, context.timezone),
        tokens: { input: tokenCount(row.input), output: tokenCount(row.output), cacheRead: tokenCount(row.cacheRead), cacheWrite: tokenCount(row.cacheWrite), reasoning: tokenCount(row.reasoning) },
        costUsd: null,
        costSource: "unpriced" as const,
        durationMs: tokenCount(row.durationMs) || null,
        dedupKey: responseId,
        sourcePath: source.path,
      })
    }
    return { events, cursor: data.cursor }
  },
}
