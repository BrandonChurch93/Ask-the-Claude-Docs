/**
 * Terminal-failure copy (ui-ux-spec §8, UX-10), defined once and shared by the
 * server error events and the client's stream-interruption path so the two can
 * never drift. No alarm styling is implied here; these are the exact strings the
 * error states render.
 */

/** `done` never arrives: partial text is preserved, retry offered (PERF-09). */
export const STREAM_INTERRUPTED =
  "The answer was interrupted. What streamed is above; nothing after it was lost, because nothing after it arrived.";

/** A non-stream failure reaching the model; the question was not charged. */
export const REQUEST_FAILED =
  "Something went wrong reaching the model. Your question wasn't charged. Try again.";

/** Per-IP rate limit (429, middleware). Not retryable; it resets on its own. */
export const RATE_LIMITED =
  "You've hit the request limit for now. It resets within a minute; the daily limit resets at midnight UTC.";

/** Global daily spend cap reached (429, route). Not retryable until reset. */
export const SPEND_CAP =
  "This demo caps its own spending for the day. It resets at midnight UTC. The eval scores and source links still work while it rests.";
