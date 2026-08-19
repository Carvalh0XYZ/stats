import { join } from "node:path"
import { envPath } from "../types"
import { fileAdapter } from "./shared/factory"
import { parseJsonl } from "./shared/json"
import { usageRecord } from "./shared/usage-record"

export const reasonixAdapter = fileAdapter({ id: "reasonix", label: "Reasonix", roots: (context) => [join(envPath(context.env, "REASONIX_STATE_HOME") ?? envPath(context.env, "REASONIX_HOME") ?? join(context.home, ".reasonix"), "stats")], file: (name) => name.endsWith(".jsonl"), parse: (source, context) => parseJsonl({ agent: "reasonix", source, context, record: usageRecord }) })
