/**
 * Relative-time formatting for the sync eyebrow ("synced {x} ago", ui-ux-spec §3).
 * Pure and now-injectable so it is unit-testable and never depends on wall-clock
 * at import. Coarse buckets (the corpus syncs daily); no seconds precision.
 */
export function formatRelativeTime(from: Date, now: Date = new Date()): string {
  const ms = now.getTime() - from.getTime();
  if (ms < 0) return "just now";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}
