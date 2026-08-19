import { join } from "node:path"
import type { AgentAdapter } from "../types"
import { readJsonl, walkFiles } from "../../usage/parse"
import { encodedProject, fileSession, recordOf, standardTokens, textOf, usageEvent } from "./shared/json"

export const qwenCliAdapter: AgentAdapter = {
  id: "qwen-cli",
  label: "Qwen CLI",
  version: 1,
  async *discover(context) {
    for (const path of await walkFiles(join(context.home, ".qwen", "projects"), (name) => name.endsWith(".jsonl"))) {
      yield { agent: "qwen-cli", path, kind: "jsonl" }
    }
  },
  async parse(source, context) {
    const result = await readJsonl(source.path, context.resumeOffset)
    if (result.malformed > 0) context.warn(`${result.malformed} malformed JSONL record(s)`)
    const events = []
    for (const line of result.lines) {
      const entry = recordOf(line.value)
      const message = recordOf(entry?.message)
      const usage = recordOf(message?.usage)
      if (entry?.type !== "assistant" || !message || !usage) continue
      const messageId = textOf(message.id)
      const requestId = textOf(entry.requestId)
      const event = usageEvent({
        agent: "qwen-cli",
        path: source.path,
        identity: messageId && requestId ? `${messageId}:${requestId}` : line.end,
        provider: textOf(message.provider) ?? "qwen",
        model: textOf(message.model),
        sessionId: textOf(entry.sessionId) ?? fileSession(source.path),
        project: encodedProject(source.path, "projects"),
        timestamp: entry.timestamp,
        timezone: context.timezone,
        tokens: standardTokens(usage),
        cost: entry.costUSD ?? message.costUSD,
        dedupKey: messageId && requestId ? `${messageId}:${requestId}` : null,
      })
      if (event) events.push(event)
      else context.warn("assistant record has no valid timestamp")
    }
    return { events, cursor: result.cursor }
  },
}
