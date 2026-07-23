import { describe, it, expect } from "vitest";
import {
  scoreQuestion,
  aggregate,
  assertRetrievalInvariants,
  type QuestionResult,
} from "./metrics";
import { buildArtifact } from "./artifact";

const retrieved = (...ids: string[]) =>
  ids.map((id, i) => ({
    chunk_id: id,
    page_path: id,
    similarity: 0.9 - i * 0.05,
  }));

describe("scoreQuestion (eval-harness §2)", () => {
  it("hits at rank 1 with reciprocal rank 1", () => {
    const r = scoreQuestion(
      "a-1",
      "answerable",
      "q",
      ["g"],
      retrieved("g", "x", "y"),
    );
    expect(r.hit).toBe(true);
    expect(r.first_gold_rank).toBe(1);
    expect(r.reciprocal_rank).toBe(1);
  });

  it("hits at rank 3 with reciprocal rank 1/3", () => {
    const r = scoreQuestion(
      "a-2",
      "answerable",
      "q",
      ["g"],
      retrieved("x", "y", "g", "z"),
    );
    expect(r.hit).toBe(true);
    expect(r.first_gold_rank).toBe(3);
    expect(r.reciprocal_rank).toBeCloseTo(1 / 3, 10);
  });

  it("misses when no gold is retrieved (rank null, rr 0)", () => {
    const r = scoreQuestion(
      "a-3",
      "answerable",
      "q",
      ["g"],
      retrieved("x", "y", "z"),
    );
    expect(r.hit).toBe(false);
    expect(r.first_gold_rank).toBeNull();
    expect(r.reciprocal_rank).toBe(0);
  });

  it("uses the FIRST gold's rank when multiple golds match", () => {
    const r = scoreQuestion(
      "a-4",
      "answerable",
      "q",
      ["g1", "g2"],
      retrieved("x", "g2", "g1"),
    );
    expect(r.first_gold_rank).toBe(2); // g2 at rank 2 comes before g1 at rank 3
  });
});

describe("aggregate (eval-harness §2)", () => {
  const mk = (
    id: string,
    cat: "answerable" | "boundary",
    hitRank: number | null,
  ): QuestionResult =>
    scoreQuestion(
      id,
      cat,
      "q",
      ["g"],
      hitRank === null
        ? retrieved("x", "y", "z")
        : retrieved(
            ...Array.from({ length: hitRank - 1 }, (_, i) => `x${i}`),
            "g",
          ),
    );

  it("computes hit@5 and MRR over answerable only; excludes boundary", () => {
    const results = [
      mk("a-1", "answerable", 1), // rr 1
      mk("a-2", "answerable", 2), // rr 1/2
      mk("a-3", "answerable", null), // miss
      mk("b-1", "boundary", 1), // excluded from metrics
    ];
    const m = aggregate(results);
    expect(m.answerable_count).toBe(3);
    expect(m.hit_at_5).toBeCloseTo(2 / 3, 10); // 2 of 3 answerable hit
    expect(m.mrr).toBeCloseTo((1 + 0.5 + 0) / 3, 10);
  });

  it("returns zeros when there are no answerable questions", () => {
    expect(aggregate([mk("b-1", "boundary", 1)])).toEqual({
      hit_at_5: 0,
      mrr: 0,
      answerable_count: 0,
    });
  });
});

describe("assertRetrievalInvariants (P4.3 regression guard, RAG-23)", () => {
  const noneExcluded = () => false;
  const full = scoreQuestion(
    "a-1",
    "answerable",
    "q",
    ["g"],
    retrieved("g", "x", "y", "z", "w"),
  );

  it("passes when every question returns full k and nothing is excluded", () => {
    expect(() =>
      assertRetrievalInvariants([full], 5, noneExcluded),
    ).not.toThrow();
  });

  it("throws when a question under-returns (< k), the HNSW post-filter bug", () => {
    const short = scoreQuestion(
      "a-2",
      "answerable",
      "q",
      ["g"],
      retrieved("a", "b", "c"),
    );
    expect(() => assertRetrievalInvariants([short], 5, noneExcluded)).toThrow(
      /under-filled/,
    );
  });

  it("throws when an excluded page leaks into a question's sources", () => {
    // page 'x' is on the exclusion list but appears in the retrieved set.
    expect(() =>
      assertRetrievalInvariants([full], 5, (p) => p === "x"),
    ).toThrow(/excluded page leaked/);
  });
});

describe("buildArtifact (EVAL-17)", () => {
  it("embeds the config snapshot and commit SHA", () => {
    const results = [
      scoreQuestion("a-1", "answerable", "q", ["g"], retrieved("g")),
    ];
    const art = buildArtifact(
      results,
      "abcdef1234",
      new Date("2026-07-23T12:34:56.789Z"),
    );
    expect(art.commit).toBe("abcdef1234");
    expect(art.run_id).toBe("2026-07-23T12-34-56Z-abcdef");
    expect(art.config_snapshot.k).toBe(5);
    expect(art.config_snapshot.embedding_model).toBe("text-embedding-3-small");
    expect(art.config_snapshot.generation_model).toBe("claude-haiku-4-5");
    expect(art.retrieval.hit_at_5).toBe(1);
    expect(art.retrieval.per_question).toHaveLength(1);
  });
});
