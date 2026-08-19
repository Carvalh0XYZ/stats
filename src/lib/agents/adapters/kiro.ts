import { access } from "node:fs/promises"
import { join } from "node:path"
import type { AgentAdapter, UsageSource } from "../types"
import { walkFiles } from "../../usage/parse"
import { parseSqliteUsage } from "./shared/sqlite"
import { platformDataPath } from "./shared/simple-sqlite"

export const kiroAdapter: AgentAdapter = {
  id: "kiro",
  label: "Kiro",
  version: 1,
  async *discover(context) {
    const roots = [join(context.home, ".kiro", "sessions", "cli"), ...context.extraRoots]
    for (const root of roots) {
      for (const path of await walkFiles(root, (name) => name.endsWith(".json") || name.endsWith(".jsonl"))) {
        yield { agent: "kiro", path, kind: nameKind(path) } satisfies UsageSource
      }
    }
    const databases = [
      platformDataPath(
        context,
        ["kiro-cli", "data.sqlite3"],
        ["kiro-cli", "data.sqlite3"],
        ["kiro-cli", "data.sqlite3"],
      ),
      platformDataPath(
        context,
        ["Kiro", "User", "globalStorage", "kiro.kiroagent", "data.sqlite3"],
        ["Kiro", "User", "globalStorage", "kiro.kiroagent", "data.sqlite3"],
        ["Kiro", "User", "globalStorage", "kiro.kiroagent", "data.sqlite3"],
      ),
    ]
    for (const path of databases) {
      try {
        await access(path)
        yield { agent: "kiro", path, kind: "sqlite" } satisfies UsageSource
      } catch {
        // Missing sources are normal.
      }
    }
  },
  async parse(source, context) {
    if (source.kind === "sqlite") {
      return parseSqliteUsage(source, context, {
        agent: "kiro",
        query: `
          SELECT id, session_id, timestamp, provider, model, project,
            input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
            reasoning_tokens, cost_usd, duration_ms, id AS dedup_key
          FROM usage_events
        `,
      })
    }
    const { parseJsonUsage } = await import("./shared/json-usage")
    return parseJsonUsage(source, context, "kiro")
  },
}

function nameKind(path: string): string {
  return path.endsWith(".jsonl") ? "jsonl" : "json"
}
