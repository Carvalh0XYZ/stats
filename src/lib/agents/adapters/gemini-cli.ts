import { join } from "node:path"
import type { AgentAdapter } from "../types"
import { readJsonFile, walkFiles } from "../../usage/parse"
import { fileSession, recordOf, standardTokens, textOf, usageEvent } from "./shared/json"

export const geminiCliAdapter: AgentAdapter = {
  id: "gemini-cli",
  label: "Gemini CLI",
  version: 1,
  async *discover(context) {
    const home = context.env.GEMINI_CLI_HOME?.trim() || join(context.home, ".gemini")
    for (const path of await walkFiles(join(home, "tmp"), (name) => name.endsWith(".json"))) {
      if (path.includes(`${join("chats", "")}`)) yield { agent: "gemini-cli", path, kind: "json" }
    }
  },
  async parse(source, context) {
    const root = recordOf(await readJsonFile(source.path))
    if (!root) {
      context.warn("malformed JSON document")
      return { events: [] }
    }
    const messages = Array.isArray(root.messages) ? root.messages : []
    const sessionId = textOf(root.id) ?? fileSession(source.path)
    const events = []
    for (const [index, value] of messages.entries()) {
      const message = recordOf(value)
      const tokens = recordOf(message?.tokens)
      if (!message || !tokens || message.type === "user" || message.role === "user") continue
      const event = usageEvent({
        agent: "gemini-cli",
        path: source.path,
        identity: textOf(message.id) ?? index,
        provider: "google",
        model: textOf(message.model),
        sessionId,
        project: textOf(root.projectHash) ?? null,
        timestamp: message.timestamp ?? message.createdAt ?? root.startTime,
        timezone: context.timezone,
        tokens: standardTokens(tokens),
        cost: message.costUSD,
        dedupKey: textOf(message.id),
      })
      if (event) events.push(event)
      else context.warn("message has no valid timestamp")
    }
    return { events }
  },
}
