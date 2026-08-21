import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import { join } from "node:path"

/** Stable event id from identifying parts (agent, path, record identity). */
export function eventId(...parts: (string | number)[]): string {
  return createHash("sha256")
    .update(parts.join("\u0000"))
    .digest("hex")
    .slice(0, 32)
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>()

/** YYYY-MM-DD of a timestamp in the pinned IANA timezone. */
export function localDateOf(timestamp: number, timezone: string): string {
  let formatter = dateFormatters.get(timezone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    dateFormatters.set(timezone, formatter)
  }
  return formatter.format(timestamp)
}

export interface JsonlLine {
  value: unknown
  /** Byte offset of the end of this line (start of the next). */
  end: number
}

export interface JsonlResult {
  lines: JsonlLine[]
  /** Byte offset after the last complete line; resume point for the next sync. */
  cursor: number
  malformed: number
}

/**
 * Read a JSONL file from a byte offset. Malformed lines are counted and
 * skipped; a trailing line without a newline is left for the next sync.
 */
export async function readJsonl(
  path: string,
  resumeOffset = 0
): Promise<JsonlResult> {
  let baseOffset = 0
  let buffer: Buffer
  if (resumeOffset > 0) {
    const handle = await fs.open(path, "r")
    try {
      const { size } = await handle.stat()
      baseOffset = Math.min(resumeOffset, size)
      const length = size - baseOffset
      buffer = Buffer.allocUnsafe(length)
      let read = 0
      while (read < length) {
        const { bytesRead } = await handle.read(
          buffer,
          read,
          length - read,
          baseOffset + read
        )
        if (bytesRead === 0) break
        read += bytesRead
      }
      buffer = buffer.subarray(0, read)
    } finally {
      await handle.close()
    }
  } else {
    buffer = await fs.readFile(path)
  }
  const lines: JsonlLine[] = []
  let malformed = 0
  let start = 0
  let cursor = baseOffset
  while (start < buffer.length) {
    const newline = buffer.indexOf(0x0a, start)
    if (newline === -1) break
    const end = newline + 1
    const text = buffer.toString("utf8", start, newline).trim()
    if (text) {
      try {
        lines.push({ value: JSON.parse(text), end: baseOffset + end })
      } catch {
        malformed++
      }
    }
    start = end
    cursor = baseOffset + end
  }
  return { lines, cursor, malformed }
}

/** Parse a whole-file JSON document, or return undefined when malformed. */
export async function readJsonFile(path: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"))
  } catch {
    return undefined
  }
}

/** Recursively list files under root whose name passes the filter. */
export async function walkFiles(
  root: string,
  filter: (name: string) => boolean
): Promise<string[]> {
  const found: string[] = []
  let entries
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      found.push(...(await walkFiles(path, filter)))
    } else if (entry.isFile() && filter(entry.name)) {
      found.push(path)
    }
  }
  return found
}

/** Coerce a token count that may be absent, a string, or fractional. */
export function tokenCount(value: unknown): number {
  const n =
    typeof value === "string"
      ? Number(value)
      : typeof value === "number"
        ? value
        : 0
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}

/** Parse a timestamp that may be ISO text, epoch seconds, or epoch millis. */
export function timestampOf(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? value : value > 1e9 ? value * 1000 : null
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return timestampOf(numeric)
  }
  return null
}
