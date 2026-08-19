import { join } from "node:path"
import type { AgentAdapter, UsageSource } from "../types"
import { walkFiles } from "../../usage/parse"
import { parseJsonUsage } from "./shared/json-usage"

export const devinDesktopAdapter: AgentAdapter = {
  id: "devin-desktop",
  label: "Devin Desktop",
  version: 1,
  async *discover(context) {
    const config = context.platform === "darwin"
      ? join(context.home, "Library", "Application Support")
      : context.platform === "win32"
        ? context.env.APPDATA?.trim() || context.home
        : context.env.XDG_CONFIG_HOME?.trim() || join(context.home, ".config")
    for (const root of [join(config, "Devin", "User", "acp-events"), ...context.extraRoots]) {
      for (const path of await walkFiles(root, (name) => name.endsWith(".json") || name.endsWith(".jsonl"))) {
        yield {
          agent: "devin-desktop",
          path,
          kind: path.endsWith(".jsonl") ? "jsonl" : "json",
        } satisfies UsageSource
      }
    }
  },
  parse(source, context) {
    return parseJsonUsage(source, context, "devin-desktop")
  },
}
