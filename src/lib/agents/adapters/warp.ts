import { access } from "node:fs/promises"
import { join } from "node:path"
import type { AgentAdapter } from "../types"
import { eventId, localDateOf, readJsonFile, timestampOf, tokenCount } from "../../usage/parse"
import { ZERO_TOKENS } from "../../usage/types"
import { asNumber, asObject, asText, sharedCacheRoot } from "./shared/cache"

export const warpAdapter: AgentAdapter = {
  id: "warp",
  label: "Warp / Oz",
  version: 1,
  cacheBacked: true,
  async *discover(context) {
    const paths = [join(sharedCacheRoot(context), "warp-cache", "usage.json"), ...context.extraRoots.map((root) => join(root, "warp-cache", "usage.json"))]
    for (const path of paths) {
      try {
        await access(path)
        yield { agent: "warp", path, kind: "json" }
      } catch {}
    }
  },
  async parse(source, context) {
    const cache = asObject(await readJsonFile(source.path))
    const timestamp = cache && timestampOf(cache.syncedAt)
    if (!cache || timestamp === null) {
      context.warn("Skipped malformed Warp cache file")
      return { events: [] }
    }
    const workspaces = Array.isArray(cache.workspaces) ? cache.workspaces : []
    const rows = workspaces.map(asObject).filter((row): row is Record<string, unknown> => row !== null)
    if (rows.length === 0) {
      const usage = asObject(cache.usage)
      if (usage) rows.push({ ...usage, id: "account", name: null })
    }
    const events = rows.flatMap((row) => {
      const requests = tokenCount(row.requestsUsed)
      const cents = asNumber(row.spendCents) ?? 0
      if (requests === 0 && cents === 0) return []
      const key = asText(row.id) ?? "account"
      return [{
        id: eventId("warp", source.path, key, timestamp),
        agent: "warp" as const,
        provider: "warp",
        model: "aggregate-requests",
        sessionId: `warp-aggregate-${key}`,
        project: asText(row.name),
        timestamp,
        localDate: localDateOf(timestamp, context.timezone),
        tokens: { ...ZERO_TOKENS },
        costUsd: cents / 100,
        costSource: "reported" as const,
        durationMs: null,
        dedupKey: `warp:${key}:${timestamp}`,
        sourcePath: source.path,
      }]
    })
    return { events }
  },
}
