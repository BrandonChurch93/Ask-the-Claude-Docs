import { runIngest, type IngestDeps } from "../lib/rag/ingest";
import { fetchCorpus } from "../lib/rag/corpus";
import { embed } from "../lib/rag/embedder";
import {
  getPageStates,
  getChunkStates,
  upsertDocument,
  upsertChunks,
  deleteChunks,
  deletePages,
  insertSyncRun,
} from "../lib/db/queries";
import { sql } from "../lib/db/client";

/**
 * Ingestion entrypoint (rag-design.md §9). Wires the real dependencies into the
 * injected orchestration in lib/rag/ingest.ts. `--dry-run` computes and prints
 * the plan (which chunks would embed and why) with no writes and no API calls.
 *
 * Run: `npm run ingest` (live; spends on embeddings) or `npm run ingest -- --dry-run`.
 */
async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const deps: IngestDeps = {
    fetchCorpus,
    getPageStates,
    getChunkStates,
    embed,
    upsertDocument,
    upsertChunks,
    deleteChunks,
    deletePages,
    insertSyncRun,
  };

  const r = await runIngest(deps, { dryRun, startedAt: new Date() });

  const added = r.chunksToEmbed.filter((c) => c.reason === "new").length;
  const changed = r.chunksToEmbed.filter((c) => c.reason === "changed").length;
  console.log(`${dryRun ? "DRY RUN (no writes, no API calls)" : "INGEST"}`);
  console.log(
    `pages: fetched=${r.pagesFetched} new=${r.pagesNew} changed=${r.pagesChanged} unchanged=${r.pagesUnchanged} removed=${r.pagesRemoved} skipped=${r.pagesSkipped.length}`,
  );
  console.log(
    `chunks: to-embed=${r.chunksToEmbed.length} (new=${added}, changed=${changed}) unchanged=${r.chunksUnchanged} to-delete=${r.chunksToDelete.length}`,
  );
  console.log(`embedding API batches: ${r.embeddingCalls}`);

  if (dryRun && r.chunksToEmbed.length > 0) {
    console.log("\nsample of chunks that WOULD embed (reason -> id):");
    for (const c of r.chunksToEmbed.slice(0, 10))
      console.log(`  ${c.reason.padEnd(7)} ${c.chunkId}`);
    if (r.chunksToEmbed.length > 10)
      console.log(`  ... and ${r.chunksToEmbed.length - 10} more`);
  }

  // Deleting chunks leaves dead entries in the HNSW graph (pgvector reclaims them
  // only on VACUUM); a similarity search near a deleted region can then return
  // fewer than k live rows. VACUUM after any deletion so the index stays healthy
  // for retrieval and the eval's under-return guard (P4.3 Tier 2).
  const deleted = r.pagesRemoved > 0 || r.chunksToDelete.length > 0;
  if (!dryRun && deleted) {
    await sql`vacuum chunks`;
    console.log("vacuumed chunks (HNSW dead-entry cleanup after deletions)");
  }

  await sql.end();
}

main().catch(async (err) => {
  console.error("ingest failed:", err instanceof Error ? err.message : err);
  await sql.end({ timeout: 5 }).catch(() => {});
  process.exit(1);
});
