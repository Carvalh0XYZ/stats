import { createFileRoute } from "@tanstack/react-router"
import { filterFromUrl } from "@/lib/api/filter.server"
import { getOverview } from "@/lib/api/queries.server"

export const Route = createFileRoute("/api/overview")({
  server: {
    handlers: {
      GET: ({ request }) => Response.json(getOverview(filterFromUrl(new URL(request.url)))),
    },
  },
})
