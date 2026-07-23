import { execSync } from "node:child_process";

import { sql } from "../lib/db/client";
import { runRetrievalEval } from "./lib/run";
import { buildArtifact, writeArtifact } from "./lib/artifact";

/**
 * Entry point for `npm run eval:retrieval`. Runs the retrieval eval against the
 * live corpus, writes the §8 artifact, and prints hit@5 / MRR plus a per-question
 * line so a regression is traceable to specific questions (eval-harness §2).
 */
async function main() {
  const commit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const results = await runRetrievalEval();
  const artifact = buildArtifact(results, commit, new Date());
  const { runPath } = writeArtifact(artifact);
  const m = artifact.retrieval;

  console.log(`\n=== retrieval eval · run ${artifact.run_id} ===`);
  console.log(
    `hit@5 = ${m.hit_at_5.toFixed(4)}   MRR = ${m.mrr.toFixed(4)}   (n=${m.answerable_count} answerable)\n`,
  );
  console.log("id    cat         hit  rank  top-1 chunk");
  console.log("-".repeat(72));
  for (const r of m.per_question) {
    const rank = r.first_gold_rank === null ? "-" : String(r.first_gold_rank);
    const top1 = r.retrieved[0]?.chunk_id ?? "(none)";
    const flag = r.category === "answerable" && !r.hit ? " <== MISS" : "";
    console.log(
      `${r.id.padEnd(5)} ${r.category.padEnd(11)} ${(r.hit ? "Y" : "n").padEnd(4)} ${rank.padEnd(5)} ${top1}${flag}`,
    );
  }
  console.log(`\nartifact: ${runPath}`);
}

main()
  .then(async () => {
    await sql.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(
      "eval:retrieval failed:",
      err instanceof Error ? err.message : err,
    );
    await sql.end({ timeout: 5 }).catch(() => {});
    process.exit(1);
  });
