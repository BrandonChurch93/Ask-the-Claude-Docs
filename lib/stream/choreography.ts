import type { SourcesEvent } from "./types";

/**
 * The retrieving choreography (ui-ux-spec §5): an ordered narration of the ONE
 * `sources` event's payload - embed + search timings, the passing sources one by
 * one, the threshold rule, then the excluded near-misses. Never a second data
 * source (§5): every value here comes off the `sources` event. Pure, so the stage
 * sequence is unit-testable; the reducer stores the result and a scheduler reveals
 * the stages one at a time with a 200ms minimum (UX-05).
 */

/** The per-stage minimum display time so a fast pipeline still reads (UX-05). */
export const CHOREO_MIN_MS = 200;

export type ChoreoStage =
  | { kind: "embedded"; ms: number }
  | { kind: "searched"; corpusChunks: number; ms: number }
  | { kind: "source"; breadcrumb: string; similarity: number }
  | { kind: "threshold"; threshold: number | null; noneCleared: boolean }
  | { kind: "excluded"; breadcrumb: string; similarity: number };

/** Narrate the `sources` event into its ordered choreography stages (§5). */
export function buildChoreography(ev: SourcesEvent): ChoreoStage[] {
  const { sources, nearMisses, receipt } = ev;
  return [
    { kind: "embedded", ms: Math.round(receipt.retrieval.embedMs) },
    {
      kind: "searched",
      corpusChunks: receipt.corpusChunks,
      ms: Math.round(receipt.retrieval.queryMs),
    },
    ...sources.map((s): ChoreoStage => ({
      kind: "source",
      breadcrumb: s.breadcrumb,
      similarity: s.similarity,
    })),
    {
      kind: "threshold",
      threshold: receipt.threshold,
      noneCleared: sources.length === 0,
    },
    ...nearMisses.map((s): ChoreoStage => ({
      kind: "excluded",
      breadcrumb: s.breadcrumb,
      similarity: s.similarity,
    })),
  ];
}
