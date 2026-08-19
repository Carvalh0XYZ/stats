import type { AgentAdapter } from "../types"
import {
  STANDARD_USAGE_QUERY,
  platformDataPath,
  sqliteAdapter,
  xdgDataPath,
} from "./shared/simple-sqlite"

export const kiloCliAdapter = sqliteAdapter({
  agent: "kilo-cli",
  label: "Kilo CLI",
  query: STANDARD_USAGE_QUERY,
  paths: (context) => [xdgDataPath(context, "kilo", "kilo.db")],
})

export const zedAdapter = sqliteAdapter({
  agent: "zed",
  label: "Zed Agent",
  query: STANDARD_USAGE_QUERY,
  paths: (context) => [
    platformDataPath(
      context,
      ["Zed", "threads", "threads.db"],
      ["zed", "threads", "threads.db"],
      ["Zed", "threads", "threads.db"],
    ),
  ],
})

export const mimoCodeAdapter = sqliteAdapter({
  agent: "mimo-code",
  label: "MiMo Code",
  query: `
    SELECT m.id, m.session_id, m.data, NULLIF(s.directory, '') AS workspace_root
    FROM message m
    LEFT JOIN session s ON s.id = m.session_id
    WHERE json_extract(m.data, '$.role') = 'assistant'
      AND json_extract(m.data, '$.tokens') IS NOT NULL
  `,
  map(row) {
    if (typeof row.data !== "string") return null
    let data: Record<string, unknown>
    try {
      const value: unknown = JSON.parse(row.data)
      if (value === null || typeof value !== "object" || Array.isArray(value)) return null
      data = value as Record<string, unknown>
    } catch {
      return null
    }
    const tokens = data.tokens
    const time = data.time
    if (tokens === null || typeof tokens !== "object" || Array.isArray(tokens)) return null
    const tokenData = tokens as Record<string, unknown>
    const cache =
      tokenData.cache !== null && typeof tokenData.cache === "object" && !Array.isArray(tokenData.cache)
        ? (tokenData.cache as Record<string, unknown>)
        : {}
    const times =
      time !== null && typeof time === "object" && !Array.isArray(time)
        ? (time as Record<string, unknown>)
        : {}
    return {
      id: String(row.id),
      session_id: String(row.session_id),
      timestamp: times.created,
      provider: data.providerID,
      model: data.modelID,
      project: row.workspace_root ?? (data.path as Record<string, unknown> | undefined)?.root,
      input_tokens: tokenData.input,
      output_tokens: tokenData.output,
      cache_read_tokens: cache.read,
      cache_write_tokens: cache.write,
      reasoning_tokens: tokenData.reasoning,
      cost_usd: data.cost,
      duration_ms:
        typeof times.completed === "number" && typeof times.created === "number"
          ? times.completed - times.created
          : null,
      dedup_key: [
        times.created,
        data.modelID,
        data.providerID,
        tokenData.input,
        tokenData.output,
        data.cost,
        data.agent,
      ].join(":"),
    }
  },
  paths: (context) => [xdgDataPath(context, "mimocode", "mimocode.db")],
})

export const devinCliAdapter = sqliteAdapter({
  agent: "devin-cli",
  label: "Devin CLI",
  query: STANDARD_USAGE_QUERY,
  paths: (context) => [xdgDataPath(context, "devin", "cli", "sessions.db")],
})

export const octofriendAdapter = sqliteAdapter({
  agent: "octofriend",
  label: "Octofriend",
  query: STANDARD_USAGE_QUERY,
  attribute(row) {
    const provider = typeof row.provider === "string" ? row.provider.toLowerCase() : ""
    const model = typeof row.model === "string" ? row.model.toLowerCase() : ""
    return provider === "synthetic" || provider === "glhf" || provider === "octofriend" || model.startsWith("hf:")
      ? "synthetic"
      : "octofriend"
  },
  paths: (context) => [xdgDataPath(context, "octofriend", "sqlite.db")],
})

export const sqliteAgentAdapters: AgentAdapter[] = [
  kiloCliAdapter,
  zedAdapter,
  mimoCodeAdapter,
  devinCliAdapter,
  octofriendAdapter,
]
