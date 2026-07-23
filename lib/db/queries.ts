import { sql } from "./client";
import { config } from "../config";
import type { FetchedPage, SkippedPage } from "../rag/corpus";

/**
 * SQL query module (ENG-03: all SQL lives in lib/db/ as tagged-template
 * queries). STUB shape for P2.1 to lock the retrieval SQL contract; the full
 * retriever (threshold partition against T, near-misses, `performance.now()`
 * timings) lands in P3.1.
 */

export interface RetrievedChunk {
  chunk_id: string;
  breadcrumb: string;
  heading_anchor: string;
  content: string;
  similarity: number;
}

/** pgvector text form: `[0.1,0.2,...]`. */
function toVector(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/**
 * Top-k cosine retrieval (rag-design.md §6). Cosine distance operator `<=>`
 * only (RAG-11); similarity is `1 - distance`. Filters on the configured
 * embedding_model so a partial or mixed-model migration can never silently
 * compare cross-model vectors (RAG-10). `k` and the model come from config
 * (RAG-19).
 */
export async function retrieveTopK(
  embedding: number[],
): Promise<RetrievedChunk[]> {
  const vector = toVector(embedding);
  return sql<RetrievedChunk[]>`
    select
      chunk_id,
      breadcrumb,
      heading_anchor,
      content,
      1 - (embedding <=> ${vector}::vector) as similarity
    from chunks
    where embedding_model = ${config.embedding.model}
    order by embedding <=> ${vector}::vector
    limit ${config.retrieval.k}
  `;
}

/**
 * Store a page's raw markdown before any chunking (RAG-03). Upsert by
 * page_path; the hash-diff planner (P2.4) decides what to re-embed, but the raw
 * document is always kept current so chunking can re-run without re-fetching.
 */
export async function upsertDocument(
  page: FetchedPage,
  syncedAt: Date,
): Promise<void> {
  await sql`
    insert into documents (page_path, source, title, url, raw_markdown, page_hash, synced_at)
    values (${page.pagePath}, ${page.source}, ${page.title}, ${page.url},
            ${page.rawMarkdown}, ${page.pageHash}, ${syncedAt})
    on conflict (page_path) do update set
      source       = excluded.source,
      title        = excluded.title,
      url          = excluded.url,
      raw_markdown = excluded.raw_markdown,
      page_hash    = excluded.page_hash,
      synced_at    = excluded.synced_at
  `;
}

/** Total document rows (for the P2.2 review + coverage derivation). */
export async function countDocuments(): Promise<number> {
  const [row] = await sql<
    { count: number }[]
  >`select count(*)::int as count from documents`;
  return row?.count ?? 0;
}

export interface SyncRunRecord {
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  status: string;
  pagesFetched: number;
  pagesSkipped: SkippedPage[];
  chunksAdded: number;
  chunksUpdated: number;
  chunksDeleted: number;
  embeddingCalls: number;
  error: string | null;
}

/**
 * Write one sync-log row (RAG-22). Skips are persisted with their reasons
 * (RAG-02), never silently dropped. The full writer (chunk counts, coverage)
 * is extended in P2.4; this records the fetch phase.
 */
export async function insertSyncRun(run: SyncRunRecord): Promise<void> {
  await sql`
    insert into sync_runs (
      started_at, finished_at, duration_ms, status, pages_fetched, pages_skipped,
      chunks_added, chunks_updated, chunks_deleted, embedding_calls, error
    )
    values (
      ${run.startedAt}, ${run.finishedAt}, ${run.durationMs}, ${run.status},
      ${run.pagesFetched}, ${JSON.stringify(run.pagesSkipped)}::jsonb,
      ${run.chunksAdded}, ${run.chunksUpdated}, ${run.chunksDeleted},
      ${run.embeddingCalls}, ${run.error}
    )
  `;
}
