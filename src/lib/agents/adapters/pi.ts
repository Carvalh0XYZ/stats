import { join } from "node:path"
import type { AgentAdapter } from "../types"
import { walkFiles } from "../../usage/parse"
import { parsePi } from "./shared/pi"

export const piAdapter: AgentAdapter = {
  id: "pi",
  label: "Pi",
  version: 1,
  async *discover(context) {
    for (const path of await walkFiles(join(context.home, ".pi", "agent", "sessions"), (name) => name.endsWith(".jsonl"))) {
      yield { agent: "pi", path, kind: "jsonl" }
    }
  },
  async parse(source, context) {
    return parsePi(source, context, "pi")
  },
}
