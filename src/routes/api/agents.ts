import { createFileRoute } from "@tanstack/react-router"
import { getAgentStatuses } from "@/lib/api/queries.server"

export const Route = createFileRoute("/api/agents")({
  server: {
    handlers: {
      GET: () => Response.json(getAgentStatuses()),
    },
  },
})
