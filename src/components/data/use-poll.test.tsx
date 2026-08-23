// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { usePoll } from "@/components/data/use-poll"

describe("usePoll", () => {
  it("hides data from the old key while the new key loads", async () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) =>
        usePoll(() => Promise.resolve(key), key, 60_000),
      { initialProps: { key: "first" } }
    )

    await waitFor(() => expect(result.current.data).toBe("first"))

    rerender({ key: "second" })

    expect(result.current.data).toBeNull()
    await waitFor(() => expect(result.current.data).toBe("second"))
  })

  it("hides an old key's error while the new key loads", async () => {
    const pending = new Promise<string>(() => {})
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) =>
        usePoll(
          () =>
            key === "first"
              ? Promise.reject(new Error("first failed"))
              : pending,
          key,
          60_000
        ),
      { initialProps: { key: "first" } }
    )

    await waitFor(() => expect(result.current.error).toBe("first failed"))

    rerender({ key: "second" })

    expect(result.current.error).toBeNull()
    expect(result.current.data).toBeNull()
  })
})
