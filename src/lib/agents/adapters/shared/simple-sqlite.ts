import { access } from "node:fs/promises"
import { join } from "node:path"
import type { AgentId } from "../../registry"
import type { AgentAdapter, DiscoveryContext, UsageSource } from "../../types"
import { envPath } from "../../types"
import { parseSqliteUsage, type SqliteSpec } from "./sqlite"

export interface SqliteAdapterSpec extends SqliteSpec {
  label: string
  paths: (context: DiscoveryContext) => Promise<string[]> | string[]
}

export function sqliteAdapter(spec: SqliteAdapterSpec): AgentAdapter {
  return {
    id: spec.agent,
    label: spec.label,
    version: 1,
    async *discover(context) {
      for (const path of await spec.paths(context)) {
        try {
          await access(path)
          yield { agent: spec.agent, path, kind: "sqlite" } satisfies UsageSource
        } catch {
          // Missing sources are normal on machines where the agent is not installed.
        }
      }
    },
    parse(source, context) {
      return parseSqliteUsage(source, context, spec)
    },
  }
}

export function xdgDataPath(context: DiscoveryContext, ...parts: string[]): string {
  const root = envPath(context.env, "XDG_DATA_HOME") ?? join(context.home, ".local", "share")
  return join(root, ...parts)
}

export function platformDataPath(
  context: DiscoveryContext,
  macParts: string[],
  linuxParts: string[],
  windowsParts: string[],
): string {
  if (context.platform === "darwin") {
    return join(context.home, "Library", "Application Support", ...macParts)
  }
  if (context.platform === "win32") {
    return join(envPath(context.env, "LOCALAPPDATA") ?? context.home, ...windowsParts)
  }
  return xdgDataPath(context, ...linuxParts)
}

export const STANDARD_USAGE_QUERY = `
  SELECT id, session_id, timestamp, provider, model, project,
    input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
    reasoning_tokens, cost_usd, duration_ms, dedup_key
  FROM usage_events
`

export function fixedSqlitePaths(agent: AgentId, context: DiscoveryContext, path: string): string[] {
  return [path, ...context.extraRoots.map((root) => join(root, agent, path.split(agent).at(-1) ?? ""))]
}
