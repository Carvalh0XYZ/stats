import { createFileRoute } from "@tanstack/react-router"
import { filterFromUrl } from "@/lib/api/filter.server"
import { getTimeSeries } from "@/lib/api/queries.server"

export const Route = createFileRoute("/api/timeseries")({
  server: {
    handlers: {
      GET: ({ request }) => Response.json(getTimeSeries(filterFromUrl(new URL(request.url)))),
    },
  },
})
