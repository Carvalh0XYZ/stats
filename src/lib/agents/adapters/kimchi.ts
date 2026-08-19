import { join } from "node:path"
import { envPath } from "../types"
import { fileAdapter } from "./shared/factory"
import { parseJsonl } from "./shared/json"
import { usageRecord } from "./shared/usage-record"

export const kimchiAdapter = fileAdapter({ id: "kimchi", label: "Kimchi Coding", roots: (context) => [envPath(context.env, "KIMCHI_CODING_AGENT_DIR") ?? join(context.home, ".config", "kimchi", "harness", "sessions")], file: (name) => name.endsWith(".jsonl"), parse: (source, context) => parseJsonl({ agent: "kimchi", source, context, record: usageRecord }) })
