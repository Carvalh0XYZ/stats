import * as React from "react"
import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import {
  ActivityIcon,
  BotIcon,
  BoxesIcon,
  CheckIcon,
  ChevronDownIcon,
  FolderIcon,
  LayoutDashboardIcon,
  ListIcon,
  Loader2Icon,
  MoonIcon,
  RefreshCwIcon,
  SettingsIcon,
  SunIcon,
} from "lucide-react"

import { AGENTS, AGENT_IDS, type AgentId } from "@/lib/agents/registry"
import type { StatsFilter, SyncStatus, TimeRange } from "@/lib/api/types"
import { TIME_RANGES } from "@/lib/api/types"
import { getJson } from "@/components/data/api"
import { usePoll } from "@/components/data/use-poll"
import { formatRelative } from "@/components/data/format"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboardIcon },
  { to: "/activity", label: "Activity", icon: ActivityIcon },
  { to: "/agents", label: "Agents", icon: BotIcon },
  { to: "/models", label: "Models", icon: BoxesIcon },
  { to: "/projects", label: "Projects", icon: FolderIcon },
  { to: "/sessions", label: "Sessions", icon: ListIcon },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const

const RANGE_LABELS: Record<TimeRange, string> = {
  "24h": "24h",
  "7d": "7d",
  "30d": "30d",
  "90d": "90d",
  year: "Year",
  all: "All",
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <div className="flex-1 overflow-x-hidden p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}

function AppSidebar() {
  const search = useSearch({ strict: false }) as Partial<StatsFilter>
  const filter: StatsFilter = {
    range: search.range ?? "30d",
    agents: search.agents,
    from: search.from,
    to: search.to,
  }
  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <ActivityIcon className="size-5" aria-hidden />
          <span className="text-sm font-semibold">Telemetry Stats</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    className="min-h-11 md:min-h-8"
                    render={
                      <Link
                        to={item.to}
                        search={
                          item.to === "/sessions"
                            ? { ...filter, page: 1, pageSize: 25 }
                            : filter
                        }
                        activeProps={{ "data-active": true }}
                        activeOptions={{ exact: item.to === "/" }}
                      >
                        <item.icon aria-hidden />
                        <span>{item.label}</span>
                      </Link>
                    }
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}

function AppHeader() {
  const search = useSearch({ strict: false }) as Partial<StatsFilter>
  const navigate = useNavigate()
  const range = search.range ?? "30d"
  const agents = search.agents ?? []

  const setRange = (next: TimeRange) => {
    void navigate({
      to: ".",
      // Explicit range clears any from/to override.
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        range: next,
        from: undefined,
        to: undefined,
      }),
    })
  }

  const setAgents = (next: AgentId[]) => {
    void navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        agents: next.length > 0 ? next : undefined,
      }),
    })
  }

  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur">
      <SidebarTrigger className="min-h-11 min-w-11 md:min-h-8 md:min-w-8" />
      <Separator orientation="vertical" className="hidden h-6 md:block" />
      <ToggleGroup
        value={[range]}
        onValueChange={(value: unknown[]) => {
          const next = value[0]
          if (typeof next === "string") setRange(next as TimeRange)
        }}
        variant="outline"
        spacing={0}
        aria-label="Date range"
      >
        {TIME_RANGES.map((value) => (
          <ToggleGroupItem
            key={value}
            value={value}
            className="min-h-11 md:min-h-8"
            aria-label={`Last ${RANGE_LABELS[value]}`}
          >
            {RANGE_LABELS[value]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <AgentFilter selected={agents} onChange={setAgents} />
      <div className="ms-auto flex items-center gap-2">
        <SyncControl />
        <ThemeToggle />
      </div>
    </header>
  )
}

function AgentFilter({
  selected,
  onChange,
}: {
  selected: AgentId[]
  onChange: (agents: AgentId[]) => void
}) {
  const [query, setQuery] = React.useState("")
  const visible = AGENT_IDS.filter((id) =>
    AGENTS[id].label.toLowerCase().includes(query.toLowerCase())
  )

  const toggle = (id: AgentId) => {
    onChange(
      selected.includes(id) ? selected.filter((it) => it !== id) : [...selected, id]
    )
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" className="min-h-11 md:min-h-8">
            Agents
            {selected.length > 0 ? (
              <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">
                {selected.length}
              </span>
            ) : null}
            <ChevronDownIcon aria-hidden />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-64 p-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter agents…"
          aria-label="Filter agents"
          className="mb-2"
        />
        <div className="max-h-72 overflow-y-auto" role="listbox" aria-multiselectable="true">
          {visible.map((id) => {
            const active = selected.includes(id)
            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => toggle(id)}
                className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring md:min-h-8"
              >
                <CheckIcon
                  className={active ? "size-4" : "size-4 opacity-0"}
                  aria-hidden
                />
                <span className="truncate">{AGENTS[id].label}</span>
              </button>
            )
          })}
          {visible.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">No agents match</p>
          ) : null}
        </div>
        {selected.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 w-full"
            onClick={() => onChange([])}
          >
            Clear selection
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function SyncControl() {
  const poll = usePoll(() => getJson<SyncStatus>("/api/sync"), "sync", 5_000)
  const [starting, setStarting] = React.useState(false)
  const running = starting || (poll.data?.running ?? false)
  const finishedAt = poll.data?.lastRun?.finishedAt ?? null

  const start = async () => {
    setStarting(true)
    try {
      await getJson<SyncStatus>("/api/sync", { method: "POST" })
      poll.refresh()
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {finishedAt !== null ? (
        <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline">
          Updated {formatRelative(finishedAt)}
        </span>
      ) : null}
      <Button
        variant="outline"
        onClick={() => void start()}
        disabled={running}
        className="min-h-11 md:min-h-8"
      >
        {running ? (
          <Loader2Icon className="animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <RefreshCwIcon aria-hidden />
        )}
        {running ? "Syncing…" : "Sync"}
      </Button>
    </div>
  )
}

function ThemeToggle() {
  const toggle = () => {
    const dark = document.documentElement.classList.toggle("dark")
    localStorage.setItem("theme", dark ? "dark" : "light")
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label="Toggle dark mode"
      className="min-h-11 min-w-11 md:min-h-8 md:min-w-8"
    >
      <SunIcon className="dark:hidden" aria-hidden />
      <MoonIcon className="hidden dark:block" aria-hidden />
    </Button>
  )
}
