import { describe, it, expect } from "vitest";
import { partition, type ScoredChunk } from "./retriever";
import { config } from "../config";

const chunk = (id: string, similarity: number): ScoredChunk => ({
  chunkId: id,
  breadcrumb: `bc ${id}`,
  headingAnchor: `https://x#${id}`,
  content: `content ${id}`,
  similarity,
});

const CALIBRATED = {
  status: "CALIBRATED" as const,
  value: 0.5,
  calibratedAt: "2026-01-01",
  calibrationRunId: "test-run",
};

describe("partition (RAG §6, RAG-13/14)", () => {
  const results = [
    chunk("a", 0.61),
    chunk("b", 0.5),
    chunk("c", 0.42),
    chunk("d", 0.3),
  ];

  it("splits context (>= T) from near-misses (< T); near-misses never in context (RAG-14)", () => {
    const p = partition(results, CALIBRATED);
    expect(p.contextSet.map((c) => c.chunkId)).toEqual(["a", "b"]); // 0.61, 0.50
    expect(p.nearMisses.map((c) => c.chunkId)).toEqual(["c", "d"]); // 0.42, 0.30
    const contextIds = new Set(p.contextSet.map((c) => c.chunkId));
    expect(p.nearMisses.every((c) => !contextIds.has(c.chunkId))).toBe(true);
    expect(p.refused).toBe(false);
  });

  it("refuses (no generation) when zero chunks clear the threshold (RAG-13)", () => {
    const p = partition([chunk("a", 0.4), chunk("b", 0.31)], CALIBRATED);
    expect(p.contextSet).toEqual([]);
    expect(p.refused).toBe(true);
    expect(p.nearMisses.map((c) => c.chunkId)).toEqual(["a", "b"]);
  });

  it("while UNCALIBRATED, treats all as context and never refuses (tolerated until P4.4)", () => {
    expect(config.retrieval.threshold.status).toBe("UNCALIBRATED");
    const p = partition(results, config.retrieval.threshold);
    expect(p.calibrated).toBe(false);
    expect(p.threshold).toBeNull();
    expect(p.contextSet).toHaveLength(4);
    expect(p.nearMisses).toEqual([]);
    expect(p.refused).toBe(false);
  });
});
