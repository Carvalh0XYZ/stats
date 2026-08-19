import { createFileRoute } from "@tanstack/react-router"
import { existsSync } from "node:fs"
import { isAbsolute } from "node:path"
import { z } from "zod"
import { extraRoots, pinnedTimezone, setSetting } from "@/lib/db/client.server"
import { dataDir } from "@/lib/db/paths.server"
import { loadCatalog } from "@/lib/pricing/models-dev"

const updateSchema = z.object({
  extraRoots: z.array(z.string()).optional(),
  timezone: z.string().optional(),
})

function isValidTimezone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone })
    return true
  } catch {
    return false
  }
}

async function settingsPayload() {
  const catalog = await loadCatalog(dataDir()).catch(() => null)
  return {
    dataDir: dataDir(),
    timezone: pinnedTimezone(),
    extraRoots: extraRoots(),
    pricing: catalog ? { fetchedAt: catalog.fetchedAt } : null,
  }
}

export const Route = createFileRoute("/api/settings")({
  server: {
    handlers: {
      GET: async () => Response.json(await settingsPayload()),
      PUT: async ({ request }) => {
        const parsed = updateSchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) {
          return Response.json({ error: "invalid settings" }, { status: 400 })
        }
        const { extraRoots: roots, timezone } = parsed.data
        if (roots) {
          const invalid = roots.find(root => !isAbsolute(root) || !existsSync(root))
          if (invalid !== undefined) {
            return Response.json({ error: `not an existing absolute path: ${invalid}` }, { status: 400 })
          }
          setSetting("extraRoots", JSON.stringify(roots))
        }
        if (timezone) {
          if (!isValidTimezone(timezone)) {
            return Response.json({ error: `invalid timezone: ${timezone}` }, { status: 400 })
          }
          setSetting("timezone", timezone)
        }
        return Response.json(await settingsPayload())
      },
    },
  },
})
