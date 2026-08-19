#!/usr/bin/env node
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { createServer } from "node:net"
import { dirname, join } from "node:path"
import { parseArgs } from "node:util"
import { fileURLToPath, pathToFileURL } from "node:url"

const DASHBOARD_HEADER = "x-telemetry-stats-dashboard"
const DEFAULT_PORT = 3847

const HELP = `telemetry-stats - token usage dashboard for AI coding agents

Usage:
  telemetry-stats [options]

Options:
  -p, --port <port>  Port for the dashboard server (default: ${DEFAULT_PORT})
      --host <host>  Host to bind (default: 127.0.0.1)
      --no-open      Do not open the browser
  -j, --json         Sync, print stats as JSON, and exit
  -s, --sync         Sync, print a summary, and exit
  -h, --help         Show this help message
`

function fail(message) {
  console.error(message)
  process.exit(1)
}

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const serverEntry = join(packageRoot, ".output", "server", "index.mjs")

let args
try {
  args = parseArgs({
    options: {
      port: { type: "string", short: "p", default: String(DEFAULT_PORT) },
      host: { type: "string", default: "127.0.0.1" },
      open: { type: "boolean", default: true },
      json: { type: "boolean", short: "j", default: false },
      sync: { type: "boolean", short: "s", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowNegative: true,
  }).values
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}

if (args.help) {
  console.log(HELP)
  process.exit(0)
}

const port = Number.parseInt(args.port, 10)
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  fail(`Invalid port: ${args.port}`)
}
if (!existsSync(serverEntry)) {
  fail(`Server build not found at ${serverEntry}. Run \`npm run build\` first.`)
}

if (args.json || args.sync) {
  const cli = await import(pathToFileURL(join(packageRoot, ".output", "server", "cli.mjs")))
  process.exit(await cli.runHeadless({ json: args.json }))
}

async function probeDashboard(host, candidate) {
  const controller = AbortSignal.timeout(500)
  try {
    const response = await fetch(`http://${formatHost(host)}:${candidate}/api/health`, {
      signal: controller,
    })
    return response.ok && response.headers.get(DASHBOARD_HEADER) === "1"
  } catch {
    return false
  }
}

function formatHost(host) {
  return host.includes(":") ? `[${host}]` : host
}

function portIsFree(host, candidate) {
  return new Promise(resolve => {
    const probe = createServer()
    probe.once("error", () => resolve(false))
    probe.listen(candidate, host, () => probe.close(() => resolve(true)))
  })
}

// Reuse a live dashboard on the requested port; otherwise walk to the
// next free port instead of touching the process that holds it.
async function resolvePort(host, requested) {
  for (let candidate = requested; candidate < requested + 50; candidate++) {
    if (await portIsFree(host, candidate)) return { port: candidate, reused: false }
    if (await probeDashboard(host, candidate)) return { port: candidate, reused: true }
  }
  fail(`No free port found near ${requested}`)
}

function openBrowser(url) {
  const command =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["powershell.exe", "-NoProfile", "-Command", `Start-Process "${url}"`]
        : ["xdg-open", url]
  try {
    spawn(command[0], command.slice(1), { stdio: "ignore", detached: true }).unref()
  } catch {
    // Browser opening is best-effort; the URL is already printed.
  }
}

const { port: actualPort, reused } = await resolvePort(args.host, port)
const url = `http://${formatHost(args.host)}:${actualPort}/`

if (reused) {
  console.log(`Dashboard already running at: ${url}`)
  if (args.open) openBrowser(url)
  process.exit(0)
}

const child = spawn(process.execPath, [serverEntry], {
  stdio: ["ignore", "inherit", "inherit"],
  env: { ...process.env, HOST: args.host, PORT: String(actualPort) },
})
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => child.kill(signal))
}
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)))

const deadline = Date.now() + 30_000
while (Date.now() < deadline) {
  if (await probeDashboard(args.host, actualPort)) break
  await new Promise(resolve => setTimeout(resolve, 150))
}

console.log(`Dashboard available at: ${url}`)
console.log("Press Ctrl+C to stop")
if (args.open) openBrowser(url)
