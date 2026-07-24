import { describe, it, expect } from "vitest";
import {
  checkRetrievalRegression,
  checkJudgedRegression,
  shouldRerunToMedian,
} from "./regression";
import { monthOf, sumMonthCost, isSoftCapExceeded } from "./monthly-cost";

const baselineRetrieval = { hit_at_5: 0.85, mrr: 0.696 };
const baselineJudged = { pass_rate: 0.9, noise_margin: 0.05 };

describe("checkRetrievalRegression (EVAL-11, zero tolerance)", () => {
  it("passes when metrics match or improve", () => {
    expect(
      checkRetrievalRegression(
        { hit_at_5: 0.85, mrr: 0.696 },
        baselineRetrieval,
      ).regressed,
    ).toBe(false);
    expect(
      checkRetrievalRegression({ hit_at_5: 0.9, mrr: 0.72 }, baselineRetrieval)
        .regressed,
    ).toBe(false);
  });
  it("fails on any hit@5 drop", () => {
    expect(
      checkRetrievalRegression({ hit_at_5: 0.8, mrr: 0.696 }, baselineRetrieval)
        .regressed,
    ).toBe(true);
  });
  it("fails on any MRR drop even when hit@5 holds", () => {
    const v = checkRetrievalRegression(
      { hit_at_5: 0.85, mrr: 0.69 },
      baselineRetrieval,
    );
    expect(v.regressed).toBe(true);
    expect(v.mrrDrop).toBeCloseTo(0.006, 10);
  });
});

describe("checkJudgedRegression (EVAL-11, margin + floor)", () => {
  it("a drop within M above the floor is within noise, not a regression", () => {
    const v = checkJudgedRegression(0.86, baselineJudged); // drop 0.04 ≤ M 0.05
    expect(v.regressed).toBe(false);
    expect(v.withinNoise).toBe(true);
  });
  it("a drop beyond M is a regression", () => {
    const v = checkJudgedRegression(0.84, baselineJudged); // drop 0.06 > M 0.05
    expect(v.regressed).toBe(true);
    expect(v.withinNoise).toBe(false);
  });
  it("below the AC-03 floor fails even when the drop is within M", () => {
    // baseline 0.82, M 0.05: 0.79 is a drop of 0.03 (within M) but under the 0.80 floor.
    const v = checkJudgedRegression(0.79, {
      pass_rate: 0.82,
      noise_margin: 0.05,
    });
    expect(v.regressed).toBe(true);
    expect(v.belowFloor).toBe(true);
  });
  it("respects an explicit floor override", () => {
    expect(checkJudgedRegression(0.7, baselineJudged, 0.6).belowFloor).toBe(
      false,
    );
  });
});

describe("shouldRerunToMedian", () => {
  it("re-runs when the first run is below threshold, not when it is clean", () => {
    expect(shouldRerunToMedian(0.9, baselineJudged)).toBe(false); // clean
    expect(shouldRerunToMedian(0.8, baselineJudged)).toBe(true); // drop 0.10 > M
    expect(
      shouldRerunToMedian(0.79, { pass_rate: 0.82, noise_margin: 0.05 }),
    ).toBe(true); // below floor
  });
});

describe("monthly soft cap (EVAL-13 extension)", () => {
  const entries = [
    { run_id: "2026-07-01T00-00-00Z-aaa", estimated_cost_usd: 2.0 },
    { run_id: "2026-07-20T00-00-00Z-bbb", estimated_cost_usd: 2.5 },
    { run_id: "2026-08-01T00-00-00Z-ccc", estimated_cost_usd: 9.0 },
  ];
  it("monthOf extracts the YYYY-MM prefix", () => {
    expect(monthOf("2026-07-23T12-00-00Z-xyz")).toBe("2026-07");
  });
  it("sums only the given month", () => {
    expect(sumMonthCost(entries, "2026-07")).toBeCloseTo(4.5, 10);
    expect(sumMonthCost(entries, "2026-08")).toBeCloseTo(9.0, 10);
    expect(sumMonthCost(entries, "2026-09")).toBe(0);
  });
  it("trips the cap only once exceeded (soft, strictly greater)", () => {
    expect(isSoftCapExceeded(4.5, 5.0)).toBe(false);
    expect(isSoftCapExceeded(5.0, 5.0)).toBe(false);
    expect(isSoftCapExceeded(9.0, 5.0)).toBe(true);
  });
});
