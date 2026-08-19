import type { AgentId } from "../../registry"
import type { ParseContext, ParseOutput, UsageSource } from "../../types"
import type { EventFields, JsonRecord, JsonState } from "./json"
import { hasTokens, makeUsageEvent, nested, object, string, timestamp, usage } from "./json"

export { hasTokens, nested, object, string, timestamp, usage }

export function makeEventForDecoded(
  agent: AgentId,
  source: UsageSource,
  context: ParseContext,
  text: string,
  record: (row: JsonRecord, index: number, state: JsonState) => EventFields | null,
): ParseOutput {
  const state: JsonState = { sessionId: source.path, project: null, provider: null, model: null }
  const events = []
  for (const [index, line] of text.split("\n").entries()) {
    if (!line.trim()) continue
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      context.warn("malformed JSONL record skipped")
      continue
    }
    const row = object(value)
    if (!row) continue
    const fields = record(row, index, state)
    if (fields) events.push(makeUsageEvent(agent, source, context, fields, index))
  }
  return { events }
}
