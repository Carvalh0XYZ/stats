import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import { PlusIcon, XIcon } from "lucide-react"

import type { AgentStatus, AgentSourceState } from "@/lib/api/types"
import {
  getJson,
  saveSettings,
  parseStatsSearch,
  type AppSettings,
} from "@/components/data/api"
import { formatCount, formatRelative } from "@/components/data/format"
import { usePoll } from "@/components/data/use-poll"
import { ErrorState, PageSkeleton, SectionHeader } from "@/components/states"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export const Route = createFileRoute("/settings")({
  validateSearch: parseStatsSearch,
  component: SettingsPage,
})

const STATE_META: Record<AgentSourceState, { label: string; dot: string }> = {
  ok: { label: "ok", dot: "bg-chart-4" },
  "sync-required": { label: "sync required", dot: "bg-chart-5" },
  error: { label: "error", dot: "bg-destructive" },
  "not-found": { label: "not found", dot: "bg-muted-foreground/40" },
}

// Agents that are not installed carry no signal; the section stays hidden.
const STATE_ORDER: AgentSourceState[] = ["ok", "sync-required", "error"]

function SettingsPage() {
  const poll = usePoll(async () => {
    const [agents, settings] = await Promise.all([
      getJson<AgentStatus[]>("/api/agents"),
      getJson<AppSettings>("/api/settings"),
    ])
    return { agents, settings }
  }, "settings")

  if (poll.error)
    return <ErrorState message={poll.error} onRetry={poll.refresh} />
  if (poll.loading || !poll.data) return <PageSkeleton />

  const { agents, settings } = poll.data

  return (
    <div className="flex flex-col">
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>

      <section className="mt-6">
        <SectionHeader
          title="Storage"
          description="Where telemetry-stats keeps its local database"
        />
        <dl className="flex flex-col gap-2 text-sm">
          <InfoRow label="Data directory" value={settings.dataDir} mono />
          <InfoRow label="Timezone" value={settings.timezone} />
          <InfoRow
            label="Price catalog"
            value={
              settings.pricing
                ? `fetched ${formatRelative(settings.pricing.fetchedAt)}`
                : "not fetched — costs stay unpriced until the catalog loads"
            }
          />
        </dl>
      </section>

      <section className="mt-10 border-t pt-8">
        <SettingsForm settings={settings} onSaved={poll.refresh} />
      </section>

      <section className="mt-10 border-t pt-8">
        <SectionHeader
          title="Sources"
          description="Per-agent collection status"
        />
        <div className="flex flex-col gap-6">
          {STATE_ORDER.map((state) => {
            const group = agents.filter((agent) => agent.state === state)
            if (group.length === 0) return null
            return (
              <section
                key={state}
                aria-label={`${STATE_META[state].label} sources`}
              >
                <h3 className="mb-1 flex items-center gap-2 text-sm font-medium">
                  <span
                    className={`size-1.5 rounded-full ${STATE_META[state].dot}`}
                    aria-hidden
                  />
                  {STATE_META[state].label}
                  <span className="font-mono text-xs font-normal text-muted-foreground tabular-nums">
                    {group.length}
                  </span>
                </h3>
                <ul className="flex flex-col">
                  {group.map((agent) => (
                    <li
                      key={agent.id}
                      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b py-2 text-sm last:border-b-0"
                    >
                      <span className="w-40 truncate font-medium">
                        {agent.label}
                      </span>
                      <span className="text-[13px] text-muted-foreground">
                        {agent.kind}
                      </span>
                      <span className="ms-auto font-mono text-[13px] tabular-nums">
                        {formatCount(agent.events)} events
                      </span>
                      {agent.warnings > 0 ? (
                        <span className="font-mono text-[13px] text-muted-foreground tabular-nums">
                          {formatCount(agent.warnings)} warnings
                        </span>
                      ) : null}
                      {agent.lastSyncedAt !== null ? (
                        <span className="font-mono text-[13px] text-muted-foreground tabular-nums">
                          synced {formatRelative(agent.lastSyncedAt)}
                        </span>
                      ) : null}
                      {agent.error ? (
                        <span className="w-full text-[13px] text-destructive">
                          {agent.error}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function SettingsForm({
  settings,
  onSaved,
}: {
  settings: AppSettings
  onSaved: () => void
}) {
  const [roots, setRoots] = React.useState(settings.extraRoots)
  const [newRoot, setNewRoot] = React.useState("")
  const [timezone, setTimezone] = React.useState(settings.timezone)
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string | null>(null)

  const timezones = React.useMemo(() => Intl.supportedValuesOf("timeZone"), [])
  const dirty =
    timezone !== settings.timezone ||
    roots.length !== settings.extraRoots.length ||
    roots.some((root, index) => root !== settings.extraRoots[index])

  const addRoot = () => {
    const trimmed = newRoot.trim()
    if (trimmed.length === 0 || roots.includes(trimmed)) return
    setRoots([...roots, trimmed])
    setNewRoot("")
  }

  const save = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await saveSettings({ extraRoots: roots, timezone })
      onSaved()
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <SectionHeader
        title="Collection"
        description="Extra directories to scan for agent logs, and the timezone used for daily totals"
      />
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label htmlFor="new-root" className="text-sm font-medium">
            Extra roots
          </label>
          {roots.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No extra roots configured
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {roots.map((root) => (
                <li key={root} className="flex items-center gap-2 text-sm">
                  <code className="truncate rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[13px]">
                    {root}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${root}`}
                    className="min-h-11 min-w-11 md:min-h-7 md:min-w-7"
                    onClick={() => setRoots(roots.filter((it) => it !== root))}
                  >
                    <XIcon aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Input
              id="new-root"
              value={newRoot}
              onChange={(event) => setNewRoot(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  addRoot()
                }
              }}
              placeholder="/path/to/agent/logs"
              className="max-w-md font-mono text-[13px]"
            />
            <Button
              variant="outline"
              onClick={addRoot}
              className="min-h-11 md:min-h-8"
            >
              <PlusIcon aria-hidden />
              Add
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="timezone" className="text-sm font-medium">
            Timezone
          </label>
          <Select
            value={timezone}
            onValueChange={(value) => {
              if (typeof value === "string") setTimezone(value)
            }}
          >
            <SelectTrigger id="timezone" className="w-72 max-w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {timezones.map((zone) => (
                <SelectItem key={zone} value={zone}>
                  {zone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {saveError ? (
          <p className="text-sm text-destructive">{saveError}</p>
        ) : null}
        <div>
          <Button
            onClick={() => void save()}
            disabled={!dirty || saving}
            className="min-h-11 md:min-h-8"
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  )
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <dt className="w-32 shrink-0 text-[13px] text-muted-foreground">
        {label}
      </dt>
      <dd className={mono ? "font-mono text-[13px] break-all" : undefined}>
        {value}
      </dd>
    </div>
  )
}
