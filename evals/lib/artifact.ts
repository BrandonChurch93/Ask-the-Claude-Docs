import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { config } from "../../lib/config";
import { aggregate, type QuestionResult } from "./metrics";

/**
 * The eval-harness §8 run artifact. P4.2 populates the `retrieval` section; the
 * judged layers (answers/refusals/boundary/baseline_delta) are added at P4.5.
 * Every artifact embeds the config snapshot and the commit SHA it ran against
 * (EVAL-17). Pure and config-only (no server chain), so it is unit-testable.
 */
export interface RunArtifact {
  run_id: string;
  commit: string;
  config_snapshot: {
    k: number;
    threshold: typeof config.retrieval.threshold;
    excluded_page_patterns: readonly string[];
    embedding_model: string;
    generation_model: string;
  };
  retrieval: {
    hit_at_5: number;
    mrr: number;
    answerable_count: number;
    per_question: QuestionResult[];
  };
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
): RunArtifact {
  const metrics = aggregate(results);
  return {
    run_id: `${isoStamp(now)}-${commit.slice(0, 6)}`,
    commit,
    config_snapshot: {
      k: config.retrieval.k,
      threshold: config.retrieval.threshold,
      excluded_page_patterns: config.corpus.excludedPagePatterns,
      embedding_model: config.embedding.model,
      generation_model: config.generation.model,
    },
    retrieval: {
      hit_at_5: metrics.hit_at_5,
      mrr: metrics.mrr,
      answerable_count: metrics.answerable_count,
      per_question: results,
    },
  };
}

/** Write evals/runs/{run_id}.json and update evals/latest.json (EVAL-16 source). */
export function writeArtifact(artifact: RunArtifact): { runPath: string } {
  const evalsDir = path.join(process.cwd(), "evals");
  const runsDir = path.join(evalsDir, "runs");
  mkdirSync(runsDir, { recursive: true });
  const json = JSON.stringify(artifact, null, 2) + "\n";
  const runPath = path.join(runsDir, `${artifact.run_id}.json`);
  writeFileSync(runPath, json);
  writeFileSync(path.join(evalsDir, "latest.json"), json);
  return { runPath };
}
