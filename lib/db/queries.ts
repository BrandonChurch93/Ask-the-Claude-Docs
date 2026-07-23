import { sql } from "./client";
import { config } from "../config";
import type { FetchedPage, SkippedPage } from "../rag/corpus";
import type { Chunk } from "../rag/chunker";
import type { PageState } from "../rag/planner";

/**
 * SQL query module (ENG-03: all SQL lives in lib/db/ as tagged-template
 * queries). STUB shape for P2.1 to lock the retrieval SQL contract; the full
 * retriever (threshold partition against T, near-misses, `performance.now()`
 * timings) lands in P3.1.
 */

export interface RetrievedChunk {
  chunk_id: string;
  page_path: string;
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
 * (RAG-19). `heading_anchor` is already the full deep link (chunker stores
 * `url#slug`), so the sources SSE event needs no join for the source URL.
 *
 * The query is a plain top-k with no exclusion filter: excluded pages (RAG-23)
 * are removed at INGESTION (corpus scope), so the corpus is already clean and
 * HNSW works without a post-filter. The under-return guard below is a permanent
 * invariant even though its trigger class (an all-excluded candidate set) is gone.
 */
export async function retrieveTopK(
  embedding: number[],
): Promise<RetrievedChunk[]> {
  const vector = toVector(embedding);
  const rows = await sql<RetrievedChunk[]>`
    select
      chunk_id,
      page_path,
      breadcrumb,
      heading_anchor,
      content,
      1 - (embedding <=> ${vector}::vector) as similarity
    from chunks
    where embedding_model = ${config.embedding.model}
    order by embedding <=> ${vector}::vector
    limit ${config.retrieval.k}
  `;
  if (rows.length < config.retrieval.k) {
    console.warn(
      JSON.stringify({
        event: "retrieval_underfilled",
        requested_k: config.retrieval.k,
        returned: rows.length,
      }),
    );
  }
  return rows;
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

// --- Sync-diff reads (P2.4): current page and chunk identity/hash state. ---

/** Page identity + hash for the page-level diff (RAG §9 steps 1-2). */
export async function getPageStates(): Promise<PageState[]> {
  return sql<PageState[]>`
    select page_path as "pagePath", page_hash as "pageHash" from documents`;
}

/** Chunk identity + hash for the chunk-level diff (RAG §9 step 3). */
export async function getChunkStates(): Promise<
  { chunkId: string; contentHash: string; pagePath: string }[]
> {
  return sql<{ chunkId: string; contentHash: string; pagePath: string }[]>`
    select chunk_id as "chunkId", content_hash as "contentHash", page_path as "pagePath"
    from chunks`;
}

/** Insert or update a chunk with its embedding (embed at write time, RAG §5). */
export async function upsertChunk(
  chunk: Chunk,
  embedding: number[],
  updatedAt: Date,
): Promise<void> {
  const vector = `[${embedding.join(",")}]`;
  await sql`
    insert into chunks (
      chunk_id, page_path, source, breadcrumb, heading_anchor, content,
      content_hash, token_count, embedding, embedding_model, updated_at
    )
    values (
      ${chunk.chunkId}, ${chunk.pagePath}, ${chunk.source}, ${chunk.breadcrumb},
      ${chunk.headingAnchor}, ${chunk.content}, ${chunk.contentHash}, ${chunk.tokenCount},
      ${vector}::vector, ${config.embedding.model}, ${updatedAt}
    )
    on conflict (chunk_id) do update set
      page_path       = excluded.page_path,
      source          = excluded.source,
      breadcrumb      = excluded.breadcrumb,
      heading_anchor  = excluded.heading_anchor,
      content         = excluded.content,
      content_hash    = excluded.content_hash,
      token_count     = excluded.token_count,
      embedding       = excluded.embedding,
      embedding_model = excluded.embedding_model,
      updated_at      = excluded.updated_at
  `;
}

/**
 * Batched chunk upsert (P2.6 Tier 2): groups rows into multi-row INSERT ...
 * ON CONFLICT statements to cut round-trips to the pooled connection (the first
 * ingestion's wall-clock was dominated by ~3500 single-row upserts). Each row
 * keeps its own `::vector` cast on the embedding.
 */
export async function upsertChunks(
  rows: { chunk: Chunk; embedding: number[] }[],
  updatedAt: Date,
): Promise<void> {
  for (let i = 0; i < rows.length; i += config.ingest.upsertBatchSize) {
    const batch = rows.slice(i, i + config.ingest.upsertBatchSize);
    const valueRows = batch.map(
      ({ chunk, embedding }) => sql`(
        ${chunk.chunkId}, ${chunk.pagePath}, ${chunk.source}, ${chunk.breadcrumb},
        ${chunk.headingAnchor}, ${chunk.content}, ${chunk.contentHash}, ${chunk.tokenCount},
        ${`[${embedding.join(",")}]`}::vector, ${config.embedding.model}, ${updatedAt}
      )`,
    );
    const values = valueRows.reduce((acc, row) => sql`${acc}, ${row}`);
    await sql`
      insert into chunks (
        chunk_id, page_path, source, breadcrumb, heading_anchor, content,
        content_hash, token_count, embedding, embedding_model, updated_at
      )
      values ${values}
      on conflict (chunk_id) do update set
        page_path       = excluded.page_path,
        source          = excluded.source,
        breadcrumb      = excluded.breadcrumb,
        heading_anchor  = excluded.heading_anchor,
        content         = excluded.content,
        content_hash    = excluded.content_hash,
        token_count     = excluded.token_count,
        embedding       = excluded.embedding,
        embedding_model = excluded.embedding_model,
        updated_at      = excluded.updated_at
    `;
  }
}

/** Delete chunks by id (re-chunk removed a section, RAG §9 step 3). */
export async function deleteChunks(chunkIds: string[]): Promise<void> {
  if (chunkIds.length === 0) return;
  await sql`delete from chunks where chunk_id = any(${chunkIds})`;
}

/** Delete removed pages; the FK cascade removes their chunks (RAG §9 step 4). */
export async function deletePages(pagePaths: string[]): Promise<void> {
  if (pagePaths.length === 0) return;
  await sql`delete from documents where page_path = any(${pagePaths})`;
}

// --- Coverage + freshness, derived from stored data, never hardcoded (RAG-21). ---

/** The corpus coverage list (refusal-state chips), from current page titles. */
export async function getCoverage(): Promise<
  { pagePath: string; title: string; url: string }[]
> {
  // Defensive exclusion (RAG-21/RAG-23): the corpus is already clean (excluded
  // pages are dropped at ingestion), so this is belt-and-suspenders: coverage
  // can never advertise a topic the product would not cite.
  return sql<{ pagePath: string; title: string; url: string }[]>`
    select page_path as "pagePath", title, url
    from documents
    where not (page_path like any(${config.corpus.excludedPagePatterns}))
    order by title`;
}

/**
 * Count corpus chunks whose page matches an excluded pattern (RAG-23 regression
 * check). The corpus is scoped at ingestion, so this must always be 0; the eval
 * asserts on it so a broken discovery filter fails loudly.
 */
export async function countExcludedChunks(): Promise<number> {
  const [row] = await sql<{ count: number }[]>`
    select count(*)::int as count from chunks
    where page_path like any(${config.corpus.excludedPagePatterns})`;
  return row?.count ?? 0;
}

/** The freshness timestamp: most recent sync (RAG §9.5 `synced_at` max). */
export async function getFreshness(): Promise<Date | null> {
  const [row] = await sql<{ syncedAt: Date | null }[]>`
    select max(synced_at) as "syncedAt" from documents`;
  return row?.syncedAt ?? null;
}

/**
 * Write one sync-log row (RAG-22). Skips are persisted with their reasons
 * (RAG-02), never silently dropped.
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
