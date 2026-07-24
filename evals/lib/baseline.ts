import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Reader for evals/baseline.json - the frozen reference the CI gate compares
 * against (eval-harness §5). Baselines change only by explicit reviewed commit
 * (EVAL-12); this only reads. Narrowed to the fields the regression check needs:
 * the deterministic retrieval metrics and the judged pass rate + noise margin M.
 */
export interface Baseline {
  retrieval: { hit_at_5: number; mrr: number };
  answers: { pass_rate: number; noise_margin: number };
}

interface BaselineFile {
  retrieval?: { hit_at_5?: number; mrr?: number };
  answers?: {
    pass_rate?: number;
    noise_margin?: number;
    noise?: { M?: number };
  };
}

export function readBaseline(
  file: string = path.join(process.cwd(), "evals", "baseline.json"),
): Baseline {
  const raw = JSON.parse(readFileSync(file, "utf8")) as BaselineFile;
  const hit = raw.retrieval?.hit_at_5;
  const mrr = raw.retrieval?.mrr;
  const passRate = raw.answers?.pass_rate;
  const margin = raw.answers?.noise_margin ?? raw.answers?.noise?.M;
  if (
    typeof hit !== "number" ||
    typeof mrr !== "number" ||
    typeof passRate !== "number" ||
    typeof margin !== "number"
  )
    throw new Error(`baseline.json is missing required metrics (${file})`);
  return {
    retrieval: { hit_at_5: hit, mrr },
    answers: { pass_rate: passRate, noise_margin: margin },
  };
}
