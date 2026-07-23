import { z } from "zod";

import { retrieve, type ScoredChunk } from "../../../lib/rag/retriever";
import { streamAnswer, selectedModel } from "../../../lib/rag/generator";
import { encodeEvent } from "../../../lib/stream/encode";
import { computeCostUsd } from "../../../lib/stream/cost";
import { isSpendCapReached, recordSpend } from "../../../lib/spend";
import { config } from "../../../lib/config";
import type {
  ServerEvent,
  SourcePayload,
  Receipt,
  ReceiptSkeleton,
  UsagePayload,
} from "../../../lib/stream/types";

/**
 * POST /api/ask, the single mutation path. Validates a `{ question }` body,
 * retrieves, and streams the rag-design §7 protocol (`sources` -> `text`* ->
 * `done`) as SSE. Model, k, threshold, and max_tokens are server-owned; the
 * client sends a question and nothing else (SEC-04). A refusal makes zero
 * generation calls and flushes once after retrieval (RAG-13, PERF-07). Deltas
 * are enqueued as received, never buffered (PERF-08).
 */

// ENG-13: explicit runtime. Node for full SDK + Postgres driver compatibility
// (engineering-standards §6); edge buys nothing since latency is model TTFT.
export const runtime = "nodejs";
// engineering-standards §6: /api/ask is uncached.
export const dynamic = "force-dynamic";

/**
 * The one accepted request shape (SEC-04): `{ question }`, `.strict()`, control
 * characters stripped, non-empty after trim, max 500 characters. No other field
 * is tolerated; every generation parameter is server-owned.
 */
const askRequestSchema = z
  .object({
    question: z
      .string()
      .max(5000, "question is too long")
      .transform((s) => s.replace(/[\u0000-\u001F\u007F]/g, "").trim())
      .pipe(
        z
          .string()
          .min(1, "question must not be empty")
          .max(500, "question must be at most 500 characters"),
      ),
  })
  .strict();

// ui-ux-spec §8 spend-cap copy (SEC-11: render the specified state, not a raw error).
const SPEND_CAP_MESSAGE =
  "This demo caps its own spending for the day. It resets at midnight UTC. The eval scores and source links still work while it rests.";

function jsonError(status: number, type: string, message: string): Response {
  return new Response(JSON.stringify({ error: { type, message } }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store", // ENG-14
    },
  });
}

/** A scored chunk as the snippet-only `sources`-event payload (PERF-12). The
 *  chunk's `headingAnchor` is already the full deep link (`pageUrl#slug`). */
function toSourcePayload(c: ScoredChunk): SourcePayload {
  return {
    chunkId: c.chunkId,
    breadcrumb: c.breadcrumb,
    url: c.headingAnchor,
    similarity: c.similarity,
    snippet: c.content.slice(0, config.payload.snippetChars),
  };
}

export async function POST(req: Request): Promise<Response> {
  // ENG-07: validate input before any other logic; typed 400 on failure.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(
      400,
      "invalid_request",
      "Request body must be valid JSON.",
    );
  }
  const parsed = askRequestSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid request.";
    return jsonError(400, "invalid_request", message);
  }
  const question = parsed.data.question;

  // SEC-10: global spend cap, checked before any generation and fail-closed.
  // A reached cap or an unreadable/unwritable counter both reject with no
  // generation call (ui-ux-spec §8 cap copy). The per-IP limiter is separate,
  // in middleware.ts (fail-open).
  try {
    if (await isSpendCapReached()) {
      return jsonError(429, "spend_cap", SPEND_CAP_MESSAGE);
    }
  } catch (err) {
    console.error(
      "spend cap check failed; failing closed:",
      err instanceof Error ? err.message : "unknown error",
    );
    return jsonError(429, "spend_cap", SPEND_CAP_MESSAGE);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ServerEvent) =>
        controller.enqueue(encoder.encode(encodeEvent(event)));

      let textStarted = false;
      // PERF-06 / PERF §3: measure the budgeted segments route-side from the
      // request-validated point (t0), not from the retriever's internal timer.
      const t0 = performance.now();
      let firstTokenAt: number | null = null;
      try {
        const outcome = await retrieve(question);

        const skeleton: ReceiptSkeleton = {
          model: selectedModel(),
          calibrated: outcome.calibrated,
          threshold: outcome.threshold,
          refused: outcome.refused,
        };

        // retrieval_ms: validated → sources emitted (measured at the emit point).
        const retrievalMs = performance.now() - t0;
        // First event, before any generated token (RAG-16). Snippet-only (PERF-12).
        send({
          type: "sources",
          sources: outcome.contextSet.map(toSourcePayload),
          nearMisses: outcome.nearMisses.map(toSourcePayload),
          receipt: skeleton,
        });

        if (outcome.refused) {
          // RAG-13 / PERF-07: no generation call; one flush after retrieval.
          // totalMs here is PERF §3's refusal round-trip.
          const receipt: Receipt = {
            ...skeleton,
            timings: {
              embedMs: outcome.timings.embedMs,
              queryMs: outcome.timings.queryMs,
              retrievalMs,
              ttftMs: null,
              generationMs: 0,
              totalMs: performance.now() - t0,
            },
            usage: null,
            costUsd: 0,
          };
          send({ type: "done", receipt });
          controller.close();
          return;
        }

        const gen = streamAnswer(question, outcome.contextSet);
        for await (const ev of gen) {
          if (
            ev.type === "content_block_delta" &&
            ev.delta.type === "text_delta"
          ) {
            if (firstTokenAt === null) firstTokenAt = performance.now(); // ttft
            textStarted = true;
            send({ type: "text", delta: ev.delta.text }); // PERF-08: no buffering
          }
        }
        const final = await gen.finalMessage();
        const doneAt = performance.now();
        const ttftMs = firstTokenAt !== null ? firstTokenAt - t0 : null;
        const generationMs = firstTokenAt !== null ? doneAt - firstTokenAt : 0;

        const usage: UsagePayload | null = final.usage
          ? {
              inputTokens: final.usage.input_tokens,
              outputTokens: final.usage.output_tokens,
              cacheCreationInputTokens:
                final.usage.cache_creation_input_tokens ?? 0,
              cacheReadInputTokens: final.usage.cache_read_input_tokens ?? 0,
            }
          : null;

        const receipt: Receipt = {
          ...skeleton,
          timings: {
            embedMs: outcome.timings.embedMs,
            queryMs: outcome.timings.queryMs,
            retrievalMs,
            ttftMs,
            generationMs,
            totalMs: doneAt - t0,
          },
          usage,
          costUsd: computeCostUsd(skeleton.model, final.usage ?? null),
        };
        send({ type: "done", receipt });
        // SEC-10: accumulate this request's real cost into the daily counter.
        // Best-effort (the spend already happened; writability was proven at the
        // pre-generation check) and loud on failure.
        try {
          await recordSpend(receipt.costUsd);
        } catch (err) {
          console.error(
            "spend accumulation write failed:",
            err instanceof Error ? err.message : "unknown error",
          );
        }
        controller.close();
      } catch (err) {
        // Log length/outcome, never the question text (SEC-14) and no internals
        // to the client (SEC-02). The client renders the error state (UX §8).
        console.error(
          "ask stream failed:",
          err instanceof Error ? err.message : "unknown error",
        );
        send({
          type: "error",
          message: textStarted
            ? "The answer was interrupted. What streamed is above; nothing after it was lost, because nothing after it arrived."
            : "Something went wrong reaching the model. Your question wasn't charged. Try again.",
          retryable: true,
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store", // ENG-14
      Connection: "keep-alive",
    },
  });
}
