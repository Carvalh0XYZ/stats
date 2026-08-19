import { join } from "node:path"
import type { AgentAdapter } from "../types"
import { envPath } from "../types"
import { eventId, localDateOf, readJsonl, timestampOf, tokenCount, walkFiles } from "../../usage/parse"
import { asObject, asText, sharedCacheRoot } from "./shared/cache"

export const minimaxCodeAdapter: AgentAdapter = {
  id: "minimax-code",
  label: "MiniMax Code",
  version: 1,
  cacheBacked: true,
  async *discover(context) {
    const override = envPath(context.env, "TOKSCALE_HEADLESS_DIR")
    const roots = override ? [join(override, "mcode")] : [join(sharedCacheRoot(context), "headless", "mcode")]
    roots.push(...context.extraRoots.map((root) => join(root, "headless", "mcode")))
    for (const root of roots) {
      for (const path of await walkFiles(root, (name) => name.endsWith(".jsonl"))) yield { agent: "minimax-code", path, kind: "jsonl" }
    }
  },
  async parse(source, context) {
    const data = await readJsonl(source.path, context.resumeOffset)
    for (let count = 0; count < data.malformed; count++) context.warn("Skipped malformed MiniMax JSONL record")
    const pending = new Map<string, { end: number; timestamp: number; tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; reasoning: number } }[]>()
    const events = []
    for (const line of data.lines) {
      const row = asObject(line.value)
      if (!row) continue
      if (row.type === "message") {
        const message = asObject(row.message)
        const turnId = message && asText(message.turnId)
        const usage = message && asObject(message.usage)
        const timestamp = message && timestampOf(message.timestamp)
        if (!message || message.role !== "assistant" || !turnId || !usage || timestamp === null) continue
        const tokens = { input: tokenCount(usage.inputTokens), output: tokenCount(usage.outputTokens), cacheRead: tokenCount(usage.cacheReadTokens), cacheWrite: tokenCount(usage.cacheWriteTokens), reasoning: tokenCount(usage.reasoningTokens) }
        if (Object.values(tokens).every((count) => count === 0)) continue
        const list = pending.get(turnId) ?? []
        list.push({ end: line.end, timestamp, tokens })
        pending.set(turnId, list)
      } else if (row.type === "exec.result") {
        const turnId = asText(row.turnId)
        const sessionId = asText(row.sessionId)
        const model = asObject(row.model)
        const modelId = model && asText(model.modelId)
        const provider = model && asText(model.providerId)
        if (!turnId || !sessionId || !modelId || !provider) continue
        const list = pending.get(turnId) ?? []
        for (const usage of list) events.push({
          id: eventId("minimax-code", source.path, turnId, usage.end),
          agent: "minimax-code" as const,
          provider,
          model: modelId,
          sessionId,
          project: null,
          timestamp: usage.timestamp,
          localDate: localDateOf(usage.timestamp, context.timezone),
          tokens: usage.tokens,
          costUsd: null,
          costSource: "unpriced" as const,
          durationMs: tokenCount(row.durationMs) || null,
          dedupKey: `minimax-code:${sessionId}:${turnId}:${usage.end}`,
          sourcePath: source.path,
        })
        pending.delete(turnId)
      }
    }
    return { events, cursor: data.cursor }
  },
}
