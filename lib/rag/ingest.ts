import { config } from "../config";
import { chunkPage, type Chunk } from "./chunker";
import {
  diffPages,
  diffChunks,
  type ChunkState,
  type PageState,
} from "./planner";
import type { FetchedPage, SkippedPage } from "./corpus";
import type { SyncRunRecord } from "../db/queries";

/**
 * Ingestion orchestration (rag-design.md §9). Dependencies are injected so the
 * whole flow, including the idempotency invariant (RAG-20: unchanged corpus
 * makes zero embedding calls) and the loud-failure guarantee (RAG-22), is
 * testable with mocks and no network or paid API (ENG-17).
 */
export interface IngestDeps {
  fetchCorpus: () => Promise<{
    fetched: FetchedPage[];
    skipped: SkippedPage[];
  }>;
  getPageStates: () => Promise<PageState[]>;
  getChunkStates: () => Promise<(ChunkState & { pagePath: string })[]>;
  embed: (texts: string[]) => Promise<number[][]>;
  upsertDocument: (page: FetchedPage, syncedAt: Date) => Promise<void>;
  upsertChunk: (
    chunk: Chunk,
    embedding: number[],
    updatedAt: Date,
  ) => Promise<void>;
  deleteChunks: (chunkIds: string[]) => Promise<void>;
  deletePages: (pagePaths: string[]) => Promise<void>;
  insertSyncRun: (run: SyncRunRecord) => Promise<void>;
}

export interface SyncPlan {
  pagesNew: number;
  pagesChanged: number;
  pagesUnchanged: number;
  pagesRemoved: number;
  chunksToEmbed: { chunkId: string; reason: "new" | "changed" }[];
  chunksToDelete: string[];
  chunksUnchanged: number;
}

export interface IngestResult extends SyncPlan {
  dryRun: boolean;
  pagesFetched: number;
  pagesSkipped: SkippedPage[];
  embeddingCalls: number;
}

async function computePlan(deps: IngestDeps) {
  const [dbPages, dbChunks, corpus] = await Promise.all([
    deps.getPageStates(),
    deps.getChunkStates(),
    deps.fetchCorpus(),
  ]);
  const { fetched, skipped } = corpus;

  const pageDiff = diffPages(
    fetched.map((p) => ({ pagePath: p.pagePath, pageHash: p.pageHash })),
    dbPages,
  );

  const dbChunksByPage = new Map<string, ChunkState[]>();
  const chunkCount = new Map<string, number>();
  for (const c of dbChunks) {
    const arr = dbChunksByPage.get(c.pagePath) ?? [];
    arr.push({ chunkId: c.chunkId, contentHash: c.contentHash });
    dbChunksByPage.set(c.pagePath, arr);
    chunkCount.set(c.pagePath, (chunkCount.get(c.pagePath) ?? 0) + 1);
  }

  const changed = new Set([...pageDiff.new, ...pageDiff.changed]);
  // Process new/changed pages, plus any fetched page with no chunks yet
  // (bootstrap: the raw doc exists but was never chunked/embedded). Unchanged
  // pages that already have chunks are skipped, so a no-op sync embeds nothing
  // (RAG-20).
  const toProcess = fetched.filter(
    (p) => changed.has(p.pagePath) || (chunkCount.get(p.pagePath) ?? 0) === 0,
  );

  const embedTargets: { chunk: Chunk; reason: "new" | "changed" }[] = [];
  const chunksToDelete: string[] = [];
  let chunksUnchanged = 0;

  for (const page of toProcess) {
    const chunks = chunkPage({
      source: config.corpus.source,
      pagePath: page.pagePath,
      title: page.title,
      url: page.url,
      rawMarkdown: page.rawMarkdown,
    });
    const byId = new Map(chunks.map((c) => [c.chunkId, c]));
    const d = diffChunks(
      chunks.map((c) => ({ chunkId: c.chunkId, contentHash: c.contentHash })),
      dbChunksByPage.get(page.pagePath) ?? [],
    );
    chunksUnchanged += d.unchanged;
    chunksToDelete.push(...d.toDelete);
    for (const target of d.toEmbed) {
      const chunk = byId.get(target.chunkId);
      if (chunk) embedTargets.push({ chunk, reason: target.reason });
    }
  }

  // Removed pages: their chunks cascade-delete with the page; count for the log.
  let removedChunkCount = 0;
  for (const p of pageDiff.removed) removedChunkCount += chunkCount.get(p) ?? 0;

  const plan: SyncPlan = {
    pagesNew: pageDiff.new.length,
    pagesChanged: pageDiff.changed.length,
    pagesUnchanged: pageDiff.unchanged.length,
    pagesRemoved: pageDiff.removed.length,
    chunksToEmbed: embedTargets.map((e) => ({
      chunkId: e.chunk.chunkId,
      reason: e.reason,
    })),
    chunksToDelete,
    chunksUnchanged,
  };
  return {
    plan,
    embedTargets,
    skipped,
    fetched,
    removedPages: pageDiff.removed,
    removedChunkCount,
  };
}

export async function runIngest(
  deps: IngestDeps,
  options: { dryRun: boolean; startedAt: Date },
): Promise<IngestResult> {
  const { startedAt } = options;
  const {
    plan,
    embedTargets,
    skipped,
    fetched,
    removedPages,
    removedChunkCount,
  } = await computePlan(deps);

  const base = {
    ...plan,
    pagesFetched: fetched.length,
    pagesSkipped: skipped,
  };

  if (options.dryRun) {
    return { ...base, dryRun: true, embeddingCalls: 0 };
  }

  try {
    // Keep raw docs current (also advances synced_at for the freshness signal).
    for (const page of fetched) await deps.upsertDocument(page, startedAt);

    let embeddingCalls = 0;
    if (embedTargets.length > 0) {
      const vectors = await deps.embed(
        embedTargets.map((e) => e.chunk.content),
      );
      embeddingCalls = Math.ceil(
        embedTargets.length / config.embedding.batchSize,
      );
      for (let i = 0; i < embedTargets.length; i++) {
        await deps.upsertChunk(embedTargets[i]!.chunk, vectors[i]!, startedAt);
      }
    }
    await deps.deleteChunks(plan.chunksToDelete);
    await deps.deletePages(removedPages);

    const finishedAt = new Date();
    await deps.insertSyncRun({
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      status: "success",
      pagesFetched: fetched.length,
      pagesSkipped: skipped,
      chunksAdded: plan.chunksToEmbed.filter((c) => c.reason === "new").length,
      chunksUpdated: plan.chunksToEmbed.filter((c) => c.reason === "changed")
        .length,
      chunksDeleted: plan.chunksToDelete.length + removedChunkCount,
      embeddingCalls,
      error: null,
    });
    return { ...base, dryRun: false, embeddingCalls };
  } catch (err) {
    // Record a failed run (loud) then rethrow so the caller exits non-zero,
    // rather than committing a half-sync (RAG-22).
    const finishedAt = new Date();
    await deps
      .insertSyncRun({
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        status: "failed",
        pagesFetched: fetched.length,
        pagesSkipped: skipped,
        chunksAdded: 0,
        chunksUpdated: 0,
        chunksDeleted: 0,
        embeddingCalls: 0,
        error: err instanceof Error ? err.message : String(err),
      })
      .catch(() => {});
    throw err;
  }
}
