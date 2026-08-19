import { access } from "node:fs/promises"
import { dirname, isAbsolute, join } from "node:path"
import type { AgentAdapter, UsageSource } from "../types"
import { envPath } from "../types"
import { readJsonFile } from "../../usage/parse"
import { parseSqliteUsage } from "./shared/sqlite"

export const crushAdapter: AgentAdapter = {
  id: "crush",
  label: "Crush",
  version: 1,
  async *discover(context) {
    const root = envPath(context.env, "XDG_DATA_HOME") ?? join(context.home, ".local", "share")
    const registries = [join(root, "crush", "projects.json"), ...context.extraRoots.map((path) => join(path, "projects.json"))]
    for (const registry of registries) {
      const value = await readJsonFile(registry)
      const entries = Array.isArray(value)
        ? value
        : value !== null && typeof value === "object" && !Array.isArray(value)
          ? Object.values(value as Record<string, unknown>)
          : []
      for (const entry of entries) {
        const projectPath = typeof entry === "string"
          ? entry
          : entry !== null && typeof entry === "object" && !Array.isArray(entry)
            ? String((entry as Record<string, unknown>).path ?? "")
            : ""
        if (!projectPath) continue
        const path = isAbsolute(projectPath)
          ? join(projectPath, "crush.db")
          : join(dirname(registry), projectPath, "crush.db")
        try {
          await access(path)
          yield { agent: "crush", path, kind: "sqlite" } satisfies UsageSource
        } catch {
          // Stale project registry entries are ignored.
        }
      }
    }
  },
  parse(source, context) {
    return parseSqliteUsage(source, context, {
      agent: "crush",
      query: `
        SELECT id, id AS session_id, created_at AS timestamp, NULL AS provider,
          'session-total' AS model, project, 0 AS input_tokens,
          0 AS output_tokens, 0 AS cache_read_tokens, 0 AS cache_write_tokens,
          0 AS reasoning_tokens, total_cost AS cost_usd, duration_ms,
          id AS dedup_key
        FROM sessions
        WHERE parent_id IS NULL AND total_cost IS NOT NULL
      `,
    })
  },
}
