/**
 * The single registry of trackable agents — the source-coverage contract.
 * UI filters, database rows, and adapters all derive AgentId from this table.
 *
 * kind:
 * - "local": reads logs or databases the agent writes on this machine.
 * - "cache": reads cache artifacts written by external sync tooling;
 *   shown as "sync required" when absent.
 * - "attributed": no files of its own; usage is re-attributed from a host
 *   adapter (e.g. Sakana rows inside Codex sessions).
 */
export const AGENTS = {
  "claude-code": { label: "Claude Code", kind: "local" },
  codex: { label: "Codex CLI", kind: "local" },
  "gemini-cli": { label: "Gemini CLI", kind: "local" },
  opencode: { label: "OpenCode", kind: "local" },
  amp: { label: "Amp", kind: "local" },
  droid: { label: "Droid", kind: "local" },
  pi: { label: "Pi", kind: "local" },
  omp: { label: "Oh My Pi", kind: "local" },
  "qwen-cli": { label: "Qwen CLI", kind: "local" },
  kimi: { label: "Kimi", kind: "local" },
  mux: { label: "Mux", kind: "local" },
  "grok-build": { label: "Grok Build", kind: "local" },
  openclaw: { label: "OpenClaw", kind: "local" },
  "prime-agent": { label: "Prime Agent", kind: "local" },
  senpi: { label: "Senpi", kind: "local" },
  kimchi: { label: "Kimchi Coding", kind: "local" },
  reasonix: { label: "Reasonix", kind: "local" },
  "gajae-code": { label: "Gajae-Code", kind: "local" },
  jcode: { label: "Jcode", kind: "local" },
  junie: { label: "Junie", kind: "local" },
  augment: { label: "Augment Code", kind: "local" },
  opencodereview: { label: "OpenCodeReview", kind: "local" },
  codebuddy: { label: "CodeBuddy", kind: "local" },
  workbuddy: { label: "WorkBuddy", kind: "local" },
  "cherry-studio": { label: "Cherry Studio", kind: "local" },
  "command-code": { label: "Command Code", kind: "local" },
  "deepseek-harness": { label: "DeepSeek Harness", kind: "local" },
  codebuff: { label: "Codebuff", kind: "local" },
  freebuff: { label: "Freebuff", kind: "local" },
  hermes: { label: "Hermes Agent", kind: "local" },
  "kilo-cli": { label: "Kilo CLI", kind: "local" },
  goose: { label: "Goose", kind: "local" },
  zed: { label: "Zed Agent", kind: "local" },
  kiro: { label: "Kiro", kind: "local" },
  "antigravity-cli": { label: "Antigravity CLI", kind: "local" },
  "mimo-code": { label: "MiMo Code", kind: "local" },
  zcode: { label: "ZCode", kind: "local" },
  "devin-cli": { label: "Devin CLI", kind: "local" },
  "devin-desktop": { label: "Devin Desktop", kind: "local" },
  octofriend: { label: "Octofriend", kind: "local" },
  crush: { label: "Crush", kind: "local" },
  cline: { label: "Cline", kind: "local" },
  "copilot-cli": { label: "GitHub Copilot CLI", kind: "local" },
  "roo-code": { label: "Roo Code", kind: "local" },
  "kilo-code": { label: "Kilo", kind: "local" },
  cursor: { label: "Cursor IDE", kind: "cache" },
  antigravity: { label: "Google Antigravity", kind: "cache" },
  trae: { label: "Trae", kind: "cache" },
  warp: { label: "Warp / Oz", kind: "cache" },
  "minimax-code": { label: "MiniMax Code", kind: "cache" },
  sakana: { label: "Sakana Fugu", kind: "attributed" },
  synthetic: { label: "Synthetic", kind: "attributed" },
} as const satisfies Record<string, { label: string; kind: "local" | "cache" | "attributed" }>

export type AgentId = keyof typeof AGENTS

export const AGENT_IDS = Object.keys(AGENTS) as AgentId[]

export function isAgentId(value: string): value is AgentId {
  return value in AGENTS
}
