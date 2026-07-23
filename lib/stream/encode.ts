import type { ServerEvent } from "./types";

/**
 * Encode one server event as an SSE frame. The event's `type` field is the
 * discriminant the client parser switches on, so a separate SSE `event:` line is
 * unnecessary. One frame per call; the route enqueues each frame the instant its
 * event is produced, with no accumulate-then-flush (PERF-08).
 */
export function encodeEvent(event: ServerEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
