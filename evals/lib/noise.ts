import { JUDGE_CHECKS } from "./judge";
import type { JudgedRun } from "./judged";

/**
 * Noise measurement (eval-harness §4): run the judged layer N times against the
 * identical system state and measure how much the score wanders. The regression
 * margin `M` is the larger of the observed aggregate pass-rate spread and one
 * judged check (1/answerable-count). Pure so it is unit-testable (EVAL-10). No
 * judged-metric baseline is accepted without this attached.
 */

export interface NoiseResult {
  runs: number;
  pass_rates: number[];
  aggregate_spread: number; // max - min pass rate across runs
  per_check_flip_rate: number; // fraction of (question x check) cells that disagree across runs
  per_check_flips: number;
  cells: number;
  one_check: number; // 1 / answerable count
  M: number; // regression margin = max(aggregate_spread, one_check)
}

export function computeNoise(runs: JudgedRun[]): NoiseResult {
  if (runs.length === 0) throw new Error("noise needs at least one judged run");
  const passRates = runs.map(
    (r) => r.answers.filter((a) => a.passed).length / r.answers.length,
  );
  const aggregateSpread = Math.max(...passRates) - Math.min(...passRates);

  const ids = runs[0]!.answers.map((a) => a.id);
  let cells = 0;
  let flips = 0;
  for (const id of ids) {
    for (const c of JUDGE_CHECKS) {
      const values = runs.map(
        (r) => r.answers.find((a) => a.id === id)?.verdict?.[c],
      );
      cells++;
      if (new Set(values).size > 1) flips++;
    }
  }

  const answerableCount = runs[0]!.answers.length;
  const oneCheck = answerableCount ? 1 / answerableCount : 0;
  const M = Math.max(aggregateSpread, oneCheck);

  return {
    runs: runs.length,
    pass_rates: passRates,
    aggregate_spread: aggregateSpread,
    per_check_flip_rate: cells ? flips / cells : 0,
    per_check_flips: flips,
    cells,
    one_check: oneCheck,
    M,
  };
}
