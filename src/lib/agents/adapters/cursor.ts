import { promises as fs } from "node:fs"
import { basename, join } from "node:path"
import type { AgentAdapter } from "../types"
import { eventId, localDateOf, timestampOf, tokenCount } from "../../usage/parse"
import { sharedCacheRoot } from "./shared/cache"

export const cursorAdapter: AgentAdapter = {
  id: "cursor",
  label: "Cursor IDE",
  version: 1,
  cacheBacked: true,
  async *discover(context) {
    const roots = [join(sharedCacheRoot(context), "cursor-cache"), ...context.extraRoots.map((root) => join(root, "cursor-cache"))]
    for (const root of roots) {
      let names: string[]
      try {
        names = await fs.readdir(root)
      } catch {
        continue
      }
      for (const name of names.sort()) {
        if (/^usage(?:\..+)?\.csv$/.test(name)) yield { agent: "cursor", path: join(root, name), kind: "csv" }
      }
    }
  },
  async parse(source, context) {
    const text = await fs.readFile(source.path, "utf8")
    const rows = parseCsv(text)
    if (rows.length === 0) return { events: [] }
    const headers = rows[0].map((field) => field.trim().toLowerCase())
    const get = (row: string[], ...names: string[]): string | undefined => {
      const index = names.map((name) => headers.indexOf(name)).find((value) => value >= 0)
      return index === undefined ? undefined : row[index]
    }
    const events = []
    for (let index = 1; index < rows.length; index++) {
      const row = rows[index]
      const timestamp = timestampOf(get(row, "date", "timestamp"))
      const model = get(row, "model")?.trim()
      if (timestamp === null || !model) {
        context.warn(`Skipped malformed Cursor CSV row ${index + 1}`)
        continue
      }
      const input = tokenCount(get(row, "input tokens", "input", "input_no_cache"))
      const inputWithCache = tokenCount(get(row, "input with cache write", "input_with_cache_write"))
      const cacheWrite = tokenCount(get(row, "cache write tokens", "cache_write")) || Math.max(inputWithCache - input, 0)
      const costText = get(row, "cost", "cost usd", "cost_usd")?.replace(/[$,]/g, "").trim()
      const cost = costText ? Number(costText) : NaN
      const kind = get(row, "kind")?.trim() || "usage"
      const key = `${basename(source.path)}:${index}:${timestamp}:${model}:${kind}`
      events.push({
        id: eventId("cursor", source.path, key),
        agent: "cursor" as const,
        provider: get(row, "provider")?.trim() || "cursor",
        model,
        sessionId: get(row, "session id", "session_id")?.trim() || `cursor-${basename(source.path)}-${timestamp}`,
        project: get(row, "project")?.trim() || null,
        timestamp,
        localDate: localDateOf(timestamp, context.timezone),
        tokens: { input, output: tokenCount(get(row, "output tokens", "output")), cacheRead: tokenCount(get(row, "cache read tokens", "cache_read")), cacheWrite, reasoning: tokenCount(get(row, "reasoning tokens", "reasoning")) },
        costUsd: Number.isFinite(cost) && cost >= 0 ? cost : null,
        costSource: Number.isFinite(cost) && cost >= 0 ? "reported" as const : "unpriced" as const,
        durationMs: null,
        dedupKey: get(row, "request id", "request_id")?.trim() || null,
        sourcePath: source.path,
      })
    }
    return { events }
  },
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"'
        index++
      } else quoted = !quoted
    } else if (char === "," && !quoted) {
      row.push(field)
      field = ""
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index++
      row.push(field)
      if (row.some(Boolean)) rows.push(row)
      row = []
      field = ""
    } else field += char
  }
  row.push(field)
  if (row.some(Boolean)) rows.push(row)
  return rows
}
