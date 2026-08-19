import { createFileRoute } from "@tanstack/react-router"
import { getDb } from "@/lib/db/client.server"
import { syncInProgress, syncUsage } from "@/lib/sync/sync.server"
import type { SyncStatus } from "@/lib/api/types"

function syncStatus(): SyncStatus {
  const row = getDb()
    .prepare(
      `SELECT started_at, finished_at, discovered, processed, skipped, inserted, warnings
       FROM sync_runs ORDER BY id DESC LIMIT 1`,
    )
    .get() as
    | {
        started_at: number
        finished_at: number | null
        discovered: number
        processed: number
        skipped: number
        inserted: number
        warnings: number
      }
    | undefined
  return {
    running: syncInProgress(),
    lastRun: row
      ? {
          startedAt: row.started_at,
          finishedAt: row.finished_at,
          discovered: row.discovered,
          processed: row.processed,
          skipped: row.skipped,
          inserted: row.inserted,
          warnings: row.warnings,
        }
      : null,
  }
}

export const Route = createFileRoute("/api/sync")({
  server: {
    handlers: {
      GET: () => Response.json(syncStatus()),
      POST: () => {
        // Fire and forget; clients poll GET /api/sync for completion.
        void syncUsage().catch(() => {})
        return Response.json({ ...syncStatus(), running: true })
      },
    },
  },
})
