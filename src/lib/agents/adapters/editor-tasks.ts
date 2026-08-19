import { vscodeTaskAdapter } from "./shared/vscode-tasks"

export const rooCodeAdapter = vscodeTaskAdapter(
  "roo-code",
  "Roo Code",
  "rooveterinaryinc.roo-cline",
)

export const kiloCodeAdapter = vscodeTaskAdapter(
  "kilo-code",
  "Kilo",
  "kilocode.kilo-code",
)
