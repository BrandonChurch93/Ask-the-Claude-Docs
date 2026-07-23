import "server-only";

import { embedQuery } from "./embedder";
import { retrieveTopK } from "../db/queries";
import { config } from "../config";

/**
 * Retrieval + threshold partition + refusal decision (rag-design.md §6).
 * Per query: embed via the shared function (RAG-12), top-k cosine search with
 * the model filter (RAG-10/11), then partition by the calibrated threshold `T`
 * and decide refusal (RAG-13/14). Timings use performance.now() (PERF-06); the
 * DB client is shared at module scope (PERF-10, lib/db/client.ts).
 */

export interface ScoredChunk {
  chunkId: string;
  pagePath: string;
  breadcrumb: string;
  /** The full deep link (`pageUrl#slug`); the chunker stores it ready to use. */
  headingAnchor: string;
  content: string;
  similarity: number;
}

export interface Partition {
  /** Chunks at or above `T`: the only chunks ever sent to the model (RAG-14). */
  contextSet: ScoredChunk[];
  /** Chunks below `T`: returned to the client dimmed, never to the model. */
  nearMisses: ScoredChunk[];
  /** True when no chunk clears `T`: a server-side refusal, no generation (RAG-13). */
  refused: boolean;
  calibrated: boolean;
  threshold: number | null;
}

type Threshold = typeof config.retrieval.threshold;

/**
 * Partition scored results against the calibrated threshold (pure, so RAG-13/14
 * are fixture-testable). While `T` is UNCALIBRATED (until P4.4), there is no
 * threshold to partition by, so every retrieved chunk is treated as context and
 * nothing refuses; the refusal feature stays blocked on calibration (RAG §6).
 */
export function partition(
  results: ScoredChunk[],
  threshold: Threshold,
): Partition {
  if (threshold.status === "CALIBRATED") {
    const t = threshold.value;
    const contextSet = results.filter((r) => r.similarity >= t);
    const nearMisses = results.filter((r) => r.similarity < t);
    return {
      contextSet,
      nearMisses,
      refused: contextSet.length === 0,
      calibrated: true,
      threshold: t,
    };
  }
  return {
    contextSet: results,
    nearMisses: [],
    refused: false,
    calibrated: false,
    threshold: null,
  };
}

export interface RetrievalOutcome extends Partition {
  results: ScoredChunk[];
  timings: { embedMs: number; queryMs: number; retrievalMs: number };
}

export async function retrieve(question: string): Promise<RetrievalOutcome> {
  const start = performance.now();
  const embedding = await embedQuery(question);
  const afterEmbed = performance.now();
  const rows = await retrieveTopK(embedding);
  const afterQuery = performance.now();

  const results: ScoredChunk[] = rows.map((r) => ({
    chunkId: r.chunk_id,
    pagePath: r.page_path,
    breadcrumb: r.breadcrumb,
    headingAnchor: r.heading_anchor,
    content: r.content,
    similarity: r.similarity,
  }));
  const part = partition(results, config.retrieval.threshold);
  const end = performance.now();

  return {
    ...part,
    results,
    timings: {
      embedMs: afterEmbed - start,
      queryMs: afterQuery - afterEmbed,
      retrievalMs: end - start,
    },
  };
}
