import { execSync } from "node:child_process";
import path from "node:path";

import { sql } from "../lib/db/client";
import { config } from "../lib/config";
import { countExcludedChunks } from "../lib/db/queries";
import { isExcludedPage } from "../lib/rag/exclusion";
import { runRetrievalEval } from "./lib/run";
import {
  assertRetrievalInvariants,
  aggregate,
  type QuestionResult,
} from "./lib/metrics";
import {
  buildArtifact,
  writeArtifact,
  type JudgedArtifactInput,
} from "./lib/artifact";
import { readBaseline } from "./lib/baseline";
import { runJudgedEval, aggregateAnswers, type JudgedRun } from "./lib/judged";
import {
  checkRetrievalRegression,
  checkJudgedRegression,
  shouldRerunToMedian,
} from "./lib/regression";
import {
  readRunCostEntries,
  sumMonthCost,
  isSoftCapExceeded,
} from "./lib/monthly-cost";

/**
 * CI eval gate (eval-harness §5-6, §8). One entry, two layers:
 *
 *  --layer=retrieval : the cheap, deterministic gate that runs on EVERY PR.
 *                      Any hit@5/MRR drop vs baseline fails the build (EVAL-11).
 *  --layer=judged    : the full suite, triggered by path filters (EVAL-13). Runs
 *                      retrieval + the judged answer/refusal layer; a judged pass-
 *                      rate drop beyond M, or below the AC-03 floor, fails. A first
 *                      run that is below threshold auto-re-runs to 3 and is scored
 *                      on the median (EVAL-11 amendment) so a lone judge coin-flip
 *                      near the floor cannot false-red an unchanged system.
 *
 * Before a judged run it checks the monthly CI soft cap (Tier 2 extension of
 * EVAL-13): if this calendar month's accumulated judged spend already exceeds
 * config.evals.ciMonthlySoftCapUsd, an auto-triggered run posts a loud warning and
 * defers to manual dispatch (`--dispatch` bypasses the cap). This is a soft stop
 * against flaky-rerun / iteration-day pileups, never a gate on a real regression.
 *
 * The artifact is always written (§8); the workflow's separate main-push job is
 * the only thing that commits it (decision 1A, write scoped to that job).
 */

const args = new Set(process.argv.slice(2));
const layer =
  [...args].find((a) => a.startsWith("--layer="))?.split("=")[1] ?? "retrieval";
const dispatch = args.has("--dispatch");

function aggregateToSection(run: JudgedRun, noiseMargin: number) {
  const agg = aggregateAnswers(run);
  return {
    pass_rate: agg.pass_rate,
    count: agg.count,
    checks: agg.checks as Record<string, number>,
    noise_margin: noiseMargin,
    per_question: run.answers.map((a) => ({
      id: a.id,
      passed: a.passed,
      server_refused: a.server_refused,
      verdict: a.verdict,
    })),
  };
}

/** Run judged once; if the first run is below threshold, re-run to 3 and pick the
 *  median run (EVAL-11). Returns the median run, the pass rates, and total spend. */
async function runJudgedWithRerun(baseline: {
  pass_rate: number;
  noise_margin: number;
}): Promise<{ median: JudgedRun; passRates: number[]; totalCostUsd: number }> {
  const runs: JudgedRun[] = [await runJudgedEval()];
  let totalCostUsd = runs[0]!.estimatedCostUsd;
  const firstPass = aggregateAnswers(runs[0]!).pass_rate;

  if (shouldRerunToMedian(firstPass, baseline)) {
    console.log(
      `first judged run ${firstPass.toFixed(4)} is below threshold - re-running to 3 for the median verdict (EVAL-11)`,
    );
    for (let i = 0; i < 2; i++) {
      const r = await runJudgedEval();
      totalCostUsd += r.estimatedCostUsd;
      runs.push(r);
    }
  }
  const passRates = runs.map((r) => aggregateAnswers(r).pass_rate);
  const medianPassRate = [...passRates].sort((a, b) => a - b)[
    Math.floor((passRates.length - 1) / 2)
  ]!;
  const median = runs[passRates.findIndex((p) => p === medianPassRate)]!;
  return { median, passRates, totalCostUsd };
}

async function main() {
  const commit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const now = new Date();
  const baseline = readBaseline();

  // RAG-23 corpus scope check (shared by both layers).
  const excluded = await countExcludedChunks();
  if (excluded > 0)
    throw new Error(
      `corpus has ${excluded} excluded-pattern chunks (RAG-23); re-ingest`,
    );

  // Retrieval layer - always runs, zero-tolerance gate (EVAL-11).
  const results = await runRetrievalEval();
  assertRetrievalInvariants(results, config.retrieval.k, isExcludedPage);
  const retrievalVerdict = checkRetrievalRegression(
    { hit_at_5: aggregateHit(results), mrr: aggregateMrr(results) },
    baseline.retrieval,
  );
  console.log(retrievalVerdict.details);

  let judgedSection: JudgedArtifactInput | undefined;
  let judgedRegressed = false;

  if (layer === "judged") {
    const monthCost = sumMonthCost(
      readRunCostEntries(path.join(process.cwd(), "evals", "runs")),
      now.toISOString().slice(0, 7),
    );
    const cap = config.evals.ciMonthlySoftCapUsd;
    if (!dispatch && isSoftCapExceeded(monthCost, cap)) {
      console.warn(
        `\n${"!".repeat(72)}\n` +
          `CI EVAL SOFT CAP: this month's judged spend $${monthCost.toFixed(2)} exceeds ` +
          `$${cap.toFixed(2)} (config.evals.ciMonthlySoftCapUsd).\n` +
          `Skipping the auto-triggered judged suite. Re-run via manual workflow_dispatch\n` +
          `to override once you've confirmed the spend is intended.\n${"!".repeat(72)}\n`,
      );
    } else {
      const { median, passRates, totalCostUsd } = await runJudgedWithRerun(
        baseline.answers,
      );
      const answers = aggregateToSection(median, baseline.answers.noise_margin);
      const judgedVerdict = checkJudgedRegression(
        answers.pass_rate,
        baseline.answers,
      );
      judgedRegressed = judgedVerdict.regressed;
      console.log(
        `judged runs: [${passRates.map((p) => p.toFixed(3)).join(", ")}] median ${answers.pass_rate.toFixed(4)}  (est. spend $${totalCostUsd.toFixed(4)})`,
      );
      console.log(judgedVerdict.details);
      judgedSection = {
        answers,
        refusals: {
          passed: median.refusals.filter((r) => r.passed).length,
          total: median.refusals.length,
          per_question: median.refusals,
        },
        boundary: { per_question: median.boundary },
        estimated_cost_usd: totalCostUsd,
        baseline_delta: {
          retrieval_hit_at_5:
            aggregateHit(results) - baseline.retrieval.hit_at_5,
          retrieval_mrr: aggregateMrr(results) - baseline.retrieval.mrr,
          answers_pass_rate: answers.pass_rate - baseline.answers.pass_rate,
        },
      };
    }
  }

  // Retrieval-only artifacts still record a retrieval baseline_delta via the run.
  const artifact = buildArtifact(results, commit, now, judgedSection);
  if (!judgedSection) {
    artifact.baseline_delta = {
      retrieval_hit_at_5: aggregateHit(results) - baseline.retrieval.hit_at_5,
      retrieval_mrr: aggregateMrr(results) - baseline.retrieval.mrr,
      answers_pass_rate: null,
    };
  }
  const { runPath, latestUpdated } = writeArtifact(artifact);
  console.log(
    `artifact: ${runPath}${latestUpdated ? " (latest.json updated)" : " (retrieval-only; latest.json preserved)"}`,
  );

  if (retrievalVerdict.regressed || judgedRegressed) {
    console.error("\nEVAL GATE FAILED (EVAL-11).");
    return 1;
  }
  console.log("\neval gate passed.");
  return 0;
}

function aggregateHit(r: QuestionResult[]): number {
  return aggregate(r).hit_at_5;
}
function aggregateMrr(r: QuestionResult[]): number {
  return aggregate(r).mrr;
}

main()
  .then(async (code) => {
    await sql.end();
    process.exit(code);
  })
  .catch(async (err) => {
    console.error("ci-eval failed:", err instanceof Error ? err.message : err);
    await sql.end({ timeout: 5 }).catch(() => {});
    process.exit(1);
  });
