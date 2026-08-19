import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router"

import { AppShell } from "@/components/app-shell"
import appCss from "../styles.css?url"

// Applies the persisted theme before first paint to avoid a flash.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");var d=t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}})()`

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Telemetry Stats",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  notFoundComponent: () => (
    <main className="container mx-auto p-4 pt-16">
      <h1>404</h1>
      <p>The requested page could not be found.</p>
    </main>
  ),
  component: RootComponent,
  shellComponent: RootDocument,
})

function RootComponent() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
