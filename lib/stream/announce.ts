import type { TurnState } from "./reducer";
import { DECLINE_SENTINEL } from "../rag/prompt";

/**
 * Status-region announcements (accessibility.md §4, ui-ux-spec §13). The exact,
 * binding interpunct strings for each turn-state transition, announced through
 * one visually-hidden aria-live="polite" region (A11Y-11/14). The token stream is
 * never announced; only these transitions are. Pure, so the exact copy is unit-
 * testable and can never drift from §13.
 *
 * A model-side decline (settled + the decline sentinel) announces the declined
 * form with "{n} sources shown" rather than the server refusal's "near-misses",
 * since a model decline reasoned over real sources (Tier 2, parallel to §13).
 */
export function announce(state: TurnState | null): string {
  if (!state) return "";
  switch (state.status) {
    case "idle":
      return "";
    case "retrieving":
      return "Searching the docs";
    case "streaming":
      return `${state.sources.length} sources found, generating answer`;
    case "settled":
      return state.text.startsWith(DECLINE_SENTINEL)
        ? `Not covered by the docs · declined, ${state.sources.length} sources shown`
        : `Answer complete, ${state.sources.length} sources cited`;
    case "refused":
      return `Not covered by the docs · declined, ${state.nearMisses.length} near-misses shown`;
    case "errored":
      return "Answer interrupted · partial answer preserved, retry available";
  }
}
