import { join } from "node:path"
import type { AgentAdapter } from "../types"
import type { UsageEvent } from "../../usage/types"
import { readJsonl, walkFiles } from "../../usage/parse"
import { encodedProject, fileSession, recordOf, standardTokens, textOf, usageEvent } from "./shared/json"

export const claudeCodeAdapter: AgentAdapter = {
  id: "claude-code",
  label: "Claude Code",
  version: 2,
  async *discover(context) {
    for (const root of [join(context.home, ".claude", "projects"), join(context.home, ".claude", "transcripts")]) {
      for (const path of await walkFiles(root, (name) => name.endsWith(".jsonl"))) {
        yield { agent: "claude-code", path, kind: "jsonl" }
      }
    }
  },
  // Always parses the whole file (no resume cursor): streaming duplicates of
  // one message can span appended chunks, and the per-field max merge below
  // needs every copy in view.
  async parse(source, context) {
    const result = await readJsonl(source.path)
    if (result.malformed > 0) context.warn(`${result.malformed} malformed JSONL record(s)`)
    const events: UsageEvent[] = []
    const indexByKey = new Map<string, number>()
    for (const line of result.lines) {
      const entry = recordOf(line.value)
      const message = recordOf(entry?.message)
      const usage = recordOf(message?.usage)
      if (entry?.type !== "assistant" || !message || !usage) continue
      const model = textOf(message.model)
      // Synthetic placeholder turns carry no usage and no real model.
      if (model === "<synthetic>") continue
      const messageId = textOf(message.id)
      const requestId = textOf(entry.requestId)
      const dedupKey = messageId && requestId ? `${messageId}:${requestId}` : null
      const event = usageEvent({
        agent: "claude-code",
        path: source.path,
        identity: dedupKey ?? line.end,
        provider: "anthropic",
        model,
        sessionId: textOf(entry.sessionId) ?? fileSession(source.path),
        project: encodedProject(source.path, "projects"),
        timestamp: entry.timestamp,
        timezone: context.timezone,
        tokens: standardTokens(usage),
        cost: entry.costUSD ?? message.costUSD,
        dedupKey,
      })
      if (!event) {
        context.warn("assistant record has no valid timestamp")
        continue
      }
      // Streaming writes the same messageId:requestId several times with
      // growing usage; merge per-field maxima so the final counts win.
      const existing = dedupKey ? indexByKey.get(dedupKey) : undefined
      if (existing !== undefined) {
        const tokens = events[existing].tokens
        tokens.input = Math.max(tokens.input, event.tokens.input)
        tokens.output = Math.max(tokens.output, event.tokens.output)
        tokens.cacheRead = Math.max(tokens.cacheRead, event.tokens.cacheRead)
        tokens.cacheWrite = Math.max(tokens.cacheWrite, event.tokens.cacheWrite)
        tokens.reasoning = Math.max(tokens.reasoning, event.tokens.reasoning)
        continue
      }
      if (dedupKey) indexByKey.set(dedupKey, events.length)
      events.push(event)
    }
    return { events }
  },
}
