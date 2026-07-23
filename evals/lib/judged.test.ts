import { describe, it, expect } from "vitest";
import { parseJudgeVerdict, type JudgeVerdict } from "./judge";
import {
  answerPasses,
  declineOutcome,
  scoreDecline,
  aggregateAnswers,
  type JudgedRun,
  type AnswerResult,
} from "./judged";
import { computeNoise } from "./noise";
import { DECLINE_SENTINEL } from "../../lib/rag/prompt";

const verdict = (over: Partial<JudgeVerdict> = {}): JudgeVerdict => ({
  grounded: true,
  citations_valid: true,
  complete: true,
  no_fabrication: true,
  reasons: {},
  ...over,
});

describe("parseJudgeVerdict (EVAL-08)", () => {
  it("parses a strict JSON verdict, tolerating surrounding whitespace", () => {
    const v = parseJudgeVerdict(
      '  {"grounded":true,"citations_valid":false,"complete":true,"no_fabrication":true,"reasons":{"citations_valid":"[3] not in list"}}  ',
    );
    expect(v.citations_valid).toBe(false);
    expect(v.reasons.citations_valid).toContain("not in list");
  });

  it("throws on non-JSON output (harness error, never silently scored)", () => {
    expect(() => parseJudgeVerdict("I think the answer is good.")).toThrow(
      /not JSON/,
    );
  });

  it("throws when a required boolean is missing", () => {
    expect(() =>
      parseJudgeVerdict(
        '{"grounded":true,"complete":true,"no_fabrication":true}',
      ),
    ).toThrow(/citations_valid/);
  });
});

describe("answerPasses", () => {
  it("passes only when all four checks are true", () => {
    expect(answerPasses(verdict())).toBe(true);
    expect(answerPasses(verdict({ complete: false }))).toBe(false);
  });
});

describe("declineOutcome + scoreDecline (EVAL-09 two-tier)", () => {
  it("declines via the server gate", () => {
    expect(declineOutcome(true, "")).toEqual({ declined: true, via: "server" });
  });
  it("declines via the sentinel prefix", () => {
    expect(
      declineOutcome(false, `${DECLINE_SENTINEL} The closest topic is X.`),
    ).toEqual({
      declined: true,
      via: "sentinel",
    });
  });
  it("counts a normal answer as not declined", () => {
    expect(declineOutcome(false, "You can do X by...")).toEqual({
      declined: false,
      via: "answered",
    });
  });
  it("scores refuse-expected on decline, answer-expected on answer", () => {
    expect(scoreDecline("refuse", true)).toBe(true);
    expect(scoreDecline("refuse", false)).toBe(false);
    expect(scoreDecline("answer", false)).toBe(true);
    expect(scoreDecline("answer", true)).toBe(false);
  });
});

const ans = (
  id: string,
  passed: boolean,
  v: JudgeVerdict | null,
): AnswerResult => ({
  id,
  passed,
  verdict: v,
  server_refused: v === null,
});

describe("aggregateAnswers", () => {
  it("computes pass rate and per-check counts", () => {
    const run: JudgedRun = {
      answers: [
        ans("a-1", true, verdict()),
        ans("a-2", false, verdict({ citations_valid: false })),
      ],
      refusals: [],
      boundary: [],
    };
    const agg = aggregateAnswers(run);
    expect(agg.pass_rate).toBe(0.5);
    expect(agg.checks.grounded).toBe(2);
    expect(agg.checks.citations_valid).toBe(1);
  });
});

describe("computeNoise (EVAL-10)", () => {
  it("M is the larger of the aggregate spread and one judged check", () => {
    // 4 answerable; run pass rates 1.0, 0.75, 0.75 -> spread 0.25; one check = 0.25.
    const mk = (passed: boolean[]): JudgedRun => ({
      answers: passed.map((p, i) => ans(`a-${i}`, p, verdict({ complete: p }))),
      refusals: [],
      boundary: [],
    });
    const noise = computeNoise([
      mk([true, true, true, true]),
      mk([true, true, true, false]),
      mk([true, true, true, false]),
    ]);
    expect(noise.aggregate_spread).toBeCloseTo(0.25, 10);
    expect(noise.one_check).toBeCloseTo(0.25, 10);
    expect(noise.M).toBeCloseTo(0.25, 10);
    // a-3's `complete` flips across runs -> 1 flipped cell.
    expect(noise.per_check_flips).toBe(1);
  });

  it("M floors at one judged check even when runs agree perfectly", () => {
    const stable: JudgedRun = {
      answers: [ans("a-0", true, verdict()), ans("a-1", true, verdict())],
      refusals: [],
      boundary: [],
    };
    const noise = computeNoise([stable, stable, stable]);
    expect(noise.aggregate_spread).toBe(0);
    expect(noise.M).toBeCloseTo(0.5, 10); // 1/2 answerable
  });
});
