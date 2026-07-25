import type { SourcePayload, Receipt } from "./types";

/**
 * Receipt rendering (ui-ux-spec §6.2, A11Y-16). The receipt numbers are the
 * server-measured, usage-derived values (PERF-06, RAG-17); the UI only formats,
 * never computes. Two forms from the same fields: the mono display string and a
 * structured prose string for the accessible name, so a screen-reader user gets
 * the receipt as language, not a punctuated glyph run (A11Y-16). Pure + tested.
 */

export interface ReceiptFields {
  n: number;
  topSim: number | null;
  threshold: number | null;
  ms: number;
  model: string;
  costUsd: number;
}

export function receiptFields(
  sources: SourcePayload[],
  receipt: Receipt,
): ReceiptFields {
  return {
    n: sources.length,
    topSim: sources[0]?.similarity ?? null,
    threshold: receipt.threshold,
    ms: Math.round(receipt.timings.totalMs),
    model: receipt.model,
    costUsd: receipt.costUsd,
  };
}

const sim = (v: number | null) => (v === null ? "-" : v.toFixed(2));
const cost = (v: number) => `$${v.toFixed(4)}`;

/** Unpinned display string: `{n} sources · top {sim} · threshold {T} · {ms} ms · {model} · ${cost}`. */
export function receiptDisplay(f: ReceiptFields): string {
  return [
    `${f.n} sources`,
    `top ${sim(f.topSim)}`,
    `threshold ${f.threshold ?? "-"}`,
    `${f.ms} ms`,
    f.model,
    cost(f.costUsd),
  ].join(" · ");
}

/** Prose accessible name for the receipt (A11Y-16). */
export function receiptProse(f: ReceiptFields): string {
  const parts = [
    `${f.n} ${f.n === 1 ? "source" : "sources"} retrieved`,
    f.topSim === null ? null : `top similarity ${sim(f.topSim)}`,
    f.threshold === null ? null : `threshold ${f.threshold}`,
    `${f.ms} milliseconds`,
    `model ${f.model}`,
    `cost ${cost(f.costUsd)}`,
  ].filter((p): p is string => p !== null);
  return parts.join(", ") + ".";
}
