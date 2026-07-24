import { describe, it, expect } from "vitest";
import { buildChoreography, CHOREO_MIN_MS } from "./choreography";
import type { SourcesEvent, ReceiptSkeleton } from "./types";

const skeleton = (refused: boolean): ReceiptSkeleton => ({
  model: "claude-haiku-4-5",
  calibrated: true,
  threshold: 0.35,
  refused,
  retrieval: { embedMs: 11.6, queryMs: 41.2 },
  corpusChunks: 3214,
});

describe("buildChoreography (§5, single-event narration)", () => {
  it("answer: embedded, searched, one stage per source, threshold, then excluded", () => {
    const ev: SourcesEvent = {
      type: "sources",
      sources: [
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
      ],
      nearMisses: [
        {
          chunkId: "c",
          breadcrumb: "Hooks > Matchers",
          url: "u",
          similarity: 0.41,
          snippet: "s",
        },
      ],
      receipt: skeleton(false),
    };
    const stages = buildChoreography(ev);
    expect(stages.map((s) => s.kind)).toEqual([
      "embedded",
      "searched",
      "source",
      "source",
      "threshold",
      "excluded",
    ]);
    // ms rounded from the receipt's retrieval timings; count off the receipt.
    expect(stages[0]).toEqual({ kind: "embedded", ms: 12 });
    expect(stages[1]).toEqual({ kind: "searched", corpusChunks: 3214, ms: 41 });
    expect(stages[4]).toEqual({
      kind: "threshold",
      threshold: 0.35,
      noneCleared: false,
    });
  });

  it("refusal: no source stages and the threshold rule reads none-cleared", () => {
    const ev: SourcesEvent = {
      type: "sources",
      sources: [],
      nearMisses: [
        {
          chunkId: "c",
          breadcrumb: "Model config",
          url: "u",
          similarity: 0.31,
          snippet: "s",
        },
        {
          chunkId: "d",
          breadcrumb: "Memory",
          url: "u",
          similarity: 0.27,
          snippet: "s",
        },
      ],
      receipt: skeleton(true),
    };
    const stages = buildChoreography(ev);
    expect(stages.map((s) => s.kind)).toEqual([
      "embedded",
      "searched",
      "threshold",
      "excluded",
      "excluded",
    ]);
    const rule = stages.find((s) => s.kind === "threshold");
    expect(rule).toEqual({
      kind: "threshold",
      threshold: 0.35,
      noneCleared: true,
    });
  });

  it("the per-stage minimum is 200ms (UX-05)", () => {
    expect(CHOREO_MIN_MS).toBe(200);
  });
});
