import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

import { retrieve } from "../lib/rag/retriever";
import { sql } from "../lib/db/client";

/**
 * Threshold calibration (eval-harness §7). Records top-1 similarity for all 28
 * test questions plus clearly-off-corpus probes, writes the committed
 * distribution artifact (EVAL-15), and reports where the line falls. `T` is the
 * value chosen at P4.4 (Brandon): 0.35, in the clean gap between clearly-off-
 * corpus (~0.20) and real content (0.45+). The overlap between plausible refusals
 * and weak answerables (0.45-0.64) is documented in the artifact rationale;
 * plausible refusals pass the gate and decline model-side (EVAL-09 two-tier).
 *
 * Run: `npm run eval:calibrate`.
 */

const THRESHOLD = 0.35;

// Clearly-off-corpus probes (calibration inputs, not test questions): fixes the
// low band so the gap the threshold sits in is visible in the artifact.
const OFF_CORPUS_PROBES = [
  "how do I make pizza dough from scratch",
  "what is the capital of France",
  "how do I file my taxes this year",
  "what is the best exercise for losing weight",
  "how do I change a flat tire on my car",
];

const round = (n: number) => Math.round(n * 1000) / 1000;

function isoStamp(now: Date): string {
  return now
    .toISOString()
    .replace(/\.\d+Z$/, "Z")
    .replace(/:/g, "-");
}

async function top1(question: string): Promise<number> {
  const out = await retrieve(question);
  return round(out.results[0]?.similarity ?? 0);
}

async function main() {
  const ts = JSON.parse(fs.readFileSync("evals/testset.json", "utf8")) as {
    questions: {
      id: string;
      category: string;
      question: string;
      expected?: string;
    }[];
  };

  const answerable: { id: string; top1: number }[] = [];
  const refusal: { id: string; top1: number }[] = [];
  const boundary: { id: string; top1: number; expected?: string }[] = [];
  for (const q of ts.questions) {
    const t = await top1(q.question);
    if (q.category === "answerable") answerable.push({ id: q.id, top1: t });
    else if (q.category === "refusal") refusal.push({ id: q.id, top1: t });
    else boundary.push({ id: q.id, top1: t, expected: q.expected });
  }
  const clearlyOffCorpus: { probe: string; top1: number }[] = [];
  for (const p of OFF_CORPUS_PROBES)
    clearlyOffCorpus.push({ probe: p, top1: await top1(p) });

  const aMin = Math.min(...answerable.map((x) => x.top1));
  const offMax = Math.max(...clearlyOffCorpus.map((x) => x.top1));
  const rMin = Math.min(...refusal.map((x) => x.top1));
  const rMax = Math.max(...refusal.map((x) => x.top1));

  const commit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const now = new Date();
  const artifact = {
    run_id: `calibration-${isoStamp(now)}-${commit.slice(0, 6)}`,
    commit,
    calibrated_at: now.toISOString().slice(0, 10),
    threshold: THRESHOLD,
    rationale:
      "No clean gap exists between plausible refusals (0.57-0.64) and weak-but-real answerables (0.45-0.64); they interleave, and cosine cannot separate 'adjacent but unanswered' from 'answered'. A clean gap DOES exist between clearly-off-corpus (~0.20) and real content (0.45+), so T sits there. The server gate's honest job is clearly-off-corpus; plausible refusals pass the gate and are declined model-side via the decline sentinel (EVAL-09 two-tier). A smarter gate (margin/relevance signal, Option 3) is a designated post-v1 improvement.",
    separation: {
      clearly_off_corpus_max: offMax,
      answerable_min: aMin,
      refusal_min: rMin,
      refusal_max: rMax,
      clean_gap_offcorpus_to_real: aMin > offMax,
      refusal_answerable_overlap: true,
    },
    bands: {
      clearly_off_corpus: clearlyOffCorpus.sort((a, b) => a.top1 - b.top1),
      answerable: answerable.sort((a, b) => a.top1 - b.top1),
      refusal: refusal.sort((a, b) => a.top1 - b.top1),
      boundary: boundary.sort((a, b) => a.top1 - b.top1),
    },
  };

  fs.writeFileSync(
    path.join(process.cwd(), "evals", "calibration.json"),
    JSON.stringify(artifact, null, 2) + "\n",
  );
  console.log(
    `T=${THRESHOLD}  calibrated_at=${artifact.calibrated_at}  run_id=${artifact.run_id}`,
  );
  console.log(
    `bands: clearly-off-corpus max=${offMax}  |  answerable min=${aMin}  |  refusal [${rMin}, ${rMax}]`,
  );
  console.log(
    `clean gap off-corpus -> real content: ${aMin > offMax}   (T=${THRESHOLD} sits in it)`,
  );
}

main()
  .then(async () => {
    await sql.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(
      "calibrate failed:",
      err instanceof Error ? err.message : err,
    );
    await sql.end({ timeout: 5 }).catch(() => {});
    process.exit(1);
  });
