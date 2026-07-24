import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * CI judged-spend soft cap (eval-harness §5-6, Tier 2 extension of EVAL-13). Each
 * committed run artifact carries a token-math `estimated_cost_usd`; the calendar
 * month's accumulation is the sum over that month's artifacts. When it exceeds
 * `config.evals.ciMonthlySoftCapUsd`, an auto-triggered judged job posts a loud
 * warning and defers to manual dispatch - a soft stop against flaky-rerun and
 * iteration-day pileups, never a hard gate on a real regression check.
 *
 * The pure summation is separated from the filesystem read so the cap logic is
 * unit-testable. Only committed artifacts are counted (main-only commit policy,
 * P4.6 decision 1A), so PR-time judged spend is not accumulated here; PR judged
 * runs are already rare by the EVAL-13 path filter.
 */

export interface CostEntry {
  run_id: string;
  estimated_cost_usd: number;
}

/** The `YYYY-MM` prefix of a run_id (run_id starts `2026-07-23T...`). */
export function monthOf(runId: string): string {
  return runId.slice(0, 7);
}

/** Sum the estimated cost of entries whose run_id falls in the given `YYYY-MM`. */
export function sumMonthCost(entries: CostEntry[], yyyymm: string): number {
  return entries
    .filter((e) => monthOf(e.run_id) === yyyymm)
    .reduce((acc, e) => acc + (e.estimated_cost_usd || 0), 0);
}

/** True once the month's accumulation has exceeded the soft cap. */
export function isSoftCapExceeded(
  monthCostUsd: number,
  capUsd: number,
): boolean {
  return monthCostUsd > capUsd;
}

/** Read every run artifact under `runsDir` into cost entries (missing dir = none). */
export function readRunCostEntries(runsDir: string): CostEntry[] {
  let files: string[];
  try {
    files = readdirSync(runsDir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const entries: CostEntry[] = [];
  for (const f of files) {
    try {
      const raw = JSON.parse(
        readFileSync(path.join(runsDir, f), "utf8"),
      ) as Partial<CostEntry>;
      if (typeof raw.run_id === "string")
        entries.push({
          run_id: raw.run_id,
          estimated_cost_usd:
            typeof raw.estimated_cost_usd === "number"
              ? raw.estimated_cost_usd
              : 0,
        });
    } catch {
      // A malformed artifact contributes 0 rather than crashing the cap check.
    }
  }
  return entries;
}
