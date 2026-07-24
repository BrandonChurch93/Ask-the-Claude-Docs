import { describe, it, expect } from "vitest";
import { encodeEvent } from "./encode";
import { SSEDecoder } from "./parse";
import type { ServerEvent } from "./types";

const events: ServerEvent[] = [
  {
    type: "sources",
    sources: [
      {
        chunkId: "a",
        breadcrumb: "bc a",
        url: "https://x/a#a",
        similarity: 0.7,
        snippet: "sa",
      },
    ],
    nearMisses: [],
    receipt: {
      model: "claude-haiku-4-5",
      calibrated: false,
      threshold: null,
      refused: false,
      retrieval: { embedMs: 1, queryMs: 2 },
      corpusChunks: 3214,
    },
  },
  { type: "text", delta: "Hello " },
  { type: "text", delta: "world" },
  {
    type: "done",
    receipt: {
      model: "claude-haiku-4-5",
      calibrated: false,
      threshold: null,
      refused: false,
      retrieval: { embedMs: 1, queryMs: 2 },
      corpusChunks: 3214,
      timings: {
        embedMs: 1,
        queryMs: 2,
        retrievalMs: 3,
        ttftMs: 4,
        generationMs: 5,
        totalMs: 9,
      },
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      },
      costUsd: 0.0002,
    },
  },
];

describe("encode/parse round-trip (ENG §8)", () => {
  it("recovers the exact events when fed the whole stream at once", () => {
    const wire = events.map(encodeEvent).join("");
    const decoded = new SSEDecoder().decode(wire);
    expect(decoded).toEqual(events);
  });

  it("recovers events when the stream is split at arbitrary byte boundaries", () => {
    const wire = events.map(encodeEvent).join("");
    const decoder = new SSEDecoder();
    const out: ServerEvent[] = [];
    // Feed one character at a time: partial frames must buffer, not misparse.
    for (const ch of wire) out.push(...decoder.decode(ch));
    expect(out).toEqual(events);
  });

  it("emits nothing for an incomplete trailing frame", () => {
    const decoder = new SSEDecoder();
    expect(decoder.decode("data: {")).toEqual([]);
  });
});
