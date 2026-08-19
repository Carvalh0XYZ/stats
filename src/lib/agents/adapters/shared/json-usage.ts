import type { AgentId } from "../../registry"
import type { ParseContext, ParseOutput, UsageSource } from "../../types"
import { eventId, localDateOf, readJsonFile, readJsonl, timestampOf, tokenCount } from "../../../usage/parse"

export async function parseJsonUsage(
  source: UsageSource,
  context: ParseContext,
  agent: AgentId,
): Promise<ParseOutput> {
  const values: unknown[] = []
  let cursor: number | undefined
  if (source.kind === "jsonl") {
    const result = await readJsonl(source.path, context.resumeOffset)
    values.push(...result.lines.map((line) => line.value))
    cursor = result.cursor
    for (let index = 0; index < result.malformed; index++) {
      context.warn(`Skipped malformed ${agent} JSONL record in ${source.path}`)
    }
  } else {
    const value = await readJsonFile(source.path)
    if (Array.isArray(value)) values.push(...value)
    else if (value !== undefined) values.push(value)
    else context.warn(`Skipped malformed ${agent} JSON file ${source.path}`)
  }
  const events = []
  for (let index = 0; index < values.length; index++) {
    const value = values[index]
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      context.warn(`Skipped malformed ${agent} record in ${source.path}`)
      continue
    }
    const row = value as Record<string, unknown>
    const usageValue = row.usage ?? row.tokens ?? row.metrics
    const usage =
      usageValue !== null && typeof usageValue === "object" && !Array.isArray(usageValue)
        ? (usageValue as Record<string, unknown>)
        : row
    const cacheValue = usage.cache
    const cache =
      cacheValue !== null && typeof cacheValue === "object" && !Array.isArray(cacheValue)
        ? (cacheValue as Record<string, unknown>)
        : {}
    const timestamp = timestampOf(row.timestamp ?? row.created_at ?? row.createdAt)
    const sessionId = String(row.sessionId ?? row.session_id ?? row.id ?? "")
    if (timestamp === null || !sessionId) {
      context.warn(`Skipped malformed ${agent} record in ${source.path}`)
      continue
    }
    const costValue = usage.cost ?? row.cost_usd
    const cost = typeof costValue === "number" && Number.isFinite(costValue) ? costValue : null
    const idPart = String(row.messageId ?? row.message_id ?? row.id ?? index)
    events.push({
      id: eventId(agent, source.path, idPart),
      agent,
      provider: typeof row.provider === "string" ? row.provider : null,
      model: typeof row.model === "string" ? row.model : null,
      sessionId,
      project: typeof row.project === "string" ? row.project : null,
      timestamp,
      localDate: localDateOf(timestamp, context.timezone),
      tokens: {
        input: tokenCount(usage.input ?? usage.input_tokens),
        output: tokenCount(usage.output ?? usage.output_tokens),
        cacheRead: tokenCount(usage.cacheRead ?? usage.cache_read ?? cache.read),
        cacheWrite: tokenCount(usage.cacheWrite ?? usage.cache_write ?? cache.write),
        reasoning: tokenCount(usage.reasoning ?? usage.reasoning_tokens),
      },
      costUsd: cost,
      costSource: cost === null ? "unpriced" as const : "reported" as const,
      durationMs: null,
      dedupKey: `${sessionId}:${idPart}`,
      sourcePath: source.path,
    })
  }
  return cursor === undefined ? { events } : { events, cursor }
}
