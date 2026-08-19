import { createFileRoute } from "@tanstack/react-router"
import { filterFromUrl } from "@/lib/api/filter.server"
import { getBreakdown } from "@/lib/api/queries.server"
import type { BreakdownDimension } from "@/lib/api/types"

const DIMENSIONS: BreakdownDimension[] = ["agent", "provider", "model", "project"]

export const Route = createFileRoute("/api/breakdown")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const url = new URL(request.url)
        const dimension = url.searchParams.get("dimension")
        if (!DIMENSIONS.includes(dimension as BreakdownDimension)) {
          return Response.json({ error: "invalid dimension" }, { status: 400 })
        }
        return Response.json(
          getBreakdown(filterFromUrl(url), dimension as BreakdownDimension),
        )
      },
    },
  },
})
