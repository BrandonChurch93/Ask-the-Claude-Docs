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
});

const receipt = (refused: boolean): Receipt => ({
  ...skeleton(refused),
  timings: {
    embedMs: 1,
    queryMs: 2,
    retrievalMs: 3,
    generationMs: 4,
    totalMs: 7,
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
          breadcrumb: "bc",
          url: "u",
          similarity: 0.7,
          snippet: "s",
        },
      ],
  nearMisses: refused
    ? [
        {
          chunkId: "x",
          breadcrumb: "bc",
          url: "u",
          similarity: 0.1,
          snippet: "s",
        },
      ]
    : [],
  receipt: skeleton(refused),
});

describe("turnReducer (ENG-16)", () => {
  it("submit takes idle -> retrieving", () => {
    expect(turnReducer(initialTurnState, { type: "submit" })).toEqual({
      status: "retrieving",
    });
  });

  it("answer path: retrieving -> streaming -> settled, accumulating text", () => {
    let s: TurnState = turnReducer(initialTurnState, { type: "submit" });
    s = turnReducer(s, sourcesEvent(false));
    expect(s.status).toBe("streaming");
    s = turnReducer(s, { type: "text", delta: "Hello " });
    s = turnReducer(s, { type: "text", delta: "world" });
    expect(s.status === "streaming" && s.text).toBe("Hello world");
    const done: DoneEvent = { type: "done", receipt: receipt(false) };
    s = turnReducer(s, done);
    expect(s.status).toBe("settled");
    expect(s.status === "settled" && s.text).toBe("Hello world");
    expect(s.status === "settled" && s.receipt.costUsd).toBe(0.0002);
  });

  it("refusal path: streaming -> refused with no text (RAG-13)", () => {
    let s: TurnState = turnReducer(
      { status: "retrieving" },
      sourcesEvent(true),
    );
    expect(s.status).toBe("streaming");
    s = turnReducer(s, { type: "done", receipt: receipt(true) });
    expect(s.status).toBe("refused");
    expect(s.status === "refused" && s.receipt.usage).toBeNull();
    expect(s.status === "refused" && s.nearMisses.length).toBe(1);
  });

  it("error mid-stream -> errored, preserving streamed text (PERF-09)", () => {
    let s: TurnState = turnReducer(
      { status: "retrieving" },
      sourcesEvent(false),
    );
    s = turnReducer(s, { type: "text", delta: "partial" });
    s = turnReducer(s, { type: "error", message: "boom", retryable: true });
    expect(s.status).toBe("errored");
    expect(s.status === "errored" && s.text).toBe("partial");
    expect(s.status === "errored" && s.retryable).toBe(true);
  });
});
