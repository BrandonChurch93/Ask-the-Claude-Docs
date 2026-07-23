import { fetchCorpus } from "../lib/rag/corpus";
import {
  upsertDocument,
  insertSyncRun,
  countDocuments,
} from "../lib/db/queries";
import { sql } from "../lib/db/client";

/**
 * Ingestion entrypoint. P2.2 phase: discover pages from llms.txt, fetch + sniff
 * each, store raw markdown in `documents` (RAG-01/02/03), and write a sync-log
 * row recording pages fetched/skipped. Chunking + embedding are added in
 * P2.3-P2.5. Free to run (no model API calls yet).
 *
 * Run: `npm run ingest`.
 */
async function main() {
  const startedAt = new Date();
  console.log("discovering + fetching corpus from llms.txt ...");
  const { fetched, skipped } = await fetchCorpus();

  for (const page of fetched) {
    await upsertDocument(page, startedAt);
  }

  const finishedAt = new Date();
  await insertSyncRun({
    startedAt,
    finishedAt,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    status: "success",
    pagesFetched: fetched.length,
    pagesSkipped: skipped,
    chunksAdded: 0,
    chunksUpdated: 0,
    chunksDeleted: 0,
    embeddingCalls: 0,
    error: null,
  });

  console.log(`\nfetched ${fetched.length}, skipped ${skipped.length}`);
  if (skipped.length > 0) {
    console.log("skip log:");
    for (const s of skipped)
      console.log(`  ${s.pagePath}: ${s.reason} (${s.url})`);
  } else {
    console.log("skip log: (no non-markdown pages in the current corpus)");
  }
  console.log(`documents row count: ${await countDocuments()}`);

  await sql.end();
}

main().catch(async (err) => {
  console.error("ingest failed:", err instanceof Error ? err.message : err);
  await sql.end({ timeout: 5 }).catch(() => {});
  process.exit(1);
});
