import { describe, it, expect } from "vitest";
import { turnReducer, initialTurnState, type TurnState } from "./reducer";
import type {
  SourcesEvent,
  DoneEvent,
  Receipt,
  ReceiptSkeleton,
} from "./types";

const skeleton = (refused: boolean): ReceiptSkeleton => ({
  model: "claude-haiku-4-5",
  calibrated: true,
  threshold: 0.35,
  refused,
  retrieval: { embedMs: 12, queryMs: 41 },
  corpusChunks: 3214,
});

const receipt = (refused: boolean): Receipt => ({
  ...skeleton(refused),
  timings: {
    embedMs: 12,
    queryMs: 41,
    retrievalMs: 60,
    ttftMs: refused ? null : 80,
    generationMs: refused ? 0 : 120,
    totalMs: refused ? 60 : 200,
  },
  usage: refused
    ? null
    : {
        inputTokens: 100,
        outputTokens: 20,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      },
  costUsd: refused ? 0 : 0.0002,
});

const sourcesEvent = (refused: boolean): SourcesEvent => ({
  type: "sources",
  sources: refused
    ? []
    : [
        {
          chunkId: "a",
          breadcrumb: "bc a",
          url: "u",
          similarity: 0.7,
          snippet: "s",
        },
      ],
  nearMisses: refused
    ? [
        {
          chunkId: "x",
          breadcrumb: "bc x",
          url: "u",
          similarity: 0.1,
          snippet: "s",
        },
      ]
    : [],
  receipt: skeleton(refused),
});

/** Advance the choreography to completion (stages.length + 1 reveals). */
function revealAll(s: TurnState): TurnState {
  let guard = 0;
  while (s.status === "retrieving" && guard++ < 20)
    s = turnReducer(s, { type: "choreoReveal" });
  return s;
}

describe("turnReducer (ENG-16, UX-06)", () => {
  it("submit takes idle -> retrieving with an empty choreography buffer", () => {
    expect(turnReducer(initialTurnState, { type: "submit" })).toEqual({
      status: "retrieving",
      choreo: null,
      buffer: "",
      pending: null,
    });
  });

  it("sources builds the choreography but does not stream yet (§5)", () => {
    let s: TurnState = turnReducer(initialTurnState, { type: "submit" });
    s = turnReducer(s, sourcesEvent(false));
    expect(s.status).toBe("retrieving");
    // embedded + searched + 1 source + threshold + 0 excluded = 4 stages.
    expect(s.status === "retrieving" && s.choreo?.stages.length).toBe(4);
    expect(s.status === "retrieving" && s.choreo?.revealed).toBe(0);
  });

  it("choreoReveal advances stages, then leaves retrieving for streaming", () => {
    let s: TurnState = turnReducer(initialTurnState, { type: "submit" });
    s = turnReducer(s, sourcesEvent(false));
    s = turnReducer(s, { type: "choreoReveal" });
    expect(s.status === "retrieving" && s.choreo?.revealed).toBe(1);
    s = revealAll(s);
    expect(s.status).toBe("streaming");
  });

  it("text during the choreography is buffered, then flushes into the stream", () => {
    let s: TurnState = turnReducer(initialTurnState, { type: "submit" });
    s = turnReducer(s, sourcesEvent(false));
    s = turnReducer(s, { type: "text", delta: "Held " });
    expect(s.status === "retrieving" && s.buffer).toBe("Held ");
    s = revealAll(s);
    expect(s.status === "streaming" && s.text).toBe("Held ");
    s = turnReducer(s, { type: "text", delta: "then live" });
    expect(s.status === "streaming" && s.text).toBe("Held then live");
  });

  it("answer path: submit -> sources -> stream -> settled, accumulating text", () => {
    let s: TurnState = turnReducer(initialTurnState, { type: "submit" });
    s = revealAll(turnReducer(s, sourcesEvent(false)));
    s = turnReducer(s, { type: "text", delta: "Hello " });
    s = turnReducer(s, { type: "text", delta: "world" });
    const done: DoneEvent = { type: "done", receipt: receipt(false) };
    s = turnReducer(s, done);
    expect(s.status).toBe("settled");
    expect(s.status === "settled" && s.text).toBe("Hello world");
    expect(s.status === "settled" && s.receipt.costUsd).toBe(0.0002);
  });

  it("a done that arrives during the choreography is held, then settles on completion", () => {
    let s: TurnState = turnReducer(initialTurnState, { type: "submit" });
    s = turnReducer(s, sourcesEvent(false));
    s = turnReducer(s, { type: "text", delta: "buffered answer" });
    s = turnReducer(s, { type: "done", receipt: receipt(false) });
    expect(s.status).toBe("retrieving"); // not settled until the choreography ends
    expect(s.status === "retrieving" && s.pending).not.toBeNull();
    s = revealAll(s);
    expect(s.status).toBe("settled");
    expect(s.status === "settled" && s.text).toBe("buffered answer");
  });

  it("refusal path: choreography plays, then refused with near-misses (RAG-13)", () => {
    let s: TurnState = turnReducer(initialTurnState, { type: "submit" });
    s = turnReducer(s, sourcesEvent(true));
    s = turnReducer(s, { type: "done", receipt: receipt(true) });
    s = revealAll(s);
    expect(s.status).toBe("refused");
    expect(s.status === "refused" && s.receipt.usage).toBeNull();
    expect(s.status === "refused" && s.nearMisses.length).toBe(1);
  });

  it("error mid-choreography -> errored, preserving the buffered text (PERF-09)", () => {
    let s: TurnState = turnReducer(initialTurnState, { type: "submit" });
    s = turnReducer(s, sourcesEvent(false));
    s = turnReducer(s, { type: "text", delta: "partial" });
    s = turnReducer(s, { type: "error", message: "boom", retryable: true });
    expect(s.status).toBe("errored");
    expect(s.status === "errored" && s.text).toBe("partial");
    expect(s.status === "errored" && s.retryable).toBe(true);
  });

  it("error mid-stream -> errored, preserving streamed text (PERF-09)", () => {
    let s: TurnState = turnReducer(initialTurnState, { type: "submit" });
    s = revealAll(turnReducer(s, sourcesEvent(false)));
    s = turnReducer(s, { type: "text", delta: "streamed" });
    s = turnReducer(s, { type: "error", message: "boom", retryable: false });
    expect(s.status === "errored" && s.text).toBe("streamed");
  });
});
