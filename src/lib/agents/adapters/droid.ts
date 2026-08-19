import { basename, dirname, join } from "node:path"
import type { AgentAdapter } from "../types"
import { readJsonFile, walkFiles } from "../../usage/parse"
import { recordOf, standardTokens, textOf, usageEvent } from "./shared/json"

export const droidAdapter: AgentAdapter = {
  id: "droid",
  label: "Droid",
  version: 1,
  async *discover(context) {
    for (const path of await walkFiles(join(context.home, ".factory", "sessions"), (name) => name.endsWith(".settings.json"))) {
      yield { agent: "droid", path, kind: "settings" }
    }
  },
  async parse(source, context) {
    const settings = recordOf(await readJsonFile(source.path))
    const usage = recordOf(settings?.tokenUsage)
    if (!settings || !usage) {
      context.warn("malformed Droid settings")
      return { events: [] }
    }
    const sessionId = basename(source.path, ".settings.json")
    const event = usageEvent({
      agent: "droid",
      path: source.path,
      identity: sessionId,
      provider: textOf(settings.providerLock),
      model: textOf(settings.model),
      sessionId,
      project: basename(dirname(source.path)),
      timestamp: settings.providerLockTimestamp ?? settings.updatedAt,
      timezone: context.timezone,
      tokens: standardTokens(usage),
      dedupKey: null,
    })
    if (!event) context.warn("settings have no valid timestamp")
    return { events: event ? [event] : [] }
  },
}
