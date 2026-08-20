import type { Database } from "better-sqlite3"
import { join } from "node:path"
import { openDatabase } from "./schema"
import { dataDir } from "./paths.server"
import type { UsageEvent } from "../usage/types"
import { canonicalProject } from "../usage/project.server"

let db: Database | null = null

export function getDb(): Database {
  if (!db) db = openDatabase(join(dataDir(), "stats.db"))
  return db
}

export function closeDb(): void {
  db?.close()
  db = null
}

export function getSetting(name: string): string | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(name) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

export function setSetting(name: string, value: string): void {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(name, value)
}

/** The pinned IANA timezone; pinned on first call so day buckets stay stable. */
export function pinnedTimezone(): string {
  const existing = getSetting("timezone")
  if (existing) return existing
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  setSetting("timezone", zone)
  return zone
}

export function extraRoots(): string[] {
  const raw = getSetting("extraRoots")
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(entry => typeof entry === "string") : []
  } catch {
    return []
  }
}

export interface EventRow {
  id: string
  agent: string
  provider: string | null
  model: string | null
  session_id: string
  project: string | null
  timestamp: number
  local_date: string
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  reasoning_tokens: number
  cost_usd: number | null
  cost_source: string
  duration_ms: number | null
  dedup_key: string | null
  source_path: string
  estimated_tokens: number
}

export function insertEvents(database: Database, events: UsageEvent[]): number {
  const insert = database.prepare(`
    INSERT OR IGNORE INTO usage_events (
      id, agent, provider, model, session_id, project, timestamp, local_date,
      input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
      reasoning_tokens, cost_usd, cost_source, duration_ms, dedup_key,
      source_path, estimated_tokens
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  let inserted = 0
  for (const event of events) {
    const result = insert.run(
      event.id,
      event.agent,
      event.provider,
      event.model,
      event.sessionId,
      canonicalProject(event.project),
      event.timestamp,
      event.localDate,
      event.tokens.input,
      event.tokens.output,
      event.tokens.cacheRead,
      event.tokens.cacheWrite,
      event.tokens.reasoning,
      event.costUsd,
      event.costSource,
      event.durationMs,
      event.dedupKey,
      event.sourcePath,
      event.estimatedTokens ? 1 : 0,
    )
    inserted += result.changes
  }
  return inserted
}
