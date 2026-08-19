import { join } from "node:path"
import { envPath } from "../types"
import { fileAdapter } from "./shared/factory"
import { parseJsonl } from "./shared/json"
import { usageRecord } from "./shared/usage-record"

export const gajaeCodeAdapter = fileAdapter({ id: "gajae-code", label: "Gajae-Code", roots: (context) => { const direct = envPath(context.env, "GJC_CODING_AGENT_DIR"); const config = envPath(context.env, "GJC_CONFIG_DIR") ?? envPath(context.env, "PI_CONFIG_DIR"); const xdg = envPath(context.env, "XDG_DATA_HOME"); return [direct ?? join(config ?? join(context.home, ".gjc"), "agent", "sessions"), ...(xdg ? [join(xdg, "gjc", "sessions")] : [])] }, file: (name) => name.endsWith(".jsonl"), parse: (source, context) => parseJsonl({ agent: "gajae-code", source, context, record: usageRecord }) })
