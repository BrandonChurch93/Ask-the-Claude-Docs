import type { ServerEvent } from "./types";

/**
 * Incremental SSE decoder for the /api/ask stream (the ENG-08 client half). Feed
 * it raw text chunks from the fetch body reader in any split; it buffers partial
 * frames and returns whole `ServerEvent`s as each completes. Pure and
 * transport-agnostic, so the encoder/parser round-trip is unit-testable (ENG §8).
 */
export class SSEDecoder {
  private buffer = "";

  /** Consume a chunk of raw stream text; return any events it completes. */
  decode(chunk: string): ServerEvent[] {
    this.buffer += chunk;
    const events: ServerEvent[] = [];
    let boundary: number;
    while ((boundary = this.buffer.indexOf("\n\n")) !== -1) {
      const frame = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      const event = parseFrame(frame);
      if (event) events.push(event);
    }
    return events;
  }
}

/** Extract the `data:` line of one SSE frame and parse it as a `ServerEvent`. */
function parseFrame(frame: string): ServerEvent | null {
  const dataLine = frame.split("\n").find((line) => line.startsWith("data:"));
  if (!dataLine) return null;
  const json = dataLine.slice("data:".length).trim();
  if (!json) return null;
  return JSON.parse(json) as ServerEvent;
}
