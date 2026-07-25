import { describe, it, expect } from "vitest";
import { announce } from "./announce";
import type { TurnState } from "./reducer";
import type { SourcePayload, Receipt } from "./types";
import { DECLINE_SENTINEL } from "../rag/prompt";

const src = (id: string): SourcePayload => ({
  chunkId: id,
  breadcrumb: "bc",
  url: "u",
  similarity: 0.6,
  snippet: "s",
});

const receipt = (refused: boolean): Receipt => ({
  model: "claude-haiku-4-5",
  calibrated: true,
  threshold: 0.35,
  refused,
  retrieval: { embedMs: 1, queryMs: 2 },
  corpusChunks: 3214,
  timings: {
    embedMs: 1,
    queryMs: 2,
    retrievalMs: 3,
    ttftMs: refused ? null : 4,
    generationMs: refused ? 0 : 5,
    totalMs: refused ? 3 : 9,
  },
  usage: null,
  costUsd: 0,
});

describe("announce (§4 / §13 exact strings, A11Y-14)", () => {
  it("idle / null are silent", () => {
    expect(announce(null)).toBe("");
    expect(announce({ status: "idle" })).toBe("");
  });

  it("retrieving -> Searching the docs", () => {
    expect(
      announce({
        status: "retrieving",
        choreo: null,
        buffer: "",
        pending: null,
      }),
    ).toBe("Searching the docs");
  });

  it("streaming -> {n} sources found, generating answer", () => {
    const s: TurnState = {
      status: "streaming",
      sources: [src("a"), src("b")],
      nearMisses: [],
      receipt: receipt(false),
      text: "partial",
    };
    expect(announce(s)).toBe("2 sources found, generating answer");
  });

  it("settled answer -> Answer complete, {n} sources cited", () => {
    const s: TurnState = {
      status: "settled",
      sources: [src("a"), src("b")],
      nearMisses: [],
      receipt: receipt(false),
      text: "The answer [1].",
    };
    expect(announce(s)).toBe("Answer complete, 2 sources cited");
  });

  it("settled sentinel decline -> declined, {n} sources shown", () => {
    const s: TurnState = {
      status: "settled",
      sources: [src("a")],
      nearMisses: [],
      receipt: receipt(false),
      text: `${DECLINE_SENTINEL} The closest topic is X.`,
    };
    expect(announce(s)).toBe(
      "Not covered by the docs · declined, 1 sources shown",
    );
  });

  it("server refusal -> declined, {n} near-misses shown", () => {
    const s: TurnState = {
      status: "refused",
      sources: [],
      nearMisses: [src("x"), src("y"), src("z")],
      receipt: receipt(true),
    };
    expect(announce(s)).toBe(
      "Not covered by the docs · declined, 3 near-misses shown",
    );
  });

  it("errored -> interrupted, partial preserved, retry available", () => {
    expect(
      announce({
        status: "errored",
        message: "boom",
        retryable: true,
        text: "partial",
      }),
    ).toBe("Answer interrupted · partial answer preserved, retry available");
  });
});
