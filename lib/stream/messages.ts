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
