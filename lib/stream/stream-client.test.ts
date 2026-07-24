import { describe, it, expect } from "vitest";
import { consumeStream } from "./stream-client";
import { encodeEvent } from "./encode";
import { STREAM_INTERRUPTED } from "./messages";
import type { ServerEvent } from "./types";

/** A ReadableStream that emits the given raw string chunks, then closes. */
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(enc.encode(chunks[i++]!));
      else controller.close();
    },
  });
}

const sources: ServerEvent = {
  type: "sources",
  sources: [],
  nearMisses: [],
  receipt: {
    model: "claude-haiku-4-5",
    calibrated: true,
    threshold: 0.35,
    refused: false,
    retrieval: { embedMs: 1, queryMs: 2 },
    corpusChunks: 3214,
  },
};

describe("consumeStream (ENG-08, PERF-09)", () => {
  it("dispatches whole events across arbitrary chunk splits", async () => {
    const wire =
      encodeEvent(sources) + encodeEvent({ type: "text", delta: "hi" });
    // Split the wire mid-frame to exercise the incremental decoder.
    const mid = Math.floor(wire.length / 2);
    const got: ServerEvent[] = [];
    await consumeStream(streamOf([wire.slice(0, mid), wire.slice(mid)]), (e) =>
      got.push(e),
    );
    expect(got.map((e) => e.type)).toEqual(["sources", "text", "error"]);
    // No terminal event in the transcript -> synthesized interruption.
    const last = got.at(-1)!;
    expect(last.type === "error" && last.message).toBe(STREAM_INTERRUPTED);
  });

  it("a stream ending after text but before done is an interruption (PERF-09)", async () => {
    const wire =
      encodeEvent(sources) +
      encodeEvent({ type: "text", delta: "partial answer" });
    const got: ServerEvent[] = [];
    await consumeStream(streamOf([wire]), (e) => got.push(e));
    expect(got.map((e) => e.type)).toEqual(["sources", "text", "error"]);
    const err = got.at(-1)!;
    expect(err.type === "error" && err.retryable).toBe(true);
  });

  it("does not synthesize an interruption when done arrives", async () => {
    const done: ServerEvent = {
      type: "done",
      receipt: {
        ...(sources.type === "sources" ? sources.receipt : ({} as never)),
        timings: {
          embedMs: 1,
          queryMs: 2,
          retrievalMs: 3,
          ttftMs: 4,
          generationMs: 5,
          totalMs: 9,
        },
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
        },
        costUsd: 0.0001,
      },
    };
    const wire =
      encodeEvent(sources) +
      encodeEvent({ type: "text", delta: "x" }) +
      encodeEvent(done);
    const got: ServerEvent[] = [];
    await consumeStream(streamOf([wire]), (e) => got.push(e));
    expect(got.map((e) => e.type)).toEqual(["sources", "text", "done"]);
  });

  it("stops dispatching after a terminal server error", async () => {
    const wire =
      encodeEvent(sources) +
      encodeEvent({ type: "error", message: "boom", retryable: true }) +
      encodeEvent({ type: "text", delta: "should not arrive" });
    const got: ServerEvent[] = [];
    await consumeStream(streamOf([wire]), (e) => got.push(e));
    expect(got.map((e) => e.type)).toEqual(["sources", "error"]);
  });
});
