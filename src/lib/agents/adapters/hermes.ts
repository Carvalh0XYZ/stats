import { access, readdir } from "node:fs/promises"
import { join } from "node:path"
import type { AgentAdapter, UsageSource } from "../types"
import { envPath } from "../types"
import { parseSqliteUsage } from "./shared/sqlite"

export const hermesAdapter: AgentAdapter = {
  id: "hermes",
  label: "Hermes Agent",
  version: 1,
  async *discover(context) {
    const root = envPath(context.env, "HERMES_HOME") ?? join(context.home, ".hermes")
    const paths = [join(root, "state.db")]
    try {
      for (const entry of await readdir(join(root, "profiles"), { withFileTypes: true })) {
        if (entry.isDirectory()) paths.push(join(root, "profiles", entry.name, "state.db"))
      }
    } catch {
      // Profiles are optional.
    }
    for (const extra of context.extraRoots) paths.push(join(extra, "state.db"))
    for (const path of paths) {
      try {
        await access(path)
        yield { agent: "hermes", path, kind: "sqlite" } satisfies UsageSource
      } catch {
        // Missing sources are normal.
      }
    }
  },
  parse(source, context) {
    return parseSqliteUsage(source, context, {
      agent: "hermes",
      query: `
        SELECT id, id AS session_id, started_at AS timestamp, provider, model,
          project, input_tokens, output_tokens, cache_read_tokens,
          cache_write_tokens, reasoning_tokens,
          COALESCE(actual_cost_usd, estimated_cost_usd) AS cost_usd,
          duration_ms, id AS dedup_key
        FROM sessions
        WHERE model IS NOT NULL AND (
          input_tokens > 0 OR output_tokens > 0 OR cache_read_tokens > 0 OR
          cache_write_tokens > 0 OR reasoning_tokens > 0 OR
          actual_cost_usd > 0 OR estimated_cost_usd > 0
        )
      `,
    })
  },
}
