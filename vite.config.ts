import { defineConfig } from "vitest/config"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { nitro } from "nitro/vite"

// Vitest runs plain node tests; the app plugins drag React/router into the
// test runtime and hang the runner, so only load them outside vitest.
const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: process.env.VITEST
    ? []
    : [devtools(), tailwindcss(), tanstackStart(), viteReact(), nitro()],
  test: { environment: "node" },
})

export default config
