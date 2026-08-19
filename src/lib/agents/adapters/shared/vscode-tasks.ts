import { join } from "node:path"
import type { AgentId } from "../../registry"
import type { AgentAdapter, DiscoveryContext, ParseContext, ParseOutput, UsageSource } from "../../types"
import { eventId, localDateOf, readJsonFile, timestampOf, tokenCount, walkFiles } from "../../../usage/parse"

export function vscodeTaskAdapter(agent: AgentId, label: string, extension: string): AgentAdapter {
  return {
    id: agent,
    label,
    version: 1,
    async *discover(context) {
      for (const root of taskRoots(context, extension)) {
        for (const path of await walkFiles(root, (name) => name === "ui_messages.json")) {
          yield { agent, path, kind: "vscode-tasks" } satisfies UsageSource
        }
      }
    },
    parse(source, context) {
      return parseVscodeTasks(source, context, agent)
    },
  }
}

export async function parseVscodeTasks(
  source: UsageSource,
  context: ParseContext,
  agent: AgentId,
): Promise<ParseOutput> {
  const value = await readJsonFile(source.path)
  if (!Array.isArray(value)) {
    context.warn(`Skipped malformed ${agent} task file ${source.path}`)
    return { events: [] }
  }
  const sessionId = source.path.split(/[\\/]/).at(-2) ?? source.path
  const events = []
  for (let index = 0; index < value.length; index++) {
    const item = value[index]
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue
    const row = item as Record<string, unknown>
    if (row.type !== "say" || row.say !== "api_req_started" || typeof row.text !== "string") continue
    let usage: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(row.text)
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error()
      usage = parsed as Record<string, unknown>
    } catch {
      context.warn(`Skipped malformed ${agent} usage record in ${source.path}`)
      continue
    }
    const timestamp = timestampOf(row.ts ?? row.timestamp)
    if (timestamp === null) {
      context.warn(`Skipped malformed ${agent} usage record in ${source.path}`)
      continue
    }
    const cost = typeof usage.cost === "number" && Number.isFinite(usage.cost) ? usage.cost : null
    const recordId = String(row.id ?? row.ts ?? index)
    events.push({
      id: eventId(agent, source.path, recordId),
      agent,
      provider: typeof usage.apiProtocol === "string" ? usage.apiProtocol : null,
      model: typeof usage.model === "string" ? usage.model : null,
      sessionId,
      project: null,
      timestamp,
      localDate: localDateOf(timestamp, context.timezone),
      tokens: {
        input: tokenCount(usage.tokensIn),
        output: tokenCount(usage.tokensOut),
        cacheRead: tokenCount(usage.cacheReads),
        cacheWrite: tokenCount(usage.cacheWrites),
        reasoning: 0,
      },
      costUsd: cost,
      costSource: cost === null ? "unpriced" as const : "reported" as const,
      durationMs: null,
      dedupKey: `${sessionId}:${recordId}`,
      sourcePath: source.path,
    })
  }
  return { events }
}

function taskRoots(context: DiscoveryContext, extension: string): string[] {
  const desktop = context.platform === "darwin"
    ? join(context.home, "Library", "Application Support", "Code")
    : context.platform === "win32"
      ? join(context.env.APPDATA?.trim() || context.home, "Code")
      : join(context.env.XDG_CONFIG_HOME?.trim() || join(context.home, ".config"), "Code")
  return [
    join(desktop, "User", "globalStorage", extension, "tasks"),
    join(context.home, ".vscode-server", "data", "User", "globalStorage", extension, "tasks"),
    ...context.extraRoots.map((root) => join(root, extension, "tasks")),
  ]
}
