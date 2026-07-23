import { retrieve } from "../lib/rag/retriever";
import { sql } from "../lib/db/client";

/**
 * CLI retrieval probe (P3.1 review). Embeds a question, runs top-k, and prints
 * the five scored chunk ids with their partition (context vs near-miss).
 * Makes one embedding call per run (fractions of a cent).
 *
 * Run: `npm run retrieve -- "how do PreToolUse hooks work?"`
 */
async function main() {
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) {
    console.error('usage: npm run retrieve -- "<question>"');
    process.exitCode = 1;
    await sql.end();
    return;
  }

  const r = await retrieve(question);

  console.log(`Q: ${question}\n`);
  console.log(
    `threshold: ${r.calibrated ? r.threshold : "UNCALIBRATED (all treated as context until P4.4)"}`,
  );
  console.log(`refused:   ${r.refused}`);
  console.log(
    `timings:   embed=${r.timings.embedMs.toFixed(1)}ms  query=${r.timings.queryMs.toFixed(1)}ms  retrieval=${r.timings.retrievalMs.toFixed(1)}ms\n`,
  );

  const contextIds = new Set(r.contextSet.map((c) => c.chunkId));
  console.log("top-5 (similarity -> chunk_id) [partition]:");
  for (const c of r.results) {
    console.log(
      `  ${c.similarity.toFixed(4)}  [${contextIds.has(c.chunkId) ? "CONTEXT  " : "near-miss"}]  ${c.chunkId}`,
    );
    console.log(`             ${c.breadcrumb}`);
  }

  await sql.end();
}

main().catch(async (err) => {
  console.error("retrieve failed:", err instanceof Error ? err.message : err);
  await sql.end({ timeout: 5 }).catch(() => {});
  process.exit(1);
});
