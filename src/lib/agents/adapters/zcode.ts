import { access } from "node:fs/promises"
import { join } from "node:path"
import type { AgentAdapter, UsageSource } from "../types"
import { walkFiles } from "../../usage/parse"
import { parseJsonUsage } from "./shared/json-usage"
import { parseSqliteUsage } from "./shared/sqlite"

export const zcodeAdapter: AgentAdapter = {
  id: "zcode",
  label: "ZCode",
  version: 1,
  async *discover(context) {
    const database = join(context.home, ".zcode", "cli", "db", "db.sqlite")
    try {
      await access(database)
      yield { agent: "zcode", path: database, kind: "sqlite" } satisfies UsageSource
    } catch {
      // The legacy logs may exist without the v2 database.
    }
    for (const root of [join(context.home, ".zcode", "projects"), ...context.extraRoots]) {
      for (const path of await walkFiles(root, (name) => name.endsWith(".jsonl"))) {
        yield { agent: "zcode", path, kind: "jsonl" } satisfies UsageSource
      }
    }
  },
  parse(source, context) {
    if (source.kind === "jsonl") return parseJsonUsage(source, context, "zcode")
    return parseSqliteUsage(source, context, {
      agent: "zcode",
      query: `
        SELECT id, session_id, timestamp, provider, model, project,
          input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
          reasoning_tokens, cost_usd, duration_ms, id AS dedup_key
        FROM usage_events
      `,
    })
  },
}
