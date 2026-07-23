/**
 * Retrieval eval metrics (eval-harness §2), pure and deterministic so they are
 * unit-testable without touching the network. hit@5 and MRR are computed over
 * `answerable` questions only; `boundary` questions are scored and recorded (for
 * threshold observation) but excluded from the aggregate metrics.
 */

export type EvalCategory = "answerable" | "boundary";

export interface RetrievedChunkRef {
  chunk_id: string;
  page_path: string;
  similarity: number;
}

export interface QuestionResult {
  id: string;
  category: EvalCategory;
  question: string;
  gold_chunks: string[];
  /** Production top-k, score-descending (as retrieval returned it). */
  retrieved: RetrievedChunkRef[];
  /** True when any gold chunk appears in `retrieved` (top-k). */
  hit: boolean;
  /** 1-based rank of the first gold chunk in `retrieved`; null when absent. */
  first_gold_rank: number | null;
  /** 1/first_gold_rank, or 0 when no gold was retrieved. */
  reciprocal_rank: number;
}

export interface RetrievalMetrics {
  /** Fraction of answerable questions with >=1 gold in top-k. */
  hit_at_5: number;
  /** Mean reciprocal rank of the first gold over answerable questions. */
  mrr: number;
  /** How many answerable questions the aggregate is over. */
  answerable_count: number;
}

/** Score one question against its gold labels given the production top-k. */
export function scoreQuestion(
  id: string,
  category: EvalCategory,
  question: string,
  goldChunks: string[],
  retrieved: RetrievedChunkRef[],
): QuestionResult {
  const gold = new Set(goldChunks);
  let firstGoldRank: number | null = null;
  for (let i = 0; i < retrieved.length; i++) {
    if (gold.has(retrieved[i]!.chunk_id)) {
      firstGoldRank = i + 1;
      break;
    }
  }
  return {
    id,
    category,
    question,
    gold_chunks: goldChunks,
    retrieved,
    hit: firstGoldRank !== null,
    first_gold_rank: firstGoldRank,
    reciprocal_rank: firstGoldRank === null ? 0 : 1 / firstGoldRank,
  };
}

/**
 * Regression guard (P4.3): every question must return a full top-k, and no
 * excluded page (RAG-23) may appear in any question's sources. `isExcluded` is
 * injected so this stays pure/unit-testable. Throws with the offending question
 * ids so a reintroduced HNSW post-filter bug or an exclusion leak fails loudly.
 */
export function assertRetrievalInvariants(
  results: QuestionResult[],
  k: number,
  isExcluded: (pagePath: string) => boolean,
): void {
  const underfilled = results.filter((r) => r.retrieved.length < k);
  const leaked = results.filter((r) =>
    r.retrieved.some((c) => isExcluded(c.page_path)),
  );
  if (underfilled.length > 0 || leaked.length > 0) {
    const parts: string[] = [];
    if (underfilled.length > 0) {
      parts.push(
        `under-filled (< ${k}): ${underfilled.map((r) => `${r.id}=${r.retrieved.length}`).join(", ")}`,
      );
    }
    if (leaked.length > 0) {
      parts.push(
        `excluded page leaked into: ${leaked.map((r) => r.id).join(", ")}`,
      );
    }
    throw new Error(`retrieval invariants violated: ${parts.join("; ")}`);
  }
}

/** Aggregate hit@5 and MRR over the answerable results (boundary excluded). */
export function aggregate(results: QuestionResult[]): RetrievalMetrics {
  const answerable = results.filter((r) => r.category === "answerable");
  const n = answerable.length;
  if (n === 0) return { hit_at_5: 0, mrr: 0, answerable_count: 0 };
  const hits = answerable.filter((r) => r.hit).length;
  const mrrSum = answerable.reduce((s, r) => s + r.reciprocal_rank, 0);
  return { hit_at_5: hits / n, mrr: mrrSum / n, answerable_count: n };
}
