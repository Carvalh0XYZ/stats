import type { AgentId } from "../../registry"
import type { ParseContext, ParseOutput, UsageSource } from "../../types"
import { readJsonl } from "../../../usage/parse"
import { encodedProject, recordOf, standardTokens, textOf, usageEvent } from "./json"

export async function parsePi(source: UsageSource, context: ParseContext, agent: "pi" | "omp"): Promise<ParseOutput> {
  const result = await readJsonl(source.path, context.resumeOffset)
  if (result.malformed > 0) context.warn(`${result.malformed} malformed JSONL record(s)`)
  const events = []
  // A resumed parse starts past the session header line, so recover the
  // session id from the head of the file.
  let sessionId: string | null = context.resumeOffset ? await headSessionId(source.path) : null
  for (const line of result.lines) {
    const entry = recordOf(line.value)
    if (entry?.type === "session") {
      sessionId = textOf(entry.id)
      continue
    }
    const message = recordOf(entry?.message)
    const usage = recordOf(message?.usage)
    if (!sessionId || entry?.type !== "message" || message?.role !== "assistant" || !usage) continue
    const cost = recordOf(usage.cost)
    const event = usageEvent({
      agent: agent as AgentId,
      path: source.path,
      identity: textOf(entry.id) ?? line.end,
      provider: textOf(message.provider),
      model: textOf(message.model),
      sessionId,
      project: encodedProject(source.path, "sessions"),
      timestamp: entry.timestamp,
      timezone: context.timezone,
      tokens: standardTokens(usage),
      cost: cost?.total,
      dedupKey: textOf(entry.id),
    })
    if (event) events.push(event)
    else context.warn("message has no valid timestamp")
  }
  return { events, cursor: result.cursor }
}

async function headSessionId(path: string): Promise<string | null> {
  const head = await readJsonl(path, 0)
  for (const line of head.lines) {
    const entry = recordOf(line.value)
    if (entry?.type === "session") return textOf(entry.id)
  }
  return null
}
