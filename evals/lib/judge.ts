import Anthropic from "@anthropic-ai/sdk";

import { env } from "../../lib/env";
import type { TokenUsage } from "../../lib/stream/cost";

/**
 * The judged answer layer (eval-harness §3). A stronger tier than the generator
 * (Sonnet vs Haiku, EVAL-07) scores each answer on four binary checks and
 * returns strict JSON at temperature 0. Unparseable output is a harness error,
 * never silently scored (EVAL-08). This prompt is versioned beside the harness;
 * changing it invalidates baseline comparisons (§5).
 */

export const JUDGE_MODEL = "claude-sonnet-4-6";
export const JUDGE_TEMPERATURE = 0;
export const JUDGE_MAX_TOKENS = 512;

export const JUDGE_CHECKS = [
  "grounded",
  "citations_valid",
  "complete",
  "no_fabrication",
] as const;
export type JudgeCheck = (typeof JUDGE_CHECKS)[number];

export interface JudgeVerdict {
  grounded: boolean;
  citations_valid: boolean;
  complete: boolean;
  no_fabrication: boolean;
  reasons: Partial<Record<JudgeCheck, string>>;
}

export const JUDGE_SYSTEM = `You are a strict evaluator of answers to Claude Code documentation questions. You are given the question, the exact numbered sources the answering model saw, and its answer. Judge four criteria, each strictly true or false:

- grounded: every factual claim in the answer is supported by the cited sources.
- citations_valid: every [n] marker in the answer refers to a source that exists in the list AND that source actually supports the sentence it is attached to.
- complete: the answer addresses what was asked (not a fragment, not a tangent).
- no_fabrication: the answer asserts nothing the sources do not contain, including plausible-sounding additions.

Return ONLY a single JSON object, no prose before or after:
{"grounded":true|false,"citations_valid":true|false,"complete":true|false,"no_fabrication":true|false,"reasons":{"<failed check>":"one short line"}}
Include a key in "reasons" only for checks you marked false.`;

/** Build the judge user turn from the question, the sources block, and the answer. */
export function buildJudgeUserContent(
  question: string,
  sourcesText: string,
  answer: string,
): string {
  return `Question:\n${question}\n\nSources:\n${sourcesText}\n\nAnswer:\n${answer}`;
}

/** Parse the judge's strict-JSON verdict; throw on anything unparseable (EVAL-08). */
export function parseJudgeVerdict(text: string): JudgeVerdict {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match)
    throw new Error(`judge output is not JSON: ${text.slice(0, 160)}`);
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    throw new Error(`judge JSON did not parse: ${match[0].slice(0, 160)}`);
  }
  for (const c of JUDGE_CHECKS) {
    if (typeof raw[c] !== "boolean") {
      throw new Error(
        `judge verdict missing boolean "${c}": ${match[0].slice(0, 160)}`,
      );
    }
  }
  const reasons =
    raw.reasons && typeof raw.reasons === "object"
      ? (raw.reasons as Partial<Record<JudgeCheck, string>>)
      : {};
  return {
    grounded: raw.grounded as boolean,
    citations_valid: raw.citations_valid as boolean,
    complete: raw.complete as boolean,
    no_fabrication: raw.no_fabrication as boolean,
    reasons,
  };
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

/** Call the judge for one answer; return its parsed verdict + the API usage (for
 *  the run artifact's token-math cost estimate, EVAL-13 CI soft cap). */
export async function callJudge(
  question: string,
  sourcesText: string,
  answer: string,
): Promise<{ verdict: JudgeVerdict; usage: TokenUsage }> {
  const msg = await getClient().messages.create({
    model: JUDGE_MODEL,
    max_tokens: JUDGE_MAX_TOKENS,
    temperature: JUDGE_TEMPERATURE,
    system: JUDGE_SYSTEM,
    messages: [
      {
        role: "user",
        content: buildJudgeUserContent(question, sourcesText, answer),
      },
    ],
  });
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return { verdict: parseJudgeVerdict(text), usage: msg.usage };
}
