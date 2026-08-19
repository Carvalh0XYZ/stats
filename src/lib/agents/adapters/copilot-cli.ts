import { access } from "node:fs/promises"
import { dirname, join } from "node:path"
import type { AgentAdapter, UsageSource } from "../types"
import { envPath } from "../types"
import { eventId, localDateOf, readJsonl, timestampOf, tokenCount, walkFiles } from "../../usage/parse"

export const copilotCliAdapter: AgentAdapter = {
  id: "copilot-cli",
  label: "GitHub Copilot CLI",
  version: 1,
  async *discover(context) {
    const paths = await walkFiles(join(context.home, ".copilot", "otel"), (name) => name.endsWith(".jsonl"))
    const override = envPath(context.env, "COPILOT_OTEL_FILE_EXPORTER_PATH")
    if (override) {
      try {
        await access(override)
        paths.push(override)
      } catch {
        for (const path of await walkFiles(dirname(override), (name) => name.endsWith(".jsonl"))) paths.push(path)
      }
    }
    for (const path of new Set(paths)) {
      yield { agent: "copilot-cli", path, kind: "jsonl" } satisfies UsageSource
    }
  },
  async parse(source, context) {
    const result = await readJsonl(source.path, context.resumeOffset)
    for (let index = 0; index < result.malformed; index++) {
      context.warn(`Skipped malformed Copilot OTEL record in ${source.path}`)
    }
    const events = []
    for (const line of result.lines) {
      if (line.value === null || typeof line.value !== "object" || Array.isArray(line.value)) continue
      const row = line.value as Record<string, unknown>
      const attrsValue = row.attributes
      if (row.type !== "span" || attrsValue === null || typeof attrsValue !== "object" || Array.isArray(attrsValue)) continue
      const attrs = attrsValue as Record<string, unknown>
      if (attrs["gen_ai.operation.name"] !== "chat") continue
      const timestamp = timestampOf(row.timestamp ?? row.startTime ?? row.start_time)
      const sessionId = String(attrs["gen_ai.conversation.id"] ?? attrs["session.id"] ?? "")
      const spanId = String(row.spanId ?? row.span_id ?? row.id ?? "")
      if (timestamp === null || !sessionId || !spanId) {
        context.warn(`Skipped malformed Copilot OTEL span in ${source.path}`)
        continue
      }
      events.push({
        id: eventId("copilot-cli", source.path, spanId),
        agent: "copilot-cli" as const,
        provider: typeof attrs["gen_ai.provider.name"] === "string" ? attrs["gen_ai.provider.name"] : "github-copilot",
        model: typeof attrs["gen_ai.response.model"] === "string" ? attrs["gen_ai.response.model"] : null,
        sessionId,
        project: null,
        timestamp,
        localDate: localDateOf(timestamp, context.timezone),
        tokens: {
          input: tokenCount(attrs["gen_ai.usage.input_tokens"]),
          output: tokenCount(attrs["gen_ai.usage.output_tokens"]),
          cacheRead: tokenCount(attrs["gen_ai.usage.cache_read.input_tokens"]),
          cacheWrite: tokenCount(attrs["gen_ai.usage.cache_write.input_tokens"]),
          reasoning: tokenCount(attrs["gen_ai.usage.reasoning.output_tokens"]),
        },
        costUsd: null,
        costSource: "unpriced" as const,
        durationMs: null,
        dedupKey: `${spanId}:${sessionId}:${timestamp}`,
        sourcePath: source.path,
      })
    }
    return { events, cursor: result.cursor }
  },
}
