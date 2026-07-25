"use client";

import { useEffect, useState } from "react";
import { formatRelativeTime } from "../../lib/time";

/**
 * Freshness ("synced Nh ago") computed on the client from the absolute
 * server-provided `syncedAt` timestamp. The routes are static (PERF-02) with
 * revalidate=900, so a relative string baked at render time would freeze between
 * revalidations; the absolute timestamp is cache-safe and the relative is derived
 * against the live clock here. The render-time seed is corrected on the next frame
 * (so a cache-stale value does not linger) and refreshed each minute after. Callers
 * render the value under `suppressHydrationWarning`, since the cached seed
 * legitimately diverges from the live client value.
 */
export function useRelativeTime(syncedAt: number | null): string {
  const [rel, setRel] = useState(() =>
    syncedAt == null
      ? "not yet synced"
      : formatRelativeTime(new Date(syncedAt)),
  );
  useEffect(() => {
    const compute = () =>
      syncedAt == null
        ? "not yet synced"
        : formatRelativeTime(new Date(syncedAt));
    // rAF defers the correction out of the synchronous effect body (react-hooks),
    // flushing the live value on the next frame.
    const frame = requestAnimationFrame(() => setRel(compute()));
    const id = setInterval(() => setRel(compute()), 60_000);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(id);
    };
  }, [syncedAt]);
  return rel;
}
