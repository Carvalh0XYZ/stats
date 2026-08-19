import { createFileRoute } from "@tanstack/react-router"
import { syncUsage } from "@/lib/sync/sync.server"

// The launcher probes /api/health as soon as the server starts, so the
// first probe doubles as the startup sync trigger.
let startupSyncStarted = false

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () => {
        if (!startupSyncStarted) {
          startupSyncStarted = true
          void syncUsage().catch(() => {})
        }
        return Response.json({ ok: true }, { headers: { "x-telemetry-stats-dashboard": "1" } })
      },
    },
  },
})
