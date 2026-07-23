/**
 * Central configuration: the single source of truth for every pipeline and
 * product parameter (RAG-19). No pipeline parameter may appear as a literal
 * outside this file; every other module imports from here. The eval harness
 * snapshots this object into each run's output.
 *
 * Scope of this file is the RAG §8 enumeration:
 *   chunk split levels · target/max/min token sizes · batch size ·
 *   embedding model · generation models + active flag · k ·
 *   threshold T (+ calibrated_at, calibration_run_id) · max output tokens ·
 *   rate-limit numbers · daily spend cap.
 *
 * Contains no secrets; secrets are read only through lib/env.ts. This file is
 * plain constants and is safe to import from any runtime context.
 */

/**
 * The calibrated retrieval threshold `T` (RAG §6, RAG-15). Its value is
 * *calibrated from this project's own eval data*, never borrowed. Until the
 * P4.4 calibration procedure runs, `value` is null and `status` is
 * 'UNCALIBRATED'; the retriever tolerates this until P4.4 and the refusal
 * feature's completion is blocked on calibration.
 */
type Threshold =
  | {
      readonly status: "UNCALIBRATED";
      readonly value: null;
      readonly calibratedAt: null;
      readonly calibrationRunId: null;
    }
  | {
      readonly status: "CALIBRATED";
      readonly value: number;
      readonly calibratedAt: string; // ISO-8601 date the calibration run produced T
      readonly calibrationRunId: string; // eval-run ID that produced this value
    };

export const config = {
  /** Corpus source (RAG §1). Discovery starts from llms.txt; no hardcoded page
   *  lists (RAG-01). Multi-corpus schema, single v1 source value. */
  corpus: {
    llmsTxtUrl: "https://code.claude.com/docs/llms.txt",
    source: "claude-code",
    /** Concurrent page fetches during discovery (politeness bound). */
    fetchConcurrency: 8,
  },

  /** Chunking parameters (RAG §2). Split at ## and ###; #### and deeper stay in-parent. */
  chunking: {
    /** Heading depths that begin a new chunk. `#` (page title) is metadata, not a split point. */
    splitHeadingLevels: [2, 3],
    /** Target chunk size in tokens. */
    targetTokens: 500,
    /** Hard maximum (atomic code-block chunks are the documented exception). */
    maxTokens: 800,
    /** Below this, a section is merged with a sibling. */
    minTokens: 120,
    /** The embedding model's hard input cap (text-embedding-3-small). An atomic
     *  unit exceeding this is un-embeddable, so it triggers the oversize-atomic
     *  exception (RAG §2): split at natural boundaries into self-describing
     *  segments. */
    embeddingLimitTokens: 8191,
    /** Segment size for the oversize-atomic split; margin below the cap. */
    oversizeSegmentTokens: 7000,
  },

  /** Embedding model + batching (RAG §5). Default parameters, no dimension truncation. */
  embedding: {
    model: "text-embedding-3-small",
    /** Inputs per embedding API request during ingestion. */
    batchSize: 100,
  },

  /** Retrieval + refusal (RAG §6). */
  retrieval: {
    /** top-k for the similarity search. */
    k: 5,
    /** Calibrated refusal threshold. See the Threshold type. */
    threshold: {
      status: "UNCALIBRATED",
      value: null,
      calibratedAt: null,
      calibrationRunId: null,
    } satisfies Threshold as Threshold,
  },

  /** Generation (RAG §7). Model choice is server-owned; there is no client-controllable
   *  generation parameter (SEC-08). */
  generation: {
    /** Default model. */
    model: "claude-haiku-4-5",
    /** Higher-quality model, selected only when `useHigherQualityModel` is true. */
    higherQualityModel: "claude-sonnet-4-6",
    /** Server-side flag selecting the higher-quality model. Never client-supplied. */
    useHigherQualityModel: false,
    /** Cap on generated tokens per answer (PERF-11 blast-radius bound). */
    maxOutputTokens: 1024,
  },

  /** Per-IP rate limits (SEC §4). Sliding window, enforced in middleware, fail-open. */
  rateLimit: {
    perMinute: 10,
    perDay: 50,
  },

  /** Global daily spend cap in USD (SEC §4). Server-side counter keyed by UTC date,
   *  checked before every generation call, fail-closed. */
  spend: {
    dailyCapUsd: 5,
  },
} as const;

export type Config = typeof config;
