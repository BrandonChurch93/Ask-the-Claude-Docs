/**
 * SSE payload types for /api/ask, defined once and imported by both the server
 * encoder and the client parser (ENG-08). The wire protocol is rag-design §7:
 * `sources` -> `text`* -> `done`, with `error` as a terminal failure event.
 * These payloads carry no secrets and no server internals (SEC-02).
 */

/**
 * A retrieved source (or near-miss) as it rides the `sources` event. Carries a
 * snippet, never the full chunk body (PERF-12); the full text is fetched lazily
 * when the user expands a source.
 */
export interface SourcePayload {
  chunkId: string;
  breadcrumb: string;
  /** Deep link: the page URL plus the chunk's heading anchor. */
  url: string;
  similarity: number;
  /** First ~`config.payload.snippetChars` characters of the chunk (PERF-12). */
  snippet: string;
}

/** Token usage from the generation response (the Anthropic usage object). */
export interface UsagePayload {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

/**
 * Per-query timings in milliseconds, measured route-side with performance.now()
 * (PERF-06). The three PERF §3 budgeted segments are `retrievalMs`, `ttftMs`,
 * and (on a refusal) `totalMs` as the round-trip; `embedMs`/`queryMs` are the
 * retriever's diagnostic breakdown.
 */
export interface Timings {
  /** Retriever breakdown: the query-embedding API call. */
  embedMs: number;
  /** Retriever breakdown: the pgvector search. */
  queryMs: number;
  /** PERF §3 retrieval_ms: request validated → sources event emitted. */
  retrievalMs: number;
  /** PERF §3 ttft_ms: request validated → first generation token. Null on a refusal. */
  ttftMs: number | null;
  /** First generation token → done. 0 on a refusal. */
  generationMs: number;
  /** Request validated → done. On a refusal this is PERF §3's refusal round-trip. */
  totalMs: number;
}

/** The receipt skeleton sent in the `sources` event, before any generation. */
export interface ReceiptSkeleton {
  model: string;
  calibrated: boolean;
  threshold: number | null;
  refused: boolean;
  /**
   * Retrieval timings known already at the `sources` event, so the ui-ux-spec §5
   * choreography narrates this ONE event and never reaches for a second data
   * source (P5.1 Tier-3 SSE-contract extension). The `done` Receipt's full
   * `Timings` is a superset, so `embedMs`/`queryMs` stay consistent by inheritance.
   */
  retrieval: { embedMs: number; queryMs: number };
  /**
   * Total corpus chunks searched (a RAG-21 corpus fact) for the choreography's
   * "searched {n} chunks" stage. Sourced in-event, not from the coverage endpoint,
   * so the choreography stays a single-event narration (§5).
   */
  corpusChunks: number;
}

/** The completed receipt sent in the `done` event. */
export interface Receipt extends ReceiptSkeleton {
  timings: Timings;
  /** Null on a refusal: no generation call was made (RAG-13, PERF-07). */
  usage: UsagePayload | null;
  /** Query cost in USD from the usage object (RAG-17); 0 on a refusal. */
  costUsd: number;
}

/** First event: ordered context chunks, near-misses, and the receipt skeleton. */
export interface SourcesEvent {
  type: "sources";
  sources: SourcePayload[];
  nearMisses: SourcePayload[];
  receipt: ReceiptSkeleton;
}

/** A generation text delta, enqueued as received with no buffering (PERF-08). */
export interface TextEvent {
  type: "text";
  delta: string;
}

/** Final event: the completed receipt. */
export interface DoneEvent {
  type: "done";
  receipt: Receipt;
}

/** A terminal failure. `message` is user-facing copy (ui-ux-spec §8), never internals. */
export interface ErrorEvent {
  type: "error";
  message: string;
  retryable: boolean;
}

export type ServerEvent = SourcesEvent | TextEvent | DoneEvent | ErrorEvent;
