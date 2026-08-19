import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { setTimeout } from "node:timers/promises"
import type { Database } from "better-sqlite3"
import { ADAPTERS } from "../agents"
import type { AgentAdapter, DiscoveryContext, UsageSource } from "../agents/types"
import type { AgentId } from "../agents/registry"
import { extraRoots, getDb, insertEvents, pinnedTimezone } from "../db/client.server"
import { dataDir } from "../db/paths.server"
import { loadCatalog, findRates, priceTokens, type PricingCatalog } from "../pricing/models-dev"
import type { UsageEvent } from "../usage/types"

export interface SyncProgress {
  current: number
  total: number
  path: string
}

export interface SyncResult {
  discovered: number
  processed: number
  skipped: number
  inserted: number
  warnings: number
  durationMs: number
}

export interface SyncOptions {
  agents?: AgentId[]
  onProgress?: (progress: SyncProgress) => void
}

interface SourceRow {
  path: string
  adapter_version: number
  size: number
  mtime_ms: number
  sample_hash: string
  cursor: number | null
}

let activeSync: Promise<SyncResult> | null = null

/** Start a sync, or join the one already running (server + UI share it). */
export function syncUsage(options: SyncOptions = {}): Promise<SyncResult> {
  if (!activeSync) {
    activeSync = runSync(options).finally(() => {
      activeSync = null
    })
  }
  return activeSync
}

export function syncInProgress(): boolean {
  return activeSync !== null
}

async function runSync(options: SyncOptions): Promise<SyncResult> {
  const started = Date.now()
  const db = getDb()
  const timezone = pinnedTimezone()
  const lockPath = join(dataDir(), "sync.lock")
  await acquireLock(lockPath)
  try {
    const context: DiscoveryContext = {
      platform: process.platform,
      home: homedir(),
      env: process.env,
      extraRoots: extraRoots(),
    }
    const adapters = ADAPTERS.filter(
      adapter => !options.agents || options.agents.includes(adapter.id),
    )

    const discovered: { adapter: AgentAdapter; source: UsageSource }[] = []
    for (const adapter of adapters) {
      try {
        for await (const source of adapter.discover(context)) {
          discovered.push({ adapter, source })
        }
      } catch (error) {
        recordAgentError(db, adapter, error)
      }
    }

    const catalog = await loadCatalog(dataDir()).catch(() => null)
    const result: SyncResult = {
      discovered: discovered.length,
      processed: 0,
      skipped: 0,
      inserted: 0,
      warnings: 0,
      durationMs: 0,
    }
    const selectSource = db.prepare(
      "SELECT path, adapter_version, size, mtime_ms, sample_hash, cursor FROM sources WHERE path = ?",
    )

    for (const [index, { adapter, source }] of discovered.entries()) {
      options.onProgress?.({ current: index + 1, total: discovered.length, path: source.path })
      let stat
      try {
        stat = await fs.stat(source.path)
      } catch {
        continue
      }
      const known = selectSource.get(source.path) as SourceRow | undefined
      const sampleHash = await sampleFileHash(source.path, stat.size)
      const unchanged =
        known &&
        known.adapter_version === adapter.version &&
        known.size === stat.size &&
        known.mtime_ms === Math.trunc(stat.mtimeMs) &&
        known.sample_hash === sampleHash
      if (unchanged) {
        result.skipped++
        continue
      }

      // Resume only when the file strictly grew under the same adapter
      // version; a rewrite or shrink forces a full re-parse.
      const resumeOffset =
        known &&
        known.adapter_version === adapter.version &&
        known.cursor !== null &&
        stat.size > known.size
          ? known.cursor
          : undefined

      let warnings = 0
      try {
        const output = await adapter.parse(source, {
          timezone,
          resumeOffset,
          warn: () => warnings++,
        })
        priceEvents(output.events, catalog)
        db.transaction(() => {
          if (resumeOffset === undefined) {
            db.prepare("DELETE FROM usage_events WHERE source_path = ?").run(source.path)
          }
          result.inserted += insertEvents(db, dedupe(db, output.events))
          upsertSource(db, adapter, source, stat, sampleHash, output.cursor ?? null, warnings, null)
        })()
        result.processed++
        result.warnings += warnings
      } catch (error) {
        db.transaction(() => {
          upsertSource(db, adapter, source, stat, sampleHash, null, warnings, describeError(error))
        })()
        result.warnings++
      }
    }

    result.durationMs = Date.now() - started
    db.prepare(
      `INSERT INTO sync_runs (started_at, finished_at, discovered, processed, skipped, inserted, warnings)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(started, Date.now(), result.discovered, result.processed, result.skipped, result.inserted, result.warnings)
    return result
  } finally {
    await fs.rm(lockPath, { force: true })
  }
}

/**
 * Drop events whose (agent, dedupKey) already exists in the database or
 * earlier in this batch. First stable event wins.
 */
function dedupe(db: Database, events: UsageEvent[]): UsageEvent[] {
  const existing = db.prepare(
    "SELECT 1 FROM usage_events WHERE agent = ? AND dedup_key = ? LIMIT 1",
  )
  const seen = new Set<string>()
  return events.filter(event => {
    if (!event.dedupKey) return true
    const key = `${event.agent}\u0000${event.dedupKey}`
    if (seen.has(key)) return false
    seen.add(key)
    return !existing.get(event.agent, event.dedupKey)
  })
}

/** Price events that have no reported cost. Reported costs are never touched. */
function priceEvents(events: UsageEvent[], catalog: PricingCatalog | null): void {
  for (const event of events) {
    if (event.costUsd !== null) continue
    const rates = catalog ? findRates(catalog, event.provider, event.model) : null
    if (rates) {
      event.costUsd = priceTokens(rates, event.tokens)
      event.costSource = "estimated"
    } else {
      event.costSource = "unpriced"
    }
  }
}

function upsertSource(
  db: Database,
  adapter: AgentAdapter,
  source: UsageSource,
  stat: { size: number; mtimeMs: number },
  sampleHash: string,
  cursor: number | null,
  warnings: number,
  error: string | null,
): void {
  db.prepare(
    `INSERT INTO sources (path, agent, adapter_version, kind, size, mtime_ms, sample_hash, cursor, warnings, error, last_synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET
       agent = excluded.agent,
       adapter_version = excluded.adapter_version,
       kind = excluded.kind,
       size = excluded.size,
       mtime_ms = excluded.mtime_ms,
       sample_hash = excluded.sample_hash,
       cursor = excluded.cursor,
       warnings = excluded.warnings,
       error = excluded.error,
       last_synced_at = excluded.last_synced_at`,
  ).run(
    source.path,
    adapter.id,
    adapter.version,
    source.kind,
    stat.size,
    Math.trunc(stat.mtimeMs),
    sampleHash,
    cursor,
    warnings,
    error,
    Date.now(),
  )
}

function recordAgentError(db: Database, adapter: AgentAdapter, error: unknown): void {
  db.prepare(
    `INSERT INTO sources (path, agent, adapter_version, kind, size, mtime_ms, sample_hash, cursor, warnings, error, last_synced_at)
     VALUES (?, ?, ?, 'discovery', 0, 0, '', NULL, 0, ?, ?)
     ON CONFLICT(path) DO UPDATE SET error = excluded.error, last_synced_at = excluded.last_synced_at`,
  ).run(`discovery://${adapter.id}`, adapter.id, adapter.version, describeError(error), Date.now())
}

/** Error text safe to persist: message only, never file content. */
function describeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500)
}

/** Hash 4KB samples at five evenly spaced offsets; cheap change detection. */
async function sampleFileHash(path: string, size: number): Promise<string> {
  const hash = createHash("sha256")
  hash.update(String(size))
  const handle = await fs.open(path, "r")
  try {
    const sample = Buffer.alloc(4096)
    for (let i = 0; i < 5; i++) {
      const offset = Math.trunc((size / 5) * i)
      const { bytesRead } = await handle.read(sample, 0, sample.length, offset)
      hash.update(sample.subarray(0, bytesRead))
    }
  } finally {
    await handle.close()
  }
  return hash.digest("hex").slice(0, 24)
}

async function acquireLock(lockPath: string): Promise<void> {
  const deadline = Date.now() + 60 * 60 * 1000
  await fs.mkdir(dataDir(), { recursive: true })
  while (true) {
    try {
      const handle = await fs.open(lockPath, "wx")
      await handle.writeFile(String(process.pid))
      await handle.close()
      return
    } catch {
      // A dead process may leave the lock behind; steal stale locks.
      const stat = await fs.stat(lockPath).catch(() => null)
      if (stat && Date.now() - stat.mtimeMs > 10 * 60 * 1000) {
        await fs.rm(lockPath, { force: true })
        continue
      }
      if (Date.now() > deadline) throw new Error("Sync lock timeout")
      await setTimeout(100)
    }
  }
}
