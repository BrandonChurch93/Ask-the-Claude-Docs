import type { ServerEvent, ReceiptSkeleton, Receipt } from "./types";
import { DECLINE_SENTINEL } from "../rag/prompt";

/**
 * Recorded SSE transcripts for the P5.1 dev harness: one per terminal state, so
 * the reducer + stream client can be watched against the mock without spending on
 * the model. Each is a real `ServerEvent` sequence with inter-event delays; the
 * harness encodes them onto a ReadableStream and runs them through the identical
 * client path (consumeStream -> reducer), including the interruption transcript
 * that ends without `done` so PERF-09 fires for real. These are fixtures, not the
 * production data path.
 */

export interface TranscriptStep {
  event: ServerEvent;
  /** Delay before this event, ms (scaled by the harness; 0 under reduced motion). */
  delayMs: number;
}

export interface Transcript {
  id: "settled" | "sentinel" | "refusal" | "interrupted";
  label: string;
  question: string;
  steps: TranscriptStep[];
}

const src = (
  chunkId: string,
  breadcrumb: string,
  similarity: number,
  snippet: string,
) => ({
  chunkId,
  breadcrumb,
  url: "https://code.claude.com/docs",
  similarity,
  snippet,
});

const skeleton = (refused: boolean, corpusChunks = 3214): ReceiptSkeleton => ({
  model: "claude-haiku-4-5",
  calibrated: true,
  threshold: 0.35,
  refused,
  retrieval: { embedMs: 12, queryMs: 41 },
  corpusChunks,
});

const receipt = (refused: boolean): Receipt => ({
  ...skeleton(refused),
  timings: {
    embedMs: 12,
    queryMs: 41,
    retrievalMs: 66,
    ttftMs: refused ? null : 190,
    generationMs: refused ? 0 : 240,
    totalMs: refused ? 66 : 430,
  },
  usage: refused
    ? null
    : {
        inputTokens: 1449,
        outputTokens: 239,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      },
  costUsd: refused ? 0 : 0.002644,
});

/** Split a body into word-ish deltas so the stream reads like a real one. */
function textSteps(body: string, perWordMs = 24): TranscriptStep[] {
  return body.split(/(?<=\s)/).map((delta) => ({
    event: { type: "text", delta },
    delayMs: perWordMs,
  }));
}

const answerSources = [
  src(
    "hooks#pretooluse",
    "Hooks reference › PreToolUse",
    0.61,
    "PreToolUse runs after Claude creates tool parameters and before the tool call…",
  ),
  src(
    "hooks#exit-codes",
    "Hooks reference › Exit codes",
    0.58,
    "Exit code 2 blocks the tool call and returns stderr to the model…",
  ),
];
const nearMisses = [
  src(
    "hooks#matchers",
    "Hooks reference › Matchers",
    0.41,
    "Matchers scope a hook to specific tools…",
  ),
  src(
    "settings#hooks",
    "Settings › Hook configuration",
    0.39,
    "Hooks are configured per matcher in settings…",
  ),
];

export const TRANSCRIPTS: Transcript[] = [
  {
    id: "settled",
    label: "Settled (cited answer)",
    question: "Can hooks block a tool call before it runs?",
    steps: [
      {
        event: {
          type: "sources",
          sources: answerSources,
          nearMisses,
          receipt: skeleton(false),
        },
        delayMs: 120,
      },
      ...textSteps(
        "Yes. A PreToolUse hook runs before Claude Code executes any tool call, and its exit code decides what happens next [1]. Exiting with code 2 blocks the call entirely and feeds your stderr back to the model [2].",
      ),
      { event: { type: "done", receipt: receipt(false) }, delayMs: 30 },
    ],
  },
  {
    id: "sentinel",
    label: "Sentinel decline (model-side)",
    question: "What is the airspeed velocity of an unladen swallow?",
    steps: [
      {
        event: {
          type: "sources",
          sources: [
            src(
              "intro",
              "Getting started › Overview",
              0.44,
              "A weakly-related passage…",
            ),
          ],
          nearMisses: nearMisses.slice(0, 1),
          receipt: skeleton(false),
        },
        delayMs: 120,
      },
      ...textSteps(
        `${DECLINE_SENTINEL} The retrieved sections are about Claude Code, not that.`,
      ),
      { event: { type: "done", receipt: receipt(false) }, delayMs: 30 },
    ],
  },
  {
    id: "refusal",
    label: "Server refusal (below threshold)",
    question: "How do I fine-tune Claude on my own data?",
    steps: [
      {
        event: {
          type: "sources",
          sources: [],
          nearMisses,
          receipt: skeleton(true),
        },
        delayMs: 120,
      },
      { event: { type: "done", receipt: receipt(true) }, delayMs: 40 },
    ],
  },
  {
    id: "interrupted",
    label: "Interrupted (done never arrives)",
    question: "Can hooks block a tool call before it runs?",
    steps: [
      {
        event: {
          type: "sources",
          sources: answerSources,
          nearMisses,
          receipt: skeleton(false),
        },
        delayMs: 120,
      },
      ...textSteps(
        "Yes. A PreToolUse hook runs before Claude Code executes any tool call, and its exit code",
      ),
      // No `done`: the harness closes the stream here, so the client synthesizes
      // the PERF-09 interruption.
    ],
  },
];

/** Does a settled answer's text read as a model-side decline (§7 two species)? */
export function isSentinelDecline(text: string): boolean {
  return text.startsWith(DECLINE_SENTINEL);
}
