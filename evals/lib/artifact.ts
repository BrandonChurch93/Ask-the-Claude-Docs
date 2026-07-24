import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { config } from "../../lib/config";
import { aggregate, type QuestionResult } from "./metrics";
import { JUDGE_MODEL } from "./judge";
import type { AnswerResult, DeclineResult } from "./judged";

/**
 * The eval-harness §8 run artifact: what CI commits and the /evals page renders
 * (EVAL-16, no live computation). The `retrieval` section is always present; the
 * judged sections (answers/refusals/boundary/baseline_delta/estimated_cost_usd)
 * are attached when the judged layer ran (path-filtered PRs + main, EVAL-13).
 * Every artifact embeds the config snapshot and the commit SHA it ran against
 * (EVAL-17). Pure and config-only, so it is unit-testable.
 *
 * `baseline_delta` is a superset of the §8 illustration: it reports signed
 * hit@5 / MRR / pass-rate deltas as numbers (the page formats them), rather than
 * the single pre-formatted string the doc sketches. No consumer exists yet (the
 * /evals page is P5); logged as a Tier 2 shape choice.
 */
export interface RunAnswersSection {
  pass_rate: number;
  count: number;
  checks: Record<string, number>;
  noise_margin: number;
  per_question: {
    id: string;
    passed: boolean;
    server_refused: boolean;
    verdict: AnswerResult["verdict"];
  }[];
}

export interface RunArtifact {
  run_id: string;
  commit: string;
  config_snapshot: {
    k: number;
    threshold: typeof config.retrieval.threshold;
    excluded_page_patterns: readonly string[];
    embedding_model: string;
    generation_model: string;
    judge_model: string;
  };
  retrieval: {
    hit_at_5: number;
    mrr: number;
    answerable_count: number;
    per_question: QuestionResult[];
  };
  answers?: RunAnswersSection;
  refusals?: { passed: number; total: number; per_question: DeclineResult[] };
  boundary?: { per_question: DeclineResult[] };
  baseline_delta?: {
    retrieval_hit_at_5: number;
    retrieval_mrr: number;
    answers_pass_rate: number | null;
  };
  estimated_cost_usd?: number;
}

/** The judged sections, pre-aggregated by the caller from a median JudgedRun. */
export interface JudgedArtifactInput {
  answers: RunAnswersSection;
  refusals: { passed: number; total: number; per_question: DeclineResult[] };
  boundary: { per_question: DeclineResult[] };
  estimated_cost_usd: number;
  baseline_delta: RunArtifact["baseline_delta"];
}

/** ISO stamp with filesystem-safe separators: 2026-07-23T12-34-56Z. */
function isoStamp(now: Date): string {
  return now
    .toISOString()
    .replace(/\.\d+Z$/, "Z")
    .replace(/:/g, "-");
}

/** Assemble the artifact, embedding the config snapshot + commit (EVAL-17). */
export function buildArtifact(
  results: QuestionResult[],
  commit: string,
  now: Date,
  judged?: JudgedArtifactInput,
): RunArtifact {
  const metrics = aggregate(results);
  const base: RunArtifact = {
    run_id: `${isoStamp(now)}-${commit.slice(0, 6)}`,
    commit,
    config_snapshot: {
      k: config.retrieval.k,
      threshold: config.retrieval.threshold,
      excluded_page_patterns: config.corpus.excludedPagePatterns,
      embedding_model: config.embedding.model,
      generation_model: config.generation.model,
      judge_model: JUDGE_MODEL,
    },
    retrieval: {
      hit_at_5: metrics.hit_at_5,
      mrr: metrics.mrr,
      answerable_count: metrics.answerable_count,
      per_question: results,
    },
  };
  if (!judged) return base;
  return {
    ...base,
    answers: judged.answers,
    refusals: judged.refusals,
    boundary: judged.boundary,
    baseline_delta: judged.baseline_delta,
    estimated_cost_usd: judged.estimated_cost_usd,
  };
}

/**
 * Write evals/runs/{run_id}.json for EVERY run, and update evals/latest.json ONLY
 * for a full run (§8: "every FULL run ... updates latest.json"). A run is full
 * when the judged layer ran, which the artifact encodes as the presence of its
 * `answers` section. A retrieval-only run (path-filter miss, or a soft-capped
 * judged trigger) records its own run artifact but must NOT clobber the last full
 * latest.json that /evals renders (EVAL-16) - otherwise a docs/UI merge would blank
 * the judged numbers on the page until the next pipeline change. `evalsDir` is a
 * seam for tests; production uses <cwd>/evals.
 */
export function writeArtifact(
  artifact: RunArtifact,
  evalsDir: string = path.join(process.cwd(), "evals"),
): { runPath: string; latestUpdated: boolean } {
  const runsDir = path.join(evalsDir, "runs");
  mkdirSync(runsDir, { recursive: true });
  const json = JSON.stringify(artifact, null, 2) + "\n";
  const runPath = path.join(runsDir, `${artifact.run_id}.json`);
  writeFileSync(runPath, json);
  const isFullRun = artifact.answers !== undefined;
  if (isFullRun) writeFileSync(path.join(evalsDir, "latest.json"), json);
  return { runPath, latestUpdated: isFullRun };
}
