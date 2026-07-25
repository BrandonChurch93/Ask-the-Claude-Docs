import type { Page } from "@playwright/test";
import { encodeEvent } from "../../lib/stream/encode";
import { TRANSCRIPTS } from "../../lib/stream/transcripts";

/**
 * e2e SSE interception (ENG-17: zero model spend). Reuses the P5.1 recorded
 * transcripts + the real encoder to serve /api/ask a canned event stream, so the
 * golden paths run against real UI and a stubbed model. The `interrupted`
 * transcript omits `done`, so the client synthesizes the PERF-09 interruption.
 */
export type TranscriptId = "settled" | "sentinel" | "refusal" | "interrupted";

export function sseBody(id: TranscriptId): string {
  const t = TRANSCRIPTS.find((x) => x.id === id);
  if (!t) throw new Error(`no transcript: ${id}`);
  return t.steps.map((s) => encodeEvent(s.event)).join("");
}

/** Intercept POST /api/ask and fulfill it with the canned SSE for `id`. */
export async function mockAsk(page: Page, id: TranscriptId): Promise<void> {
  await page.route("**/api/ask", (route) =>
    route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
      body: sseBody(id),
    }),
  );
}

/** Submit a question through the dock. */
export async function ask(page: Page, question: string): Promise<void> {
  await page.getByLabel("Ask a question").fill(question);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
}
