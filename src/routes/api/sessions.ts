import { createFileRoute } from "@tanstack/react-router"
import { filterFromUrl } from "@/lib/api/filter.server"
import { getSessions } from "@/lib/api/queries.server"

export const Route = createFileRoute("/api/sessions")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const url = new URL(request.url)
        const page = Math.max(1, Number(url.searchParams.get("page")) || 1)
        const pageSize = Math.min(200, Math.max(1, Number(url.searchParams.get("pageSize")) || 25))
        return Response.json(getSessions(filterFromUrl(url), page, pageSize))
      },
    },
  },
})
