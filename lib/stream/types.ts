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

/** Per-query timings in milliseconds (performance.now(), PERF-06). */
export interface Timings {
  embedMs: number;
  queryMs: number;
  retrievalMs: number;
  generationMs: number;
  totalMs: number;
}

/** The receipt skeleton sent in the `sources` event, before any generation. */
export interface ReceiptSkeleton {
  model: string;
  calibrated: boolean;
  threshold: number | null;
  refused: boolean;
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
