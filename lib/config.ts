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
    /** Corpus scope is llms.txt MINUS these page patterns (SQL/glob LIKE), applied
     *  at discovery so the daily sync deletes any previously-ingested ones and
     *  never re-adds them (RAG-01, RAG-23). Release-note content (the changelog +
     *  weekly what's-new pages, ~10% of the corpus) is high-volume, low-value for
     *  how-to questions, and grows every sync; excluding it at ingestion keeps the
     *  retrieval query clean (no HNSW post-filter / ef_search machinery). Accepted
     *  cost: "what changed in week X" is out of scope for this how-to Q&A. Chosen
     *  at P4.3 after retrieval-time filtering was falsified twice (HNSW
     *  post-filtering, then the ef_search candidate cap). */
    excludedPagePatterns: ["changelog", "whats-new/%"],
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
    /** Calibrated refusal threshold (P4.4, eval-harness §7). T sits in the clean
     *  gap between clearly-off-corpus (~0.20) and real content (0.45+); the server
     *  gate's honest job is clearly-off-corpus. Plausible off-corpus questions
     *  (0.57-0.64) are not separable from weak answerables by cosine, so they pass
     *  the gate and decline model-side via the sentinel (EVAL-09 two-tier).
     *  Distributions committed in evals/calibration.json (EVAL-15). */
    threshold: {
      status: "CALIBRATED",
      value: 0.35,
      calibratedAt: "2026-07-23",
      calibrationRunId: "calibration-2026-07-23T21-22-50Z-ffc726",
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

  /**
   * Model pricing in USD per 1,000,000 tokens, keyed by model ID. The displayed
   * query cost is computed from the API usage object with these rates, never
   * estimated (RAG-17). Prices are the one config value that drifts silently, so
   * they carry a verification date; P7.5's audit re-checks them against the live
   * pricing pages. Cache-token rates are the standard 1.25x (5-minute write) and
   * 0.1x (read) multiples of the base input rate; v1 sends no cache_control, so
   * those usage fields are 0 in practice and priced only defensively.
   *
   * verified: 2026-07-23 (claude-api model catalog + prompt-caching multipliers)
   *
   * OpenAI's text-embedding-3-small rate is deliberately absent: it is
   * to-be-verified at calibration (P4.4), so query cost currently reflects
   * generation only. The embedding portion (the refusal receipt's embedding-only
   * cost, ui-ux-spec §7) joins once that rate is verified.
   */
  pricing: {
    "claude-haiku-4-5": {
      inputPerMTok: 1.0,
      outputPerMTok: 5.0,
      cacheWritePerMTok: 1.25,
      cacheReadPerMTok: 0.1,
    },
    "claude-sonnet-4-6": {
      inputPerMTok: 3.0,
      outputPerMTok: 15.0,
      cacheWritePerMTok: 3.75,
      cacheReadPerMTok: 0.3,
    },
  },

  /** SSE payload hygiene (PERF-12). The sources event carries snippets, not full
   *  chunk bodies; `snippetChars` is that snippet length in characters. */
  payload: {
    snippetChars: 300,
  },

  /** Ingestion write batching. Chunk upserts are grouped into multi-row
   *  statements to cut round-trips to the pooled connection (P2.6 Tier 2). */
  ingest: {
    upsertBatchSize: 100,
  },

  /** Per-IP rate limits (SEC §4). Sliding window, enforced in middleware, fail-open. */
  rateLimit: {
    perMinute: 10,
    perDay: 50,
  },

  /** Global daily spend cap in USD (SEC §4). Server-side counter keyed by UTC date,
   *  checked before every generation call, fail-closed. Standing demo cap is $1/day
   *  (Brandon, P3.G3); $5 was a leftover default. */
  spend: {
    dailyCapUsd: 1.0,
  },

  /** Eval-harness CI guards (eval-harness §5-6). `ciMonthlySoftCapUsd` is a SOFT
   *  cap on the judged suite's CI spend (Tier 2 extension of EVAL-13, Brandon,
   *  P4.6): each judged run records its token-math estimated cost into its run
   *  artifact; when the calendar month's accumulated estimate exceeds this cap,
   *  an auto-triggered judged job posts a loud warning and requires manual
   *  dispatch instead of firing. A soft stop against flaky-rerun and
   *  iteration-day pileups, never a hard gate on a real regression check. */
  evals: {
    ciMonthlySoftCapUsd: 5.0,
    /** AC-03 hard floor: the judged answer pass rate must stay at or above this
     *  (success-criteria.md AC-03). The regression gate fails below it even when
     *  the drop is within the noise margin M. */
    answerPassFloor: 0.8,
  },
} as const;

export type Config = typeof config;
