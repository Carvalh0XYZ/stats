import { access } from "node:fs/promises"
import { join } from "node:path"
import type { AgentAdapter, UsageSource } from "../types"
import { envPath } from "../types"
import { walkFiles } from "../../usage/parse"
import { parseJsonUsage } from "./shared/json-usage"
import { parseVscodeTasks, vscodeTaskAdapter } from "./shared/vscode-tasks"

const taskAdapter = vscodeTaskAdapter("cline", "Cline", "saoudrizwan.claude-dev")

export const clineAdapter: AgentAdapter = {
  id: "cline",
  label: "Cline",
  version: 1,
  async *discover(context) {
    for await (const source of taskAdapter.discover(context)) yield source
    const dataRoot = envPath(context.env, "CLINE_DATA_DIR")
    const clineRoot = envPath(context.env, "CLINE_DIR")
    const sessionRoot =
      envPath(context.env, "CLINE_SESSION_DATA_DIR") ??
      (dataRoot ? join(dataRoot, "sessions") : undefined) ??
      (clineRoot ? join(clineRoot, "data", "sessions") : undefined) ??
      join(context.home, ".cline", "data", "sessions")
    try {
      await access(sessionRoot)
      for (const path of await walkFiles(sessionRoot, (name) => name.endsWith(".messages.json"))) {
        yield { agent: "cline", path, kind: "cli-json" } satisfies UsageSource
      }
    } catch {
      // CLI sessions are optional.
    }
  },
  parse(source, context) {
    if (source.kind === "vscode-tasks") return parseVscodeTasks(source, context, "cline")
    return parseJsonUsage({ ...source, kind: "json" }, context, "cline")
  },
}
