import { describe, it, expect } from "vitest";
import { receiptFields, receiptDisplay, receiptProse } from "./receipt";
import type { SourcePayload, Receipt } from "./types";

const sources: SourcePayload[] = [
  {
    chunkId: "a",
    breadcrumb: "Hooks > PreToolUse",
    url: "u",
    similarity: 0.61,
    snippet: "s",
  },
  {
    chunkId: "b",
    breadcrumb: "Hooks > Exit codes",
    url: "u",
    similarity: 0.58,
    snippet: "s",
  },
];

const receipt: Receipt = {
  model: "claude-haiku-4-5",
  calibrated: true,
  threshold: 0.35,
  refused: false,
  retrieval: { embedMs: 12, queryMs: 41 },
  corpusChunks: 3214,
  timings: {
    embedMs: 12,
    queryMs: 41,
    retrievalMs: 66,
    ttftMs: 190,
    generationMs: 240,
    totalMs: 212.6,
  },
  usage: {
    inputTokens: 1449,
    outputTokens: 239,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  },
  costUsd: 0.0071,
};

describe("receipt formatting (§6.2, A11Y-16, RAG-17)", () => {
  const f = receiptFields(sources, receipt);

  it("derives fields from the sources + server receipt, never computing", () => {
    expect(f).toEqual({
      n: 2,
      topSim: 0.61,
      threshold: 0.35,
      ms: 213, // rounded totalMs
      model: "claude-haiku-4-5",
      costUsd: 0.0071,
    });
  });

  it("display string is the mono receipt line", () => {
    expect(receiptDisplay(f)).toBe(
      "2 sources · top 0.61 · threshold 0.35 · 213 ms · claude-haiku-4-5 · $0.0071",
    );
  });

  it("prose is a readable accessible name (A11Y-16)", () => {
    expect(receiptProse(f)).toBe(
      "2 sources retrieved, top similarity 0.61, threshold 0.35, 213 milliseconds, model claude-haiku-4-5, cost $0.0071.",
    );
  });

  it("singularizes one source", () => {
    expect(receiptProse(receiptFields([sources[0]!], receipt))).toContain(
      "1 source retrieved",
    );
  });
});
