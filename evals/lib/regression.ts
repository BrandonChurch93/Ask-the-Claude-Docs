import { config } from "../../lib/config";

/**
 * Regression policy (eval-harness §5, EVAL-11), pure so the gate logic is unit-
 * testable without a live run. Two rules with deliberately different bars:
 *
 *  - Retrieval is deterministic (EVAL-05), so ANY drop in hit@5 or MRR versus
 *    baseline is a regression - zero tolerance, no margin.
 *  - Judged wanders within the measured noise margin M, so only an aggregate
 *    pass-rate drop GREATER than M is a regression; a drop within M is "within
 *    noise". Independently, the AC-03 hard floor must hold: below it fails even
 *    when the drop is inside M.
 *
 * A number at 3 decimals guards against float-noise false positives on equality
 * (retrieval scores carry ~1e-5 external-API jitter, EVAL-05); metrics compared
 * here are hit@5/MRR/pass-rate, which are rational fractions of small counts and
 * compare exactly, but rounding the reported drop keeps the message clean.
 */

export interface RetrievalMetrics {
  hit_at_5: number;
  mrr: number;
}

export interface RetrievalVerdict {
  regressed: boolean;
  hitDrop: number; // baseline - run (positive = worse)
  mrrDrop: number;
  details: string;
}

/** Any hit@5 or MRR drop versus baseline is a regression (zero tolerance). */
export function checkRetrievalRegression(
  run: RetrievalMetrics,
  baseline: RetrievalMetrics,
): RetrievalVerdict {
  const hitDrop = baseline.hit_at_5 - run.hit_at_5;
  const mrrDrop = baseline.mrr - run.mrr;
  const regressed = hitDrop > 0 || mrrDrop > 0;
  const details = regressed
    ? `retrieval REGRESSED: hit@5 ${baseline.hit_at_5.toFixed(4)} -> ${run.hit_at_5.toFixed(4)}, MRR ${baseline.mrr.toFixed(4)} -> ${run.mrr.toFixed(4)}`
    : `retrieval ok: hit@5 ${run.hit_at_5.toFixed(4)} (Δ${(-hitDrop).toFixed(4)}), MRR ${run.mrr.toFixed(4)} (Δ${(-mrrDrop).toFixed(4)})`;
  return { regressed, hitDrop, mrrDrop, details };
}

export interface JudgedBaseline {
  pass_rate: number;
  noise_margin: number;
}

export interface JudgedVerdict {
  regressed: boolean;
  withinNoise: boolean;
  belowFloor: boolean;
  drop: number; // baseline - run (positive = worse)
  margin: number;
  details: string;
}

/**
 * A judged pass rate regresses when it drops more than the noise margin M below
 * baseline, OR when it falls below the AC-03 hard floor (config.evals.answerPassFloor).
 * A drop within M and above the floor is "within noise" - reported, not failed.
 */
export function checkJudgedRegression(
  runPassRate: number,
  baseline: JudgedBaseline,
  floor: number = config.evals.answerPassFloor,
): JudgedVerdict {
  const margin = baseline.noise_margin;
  const drop = baseline.pass_rate - runPassRate;
  const beyondMargin = drop > margin;
  const belowFloor = runPassRate < floor;
  const withinNoise = !beyondMargin && !belowFloor;
  const regressed = beyondMargin || belowFloor;
  const reasons: string[] = [];
  if (beyondMargin)
    reasons.push(
      `drop ${drop.toFixed(4)} exceeds margin M ${margin.toFixed(4)}`,
    );
  if (belowFloor)
    reasons.push(
      `pass rate ${runPassRate.toFixed(4)} below AC-03 floor ${floor.toFixed(2)}`,
    );
  const details = regressed
    ? `judged REGRESSED: ${reasons.join("; ")}`
    : `judged ok: pass rate ${runPassRate.toFixed(4)} vs baseline ${baseline.pass_rate.toFixed(4)} (drop ${drop.toFixed(4)} ≤ M ${margin.toFixed(4)}, floor ${floor.toFixed(2)})`;
  return { regressed, withinNoise, belowFloor, drop, margin, details };
}

/**
 * Should the judged suite auto-re-run to 3 and be scored on the median (EVAL-11
 * amendment)? True when a single judged run is "below threshold" (below the
 * AC-03 floor, or a drop beyond M) so a lone judge coin-flip near the floor
 * cannot false-red an unchanged system. A clean single run needs no re-run.
 */
export function shouldRerunToMedian(
  firstRunPassRate: number,
  baseline: JudgedBaseline,
  floor: number = config.evals.answerPassFloor,
): boolean {
  return checkJudgedRegression(firstRunPassRate, baseline, floor).regressed;
}
