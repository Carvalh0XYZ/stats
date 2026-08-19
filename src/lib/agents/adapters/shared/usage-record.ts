import type { JsonRecord, JsonState } from "./json"
import type { EventFields } from "./json"
import { hasTokens, nested, number, object, string, timestamp, usage } from "./json"

export function usageRecord(row: JsonRecord, index: number, state: JsonState): EventFields | null {
  const type = string(row.type)
  if (type === "session") {
    state.sessionId = string(row.id) ?? string(row.sessionId) ?? state.sessionId
    state.project = string(row.cwd) ?? string(row.project) ?? state.project
    return null
  }
  const message = object(row.message) ?? nested(row, "data", "message") ?? row
  const role = string(message.role) ?? string(row.role)
  if (role && role !== "assistant") return null
  const rawUsage = object(message.usage) ?? object(row.usage) ?? object(row.token_usage) ?? nested(row, "data", "usage")
  if (!rawUsage) return null
  const tokens = usage(rawUsage)
  const cost = number(rawUsage.cost)
  const costRow = object(rawUsage.cost)
  const costUsd = cost ?? number(costRow?.total)
  if (!hasTokens(tokens) && costUsd === null) return null
  const at = timestamp(message, row.timestamp ?? row.time ?? row.createdAt)
  if (at === null) return null
  const sessionId = string(row.sessionId) ?? string(row.session_id) ?? state.sessionId
  const identity = string(row.uuid) ?? string(row.id) ?? string(message.id) ?? `${sessionId}:${at}:${index}`
  const model = string(message.model) ?? string(row.model) ?? state.model
  const provider = string(message.provider) ?? string(row.provider) ?? state.provider
  return {
    identity,
    provider,
    model,
    sessionId,
    project: string(row.cwd) ?? string(row.project) ?? state.project,
    timestamp: at,
    tokens,
    costUsd,
    durationMs: number(row.durationMs) ?? number(rawUsage.time),
    dedupKey: `${sessionId}:${string(row.requestId) ?? identity}`,
  }
}
