import { join } from "node:path"
import { envPath } from "../types"
import { fileAdapter } from "./shared/factory"
import { parseJsonl } from "./shared/json"
import { usageRecord } from "./shared/usage-record"

export const senpiAdapter = fileAdapter({ id: "senpi", label: "Senpi", roots: (context) => [envPath(context.env, "SENPI_CODING_AGENT_DIR") ?? join(context.home, ".senpi", "agent", "sessions")], file: (name) => name.endsWith(".jsonl"), parse: (source, context) => parseJsonl({ agent: "senpi", source, context, record: usageRecord }) })
