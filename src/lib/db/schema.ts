import Database from "better-sqlite3"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"

export const SCHEMA_VERSION = 2

/** Open (creating directories and tables as needed) the stats database. */
export function openDatabase(path: string): Database.Database {
  mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path)
  db.pragma("journal_mode = WAL")
  db.pragma("busy_timeout = 5000")
  migrate(db)
  return db
}

function migrate(db: Database.Database): void {
  const version = db.pragma("user_version", { simple: true }) as number
  if (version >= SCHEMA_VERSION) return
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      session_id TEXT NOT NULL,
      project TEXT,
      timestamp INTEGER NOT NULL,
      local_date TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      cache_read_tokens INTEGER NOT NULL,
      cache_write_tokens INTEGER NOT NULL,
      reasoning_tokens INTEGER NOT NULL,
      cost_usd REAL,
      cost_source TEXT NOT NULL,
      duration_ms INTEGER,
      dedup_key TEXT,
      source_path TEXT NOT NULL,
      estimated_tokens INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON usage_events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_events_agent ON usage_events(agent, timestamp);
    CREATE INDEX IF NOT EXISTS idx_events_provider ON usage_events(provider);
    CREATE INDEX IF NOT EXISTS idx_events_model ON usage_events(model);
    CREATE INDEX IF NOT EXISTS idx_events_session ON usage_events(session_id);
    CREATE INDEX IF NOT EXISTS idx_events_project ON usage_events(project);
    CREATE INDEX IF NOT EXISTS idx_events_dedup ON usage_events(agent, dedup_key);
    CREATE INDEX IF NOT EXISTS idx_events_source ON usage_events(source_path);

    CREATE TABLE IF NOT EXISTS sources (
      path TEXT PRIMARY KEY,
      agent TEXT NOT NULL,
      adapter_version INTEGER NOT NULL,
      kind TEXT NOT NULL,
      size INTEGER NOT NULL,
      mtime_ms INTEGER NOT NULL,
      sample_hash TEXT NOT NULL,
      cursor INTEGER,
      resume_state TEXT,
      warnings INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      last_synced_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sources_agent ON sources(agent);

    CREATE TABLE IF NOT EXISTS sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      discovered INTEGER NOT NULL DEFAULT 0,
      processed INTEGER NOT NULL DEFAULT 0,
      skipped INTEGER NOT NULL DEFAULT 0,
      inserted INTEGER NOT NULL DEFAULT 0,
      warnings INTEGER NOT NULL DEFAULT 0,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
  const sourceColumns = db.pragma("table_info(sources)") as { name: string }[]
  if (!sourceColumns.some((column) => column.name === "resume_state")) {
    db.exec("ALTER TABLE sources ADD COLUMN resume_state TEXT")
  }
  db.pragma(`user_version = ${SCHEMA_VERSION}`)
}
