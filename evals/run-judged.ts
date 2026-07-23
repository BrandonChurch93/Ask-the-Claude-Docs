import { writeFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

import { sql } from "../lib/db/client";
import { config } from "../lib/config";
import { countExcludedChunks } from "../lib/db/queries";
import { isExcludedPage } from "../lib/rag/exclusion";
import { runRetrievalEval } from "./lib/run";
import { assertRetrievalInvariants, aggregate } from "./lib/metrics";
import { runJudgedEval, aggregateAnswers, type JudgedRun } from "./lib/judged";
import { computeNoise } from "./lib/noise";
import { JUDGE_MODEL } from "./lib/judge";

/**
 * Full judged run + noise measurement -> baseline candidate (eval-harness §3-5).
 * Runs the retrieval layer once and the judged layer 3x against the identical
 * system state, computes the regression margin M, and writes evals/baseline.json
 * for explicit review (EVAL-12: the re-baseline is a reviewed commit, never
 * automated). The sanctioned eval spend (ENG-17): ~84 generations + ~63 judge
 * calls across the 3 runs.
 *
 * Run: `npm run eval:judged`.
 */

const RUNS = 3;

function isoStamp(now: Date): string {
  return now
    .toISOString()
    .replace(/\.\d+Z$/, "Z")
    .replace(/:/g, "-");
}

async function main() {
  const commit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();

  if ((await countExcludedChunks()) > 0)
    throw new Error(
      "corpus contains excluded-pattern chunks (RAG-23); re-ingest",
    );

  // Retrieval layer (deterministic).
  const retrievalResults = await runRetrievalEval();
  assertRetrievalInvariants(
    retrievalResults,
    config.retrieval.k,
    isExcludedPage,
  );
  const retrievalMetrics = aggregate(retrievalResults);

  // Judged layer, 3 runs against the identical system state (§4).
  const runs: JudgedRun[] = [];
  for (let i = 0; i < RUNS; i++) {
    console.log(`judged run ${i + 1}/${RUNS} ...`);
    runs.push(await runJudgedEval());
  }
  const noise = computeNoise(runs);

  // Recorded baseline = the MEDIAN run (EVAL-10, amended P4.5): a single run is a
  // noisy draw; near the AC-03 floor the min-vs-median gap is decision-relevant.
  // With 3 runs the median pass rate is the middle of the sorted three; the
  // recorded run is the first run achieving it (stable on ties).
  const medianPassRate = [...noise.pass_rates].sort((a, b) => a - b)[1]!;
  const medianIdx = noise.pass_rates.findIndex((r) => r === medianPassRate);
  const primary = runs[medianIdx]!;
  const agg = aggregateAnswers(primary);

  const now = new Date();
  const baseline = {
    run_id: `baseline-${isoStamp(now)}-${commit.slice(0, 6)}`,
    commit,
    baselined_at: now.toISOString().slice(0, 10),
    config_snapshot: {
      k: config.retrieval.k,
      threshold: config.retrieval.threshold,
      excluded_page_patterns: config.corpus.excludedPagePatterns,
      embedding_model: config.embedding.model,
      generation_model: config.generation.model,
      judge_model: JUDGE_MODEL,
    },
    retrieval: {
      hit_at_5: retrievalMetrics.hit_at_5,
      mrr: retrievalMetrics.mrr,
      answerable_count: retrievalMetrics.answerable_count,
    },
    answers: {
      pass_rate: agg.pass_rate, // median of the 3 runs (EVAL-10, amended P4.5)
      pass_rate_basis: "median-of-3",
      median_run_index: medianIdx,
      count: agg.count,
      checks: agg.checks,
      noise_margin: noise.M,
      noise,
      per_question: primary.answers.map((a) => ({
        id: a.id,
        passed: a.passed,
        verdict: a.verdict,
        server_refused: a.server_refused,
      })),
    },
    refusals: {
      passed: primary.refusals.filter((r) => r.passed).length,
      total: primary.refusals.length,
      per_question: primary.refusals,
    },
    boundary: { per_question: primary.boundary },
  };

  writeFileSync(
    path.join(process.cwd(), "evals", "baseline.json"),
    JSON.stringify(baseline, null, 2) + "\n",
  );

  // Report.
  console.log(`\n=== baseline candidate ${baseline.run_id} ===`);
  console.log(
    `retrieval: hit@5=${retrievalMetrics.hit_at_5.toFixed(4)} MRR=${retrievalMetrics.mrr.toFixed(4)}`,
  );
  console.log(
    `answers pass_rate (median = run ${medianIdx + 1}) = ${agg.pass_rate.toFixed(4)} (${agg.count} answerable)`,
  );
  console.log(`  per-check (median run): ${JSON.stringify(agg.checks)}`);
  console.log(
    `noise: pass_rates=[${noise.pass_rates.map((r) => r.toFixed(3)).join(", ")}]  spread=${noise.aggregate_spread.toFixed(3)}  per-check flips=${noise.per_check_flips}/${noise.cells} (${(noise.per_check_flip_rate * 100).toFixed(1)}%)`,
  );
  console.log(`M (regression margin) = ${noise.M.toFixed(4)}`);
  console.log(
    `refusals: ${baseline.refusals.passed}/${baseline.refusals.total} declined  (via: ${primary.refusals.map((r) => `${r.id}:${r.via}`).join(", ")})`,
  );
  console.log(
    `boundary: ${primary.boundary.map((b) => `${b.id}:${b.passed ? "pass" : "FAIL"}(${b.via},exp:${b.expected})`).join("  ")}`,
  );
  console.log(`\nbaseline candidate written: evals/baseline.json`);
}

main()
  .then(async () => {
    await sql.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(
      "eval:judged failed:",
      err instanceof Error ? err.message : err,
    );
    await sql.end({ timeout: 5 }).catch(() => {});
    process.exit(1);
  });
