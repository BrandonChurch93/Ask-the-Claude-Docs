import { readFileSync } from "node:fs";
import path from "node:path";

import type Anthropic from "@anthropic-ai/sdk";

import { retrieve } from "../../lib/rag/retriever";
import { streamAnswer } from "../../lib/rag/generator";
import { renderSources, DECLINE_SENTINEL } from "../../lib/rag/prompt";
import { callJudge, JUDGE_CHECKS, type JudgeVerdict } from "./judge";

/**
 * The judged answer layer + two-tier refusal scoring (eval-harness §3). For each
 * answerable that clears retrieval, run the production query path and judge the
 * answer on four binary checks. Refusals and refuse-boundary questions score
 * deterministically two-tier: pass = the server gate declined OR the response
 * begins with the decline sentinel (EVAL-09). The pure scoring helpers are unit-
 * testable; the runner performs the live generation + judge calls (the sanctioned
 * eval spend, ENG-17).
 */

export interface AnswerResult {
  id: string;
  passed: boolean;
  verdict: JudgeVerdict | null; // null when server-refused (nothing to judge)
  server_refused: boolean;
}

export type DeclineVia = "server" | "sentinel" | "answered";

export interface DeclineResult {
  id: string;
  category: "refusal" | "boundary";
  expected?: string;
  passed: boolean;
  declined: boolean;
  via: DeclineVia;
}

export interface JudgedRun {
  answers: AnswerResult[];
  refusals: DeclineResult[];
  boundary: DeclineResult[];
}

/** An answer passes only if all four binary checks are true. */
export function answerPasses(v: JudgeVerdict): boolean {
  return v.grounded && v.citations_valid && v.complete && v.no_fabrication;
}

/** Two-tier decline detection (EVAL-09): server gate OR the exact sentinel prefix. */
export function declineOutcome(
  serverRefused: boolean,
  text: string,
): { declined: boolean; via: DeclineVia } {
  if (serverRefused) return { declined: true, via: "server" };
  if (text.startsWith(DECLINE_SENTINEL))
    return { declined: true, via: "sentinel" };
  return { declined: false, via: "answered" };
}

/** Score a refusal/boundary question: refuse-expected passes when it declined; answer-expected passes when it answered. */
export function scoreDecline(
  expected: string | undefined,
  declined: boolean,
): boolean {
  return expected === "answer" ? !declined : declined;
}

interface TestQuestion {
  id: string;
  category: string;
  question: string;
  gold_chunks: string[];
  expected?: string;
}

async function generateText(
  question: string,
  sources: { content: string }[],
): Promise<string> {
  const stream = streamAnswer(question, sources);
  const msg = await stream.finalMessage();
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** One full judged pass over the test set (live generation + judge). */
export async function runJudgedEval(): Promise<JudgedRun> {
  const testset = JSON.parse(
    readFileSync(path.join(process.cwd(), "evals", "testset.json"), "utf8"),
  ) as { questions: TestQuestion[] };

  const answers: AnswerResult[] = [];
  const refusals: DeclineResult[] = [];
  const boundary: DeclineResult[] = [];

  for (const q of testset.questions) {
    const outcome = await retrieve(q.question);

    if (q.category === "answerable") {
      if (outcome.refused) {
        answers.push({
          id: q.id,
          passed: false,
          verdict: null,
          server_refused: true,
        });
        continue;
      }
      const answer = await generateText(q.question, outcome.contextSet);
      const sourcesText = renderSources(outcome.contextSet);
      const verdict = await callJudge(q.question, sourcesText, answer);
      answers.push({
        id: q.id,
        passed: answerPasses(verdict),
        verdict,
        server_refused: false,
      });
      continue;
    }

    // refusal or boundary: two-tier decline detection.
    const text = outcome.refused
      ? ""
      : await generateText(q.question, outcome.contextSet);
    const { declined, via } = declineOutcome(outcome.refused, text);
    const rec: DeclineResult = {
      id: q.id,
      category: q.category as "refusal" | "boundary",
      expected: q.expected,
      passed: scoreDecline(q.expected, declined),
      declined,
      via,
    };
    (q.category === "refusal" ? refusals : boundary).push(rec);
  }

  return { answers, refusals, boundary };
}

export interface AnswerAggregate {
  pass_rate: number;
  count: number;
  checks: Record<(typeof JUDGE_CHECKS)[number], number>;
}

/** Aggregate one judged run's answer layer: pass rate + per-check pass counts. */
export function aggregateAnswers(run: JudgedRun): AnswerAggregate {
  const n = run.answers.length;
  const passing = run.answers.filter((a) => a.passed).length;
  const checks = {
    grounded: 0,
    citations_valid: 0,
    complete: 0,
    no_fabrication: 0,
  };
  for (const a of run.answers) {
    if (!a.verdict) continue;
    for (const c of JUDGE_CHECKS) if (a.verdict[c]) checks[c]++;
  }
  return { pass_rate: n ? passing / n : 0, count: n, checks };
}
