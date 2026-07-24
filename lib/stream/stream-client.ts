import type { ServerEvent } from "./types";
import { SSEDecoder } from "./parse";
import { STREAM_INTERRUPTED } from "./messages";

/**
 * The client half of the SSE contract (ENG-08): read the `/api/ask` body, decode
 * whole `ServerEvent`s (PERF-08, no client buffering beyond frame assembly), and
 * dispatch each to the turn reducer. The one piece of policy here is interruption
 * handling (PERF-09): if the stream ends - cleanly or by network error - without
 * a terminal `done`/`error`, synthesize an `error` so the turn preserves its
 * partial text and offers retry. Transport-agnostic (takes a ReadableStream), so
 * the dev harness can replay a recorded transcript through the identical path.
 */

/** True once a terminal event has been seen; nothing more will be dispatched after. */
function isTerminal(event: ServerEvent): boolean {
  return event.type === "done" || event.type === "error";
}

export async function consumeStream(
  body: ReadableStream<Uint8Array>,
  dispatch: (event: ServerEvent) => void,
): Promise<void> {
  const decoder = new SSEDecoder();
  const textDecoder = new TextDecoder();
  const reader = body.getReader();
  let terminated = false;

  const interrupt = () => {
    if (terminated) return;
    terminated = true;
    dispatch({ type: "error", message: STREAM_INTERRUPTED, retryable: true });
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const event of decoder.decode(
        textDecoder.decode(value, { stream: true }),
      )) {
        if (isTerminal(event)) terminated = true;
        dispatch(event);
        if (terminated) return; // a server error/done is the last word
      }
    }
  } catch {
    // Network error mid-stream: preserve partial text, offer retry (PERF-09).
    interrupt();
    return;
  }
  // Body closed with no terminal event: also an interruption (PERF-09).
  interrupt();
}
