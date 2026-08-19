import { join } from "node:path"
import type { AgentAdapter } from "../types"
import { walkFiles } from "../../usage/parse"
import { parsePi } from "./shared/pi"

export const ompAdapter: AgentAdapter = {
  id: "omp",
  label: "Oh My Pi",
  version: 1,
  async *discover(context) {
    for (const path of await walkFiles(join(context.home, ".omp", "agent", "sessions"), (name) => name.endsWith(".jsonl"))) {
      yield { agent: "omp", path, kind: "jsonl" }
    }
  },
  async parse(source, context) {
    return parsePi(source, context, "omp")
  },
}
