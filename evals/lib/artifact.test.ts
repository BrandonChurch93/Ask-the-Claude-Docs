import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { writeArtifact, type RunArtifact } from "./artifact";

/**
 * writeArtifact's §8 latest.json contract: a full (judged) run updates latest.json;
 * a retrieval-only run records its own run artifact but must NOT clobber the last
 * full latest.json (EVAL-16). Verified against a temp evals dir via the `evalsDir`
 * seam - no touching the repo's committed artifacts.
 */

const baseArtifact = (runId: string): RunArtifact => ({
  run_id: runId,
  commit: "abc123",
  config_snapshot: {
    k: 5,
    threshold: {
      status: "CALIBRATED",
      value: 0.35,
      calibratedAt: "2026-07-23",
      calibrationRunId: "x",
    },
    excluded_page_patterns: [],
    embedding_model: "text-embedding-3-small",
    generation_model: "claude-haiku-4-5",
    judge_model: "claude-sonnet-4-6",
  },
  retrieval: {
    hit_at_5: 0.85,
    mrr: 0.7,
    answerable_count: 20,
    per_question: [],
  },
});

const fullArtifact = (runId: string): RunArtifact => ({
  ...baseArtifact(runId),
  answers: {
    pass_rate: 0.9,
    count: 20,
    checks: { grounded: 20 },
    noise_margin: 0.05,
    per_question: [],
  },
});

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "artifact-test-"));
  mkdirSync(path.join(dir, "runs"), { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("writeArtifact latest.json contract (§8, EVAL-16)", () => {
  it("a retrieval-only run writes its run artifact but leaves latest.json untouched", () => {
    const latest = path.join(dir, "latest.json");
    writeFileSync(latest, "SENTINEL");

    const { runPath, latestUpdated } = writeArtifact(
      baseArtifact("2026-07-24T00-00-00Z-aaaaaa"),
      dir,
    );

    expect(existsSync(runPath)).toBe(true); // run artifact written
    expect(latestUpdated).toBe(false);
    expect(readFileSync(latest, "utf8")).toBe("SENTINEL"); // untouched
  });

  it("a full run updates latest.json", () => {
    const latest = path.join(dir, "latest.json");
    writeFileSync(latest, "SENTINEL");

    const { latestUpdated } = writeArtifact(
      fullArtifact("2026-07-24T00-00-01Z-bbbbbb"),
      dir,
    );

    expect(latestUpdated).toBe(true);
    const written = JSON.parse(readFileSync(latest, "utf8")) as RunArtifact;
    expect(written.answers?.pass_rate).toBe(0.9);
  });

  it("a retrieval-only run does not create latest.json when none exists", () => {
    writeArtifact(baseArtifact("2026-07-24T00-00-02Z-cccccc"), dir);
    expect(existsSync(path.join(dir, "latest.json"))).toBe(false);
  });
});
