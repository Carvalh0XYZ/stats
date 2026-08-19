import { access } from "node:fs/promises"
import { join } from "node:path"
import type { AgentAdapter, UsageSource } from "../types"
import { envPath } from "../types"
import { parseJsonObject, parseSqliteUsage } from "./shared/sqlite"

export const gooseAdapter: AgentAdapter = {
  id: "goose",
  label: "Goose",
  version: 1,
  async *discover(context) {
    const override = envPath(context.env, "GOOSE_PATH_ROOT")
    const paths = override
      ? [join(override, "sessions", "sessions.db"), join(override, "sessions.db")]
      : [
          join(context.home, ".local", "share", "goose", "sessions", "sessions.db"),
          join(context.home, ".local", "share", "Block", "goose", "sessions", "sessions.db"),
          join(context.home, "Library", "Application Support", "goose", "sessions", "sessions.db"),
          join(context.home, "Library", "Application Support", "Block", "goose", "sessions", "sessions.db"),
        ]
    for (const path of [...paths, ...context.extraRoots.map((root) => join(root, "sessions.db"))]) {
      try {
        await access(path)
        yield { agent: "goose", path, kind: "sqlite" } satisfies UsageSource
      } catch {
        // Missing sources are normal.
      }
    }
  },
  parse(source, context) {
    return parseSqliteUsage(source, context, {
      agent: "goose",
      query: `
        SELECT id, id AS session_id, created_at AS timestamp, provider_name,
          model_config_json, input_tokens, output_tokens, reasoning_tokens,
          total_cost AS cost_usd, duration_ms, id AS dedup_key
        FROM sessions
      `,
      map(row) {
        const modelConfig = parseJsonObject(row.model_config_json)
        return {
          id: String(row.id),
          session_id: String(row.session_id),
          timestamp: row.timestamp,
          provider: row.provider_name,
          model: modelConfig?.model ?? modelConfig?.model_name,
          input_tokens: row.input_tokens,
          output_tokens: row.output_tokens,
          reasoning_tokens: row.reasoning_tokens,
          cost_usd: row.cost_usd,
          duration_ms: row.duration_ms,
          dedup_key: row.dedup_key,
        }
      },
    })
  },
}
