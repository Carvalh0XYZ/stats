import * as React from "react"
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react"

import type { BreakdownRow } from "@/lib/api/types"
import {
  formatCost,
  formatCount,
  formatRelative,
  formatShare,
  formatTokens,
} from "@/components/data/format"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type SortKey = "label" | "tokens" | "cost" | "sessions" | "last"

const SORT_VALUE: Record<SortKey, (row: BreakdownRow) => number | string> = {
  label: (row) => row.label.toLowerCase(),
  tokens: (row) => row.tokens.total,
  cost: (row) => row.pricedCostUsd,
  sessions: (row) => row.sessions,
  last: (row) => row.lastTimestamp,
}

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "label", label: "Name" },
  { key: "tokens", label: "Tokens", numeric: true },
  { key: "cost", label: "Cost", numeric: true },
  { key: "sessions", label: "Sessions", numeric: true },
  { key: "last", label: "Last active", numeric: true },
]

export function BreakdownTable({
  rows,
  nameLabel,
}: {
  rows: BreakdownRow[]
  nameLabel: string
}) {
  const [sortKey, setSortKey] = React.useState<SortKey>("tokens")
  const [descending, setDescending] = React.useState(true)

  const sorted = React.useMemo(() => {
    const value = SORT_VALUE[sortKey]
    const next = [...rows].sort((a, b) => {
      const va = value(a)
      const vb = value(b)
      const order = va < vb ? -1 : va > vb ? 1 : 0
      return descending ? -order : order
    })
    return next
  }, [rows, sortKey, descending])

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setDescending(!descending)
    } else {
      setSortKey(key)
      setDescending(key !== "label")
    }
  }

  return (
    <>
      {/* Desktop: semantic sortable table */}
      <div className="-mx-4 -my-2 overflow-x-auto whitespace-nowrap max-md:hidden md:-mx-6">
        <div className="inline-block min-w-full px-4 py-2 align-middle md:px-6">
          <Table>
            <TableHeader>
              <TableRow>
                {COLUMNS.map((column) => (
                  <TableHead
                    key={column.key}
                    aria-sort={
                      sortKey === column.key
                        ? descending
                          ? "descending"
                          : "ascending"
                        : "none"
                    }
                    className={
                      column.numeric
                        ? "text-right whitespace-nowrap"
                        : "whitespace-nowrap"
                    }
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className="inline-flex min-h-8 items-center gap-1 rounded-sm font-medium hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {column.key === "label" ? nameLabel : column.label}
                      {sortKey === column.key ? (
                        descending ? (
                          <ArrowDownIcon className="size-3.5" aria-hidden />
                        ) : (
                          <ArrowUpIcon className="size-3.5" aria-hidden />
                        )
                      ) : null}
                    </button>
                  </TableHead>
                ))}
                <TableHead className="whitespace-nowrap">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="max-w-64">
                    <span className="block truncate font-medium">
                      {row.label}
                      {row.hasEstimatedTokens ? (
                        <span
                          className="font-normal text-muted-foreground"
                          title="Includes estimated tokens"
                        >
                          {" "}
                          est.
                        </span>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-[13px] tabular-nums">
                    <TokensCell row={row} />
                  </TableCell>
                  <TableCell className="text-right font-mono text-[13px] tabular-nums">
                    <CostCell row={row} />
                  </TableCell>
                  <TableCell className="text-right font-mono text-[13px] tabular-nums">
                    {formatCount(row.sessions)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[13px] text-muted-foreground tabular-nums">
                    <span title={new Date(row.firstTimestamp).toLocaleString()}>
                      {formatRelative(row.lastTimestamp)}
                    </span>
                  </TableCell>
                  <TableCell className="w-32">
                    <ShareBar share={row.tokenShare} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Mobile: stacked info-complete rows */}
      <ul className="flex flex-col md:hidden">
        {sorted.map((row) => (
          <li key={row.key} className="border-b py-3 last:border-b-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-medium">{row.label}</span>
              {row.hasEstimatedTokens ? (
                <span className="text-xs text-muted-foreground">est.</span>
              ) : null}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <MobileStat label="Tokens" value={<TokensCell row={row} />} />
              <MobileStat label="Cost" value={<CostCell row={row} />} />
              <MobileStat label="Sessions" value={formatCount(row.sessions)} />
              <MobileStat
                label="Last active"
                value={formatRelative(row.lastTimestamp)}
              />
              <MobileStat
                label="First active"
                value={formatRelative(row.firstTimestamp)}
              />
              <MobileStat label="Share" value={formatShare(row.tokenShare)} />
            </dl>
            <ShareBar share={row.tokenShare} className="mt-3" />
          </li>
        ))}
      </ul>
    </>
  )
}

function TokensCell({ row }: { row: BreakdownRow }) {
  const detail = `in ${formatTokens(row.tokens.input)} · out ${formatTokens(row.tokens.output)} · cache ${formatTokens(row.tokens.cacheRead + row.tokens.cacheWrite)}`
  return <span title={detail}>{formatTokens(row.tokens.total)}</span>
}

function CostCell({ row }: { row: BreakdownRow }) {
  if (row.pricedCostUsd === 0 && row.unpricedEventCount === row.events) {
    return <span className="text-muted-foreground">unpriced</span>
  }
  return (
    <span>
      {formatCost(row.pricedCostUsd)}
      {row.unpricedEventCount > 0 ? (
        <span className="text-muted-foreground">
          {" "}
          +{formatCount(row.unpricedEventCount)} unpriced
        </span>
      ) : null}
    </span>
  )
}

function ShareBar({ share, className }: { share: number; className?: string }) {
  return (
    <div
      className={`h-1 w-full overflow-hidden rounded-full bg-muted ${className ?? ""}`}
      role="img"
      aria-label={`${formatShare(share)} of tokens`}
    >
      <div
        className="h-full rounded-full bg-chart-1"
        style={{ width: `${Math.max(share * 100, 1)}%` }}
      />
    </div>
  )
}

function MobileStat({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="font-mono text-[13px] tabular-nums">{value}</dd>
    </div>
  )
}
