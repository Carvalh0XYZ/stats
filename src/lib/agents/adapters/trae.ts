import { join } from "node:path"
import type { AgentAdapter } from "../types"
import { eventId, localDateOf, readJsonFile, timestampOf, tokenCount, walkFiles } from "../../usage/parse"
import { asNumber, asObject, asText, tokscaleRoot } from "./shared/cache"

export const traeAdapter: AgentAdapter = {
  id: "trae",
  label: "Trae",
  version: 1,
  cacheBacked: true,
  async *discover(context) {
    const roots = [join(tokscaleRoot(context), "trae-cache", "sessions"), ...context.extraRoots.map((root) => join(root, "trae-cache", "sessions"))]
    for (const root of roots) {
      for (const path of await walkFiles(root, (name) => name.endsWith(".json"))) yield { agent: "trae", path, kind: "json" }
    }
  },
  async parse(source, context) {
    const value = await readJsonFile(source.path)
    if (!Array.isArray(value)) {
      context.warn("Skipped malformed Trae cache file")
      return { events: [] }
    }
    const latest = new Map<string, Record<string, unknown>>()
    for (const valueRow of value) {
      const row = asObject(valueRow)
      const sessionId = row && asText(row.session_id)
      const timestamp = row && timestampOf(row.usage_time)
      if (!row || !sessionId || timestamp === null) {
        context.warn("Skipped malformed Trae usage record")
        continue
      }
      const prior = latest.get(sessionId)
      const priorTime = prior ? timestampOf(prior.usage_time) : null
      if (priorTime === null || timestamp > priorTime) latest.set(sessionId, row)
    }
    const events = [...latest.entries()].map(([sessionId, row]) => {
      const timestamp = timestampOf(row.usage_time)!
      const extra = asObject(row.extra_info) ?? {}
      const cost = asNumber(row.dollar_float)
      const mode = asText(row.mode)
      const model = asText(row.model_name) ?? (mode ? `trae-${mode.toLowerCase()}` : "trae-unknown")
      return {
        id: eventId("trae", source.path, sessionId, timestamp),
        agent: "trae" as const,
        provider: providerFor(model),
        model,
        sessionId,
        project: asText(row.project),
        timestamp,
        localDate: localDateOf(timestamp, context.timezone),
        tokens: { input: tokenCount(extra.input_token), output: tokenCount(extra.output_token), cacheRead: tokenCount(extra.cache_read_token), cacheWrite: tokenCount(extra.cache_write_token), reasoning: tokenCount(extra.reasoning_token) },
        costUsd: cost,
        costSource: cost === null ? "unpriced" as const : "reported" as const,
        durationMs: null,
        dedupKey: `trae:${sessionId}`,
        sourcePath: source.path,
      }
    })
    return { events }
  },
}

function providerFor(model: string): string {
  const lower = model.toLowerCase()
  if (lower.includes("gpt")) return "openai"
  if (lower.includes("claude")) return "anthropic"
  if (lower.includes("gemini")) return "google"
  if (lower.includes("glm")) return "zhipu"
  return "trae"
}
