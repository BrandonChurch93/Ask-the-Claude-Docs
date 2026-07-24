import type {
  ServerEvent,
  SourcePayload,
  ReceiptSkeleton,
  Receipt,
} from "./types";
import { buildChoreography, type ChoreoStage } from "./choreography";

/**
 * The single turn state machine (ENG-16, UX-06). Its states match ui-ux-spec §5
 * one-to-one: `idle -> retrieving -> streaming -> settled | refused | errored`,
 * and they are the only source of UI state for a turn.
 *
 * P5.1 layers the choreography onto the P3.3 skeleton. On `sources`, the turn
 * enters the choreography: the stages (a narration of that one event, §5) are
 * built and revealed one at a time by a 200ms-minimum scheduler dispatching
 * `choreoReveal`. Text deltas that arrive during the choreography are held in a
 * buffer, and a `done` that arrives is held as `pending`, so the answer never
 * renders before the choreography has played; when the last stage's minimum has
 * elapsed the turn advances to `streaming` (flushing the buffer) or straight to a
 * terminal state if `done` already arrived. Interruption preserves partial text
 * (PERF-09).
 */

interface ChoreoView {
  stages: ChoreoStage[];
  /** How many stages are currently visible (0..stages.length). */
  revealed: number;
  sources: SourcePayload[];
  nearMisses: SourcePayload[];
  skeleton: ReceiptSkeleton;
}

export type TurnState =
  | { status: "idle" }
  | {
      status: "retrieving";
      /** Null until the `sources` event; then the choreography narration. */
      choreo: ChoreoView | null;
      /** Text deltas received during the choreography, flushed when it completes. */
      buffer: string;
      /** A `done` receipt that arrived during the choreography, applied on completion. */
      pending: Receipt | null;
    }
  | {
      status: "streaming";
      sources: SourcePayload[];
      nearMisses: SourcePayload[];
      receipt: ReceiptSkeleton;
      text: string;
    }
  | {
      status: "settled";
      sources: SourcePayload[];
      nearMisses: SourcePayload[];
      receipt: Receipt;
      text: string;
    }
  | {
      status: "refused";
      sources: SourcePayload[];
      nearMisses: SourcePayload[];
      receipt: Receipt;
    }
  | {
      status: "errored";
      message: string;
      retryable: boolean;
      /** Text streamed before the failure, preserved as-is (PERF-09). */
      text: string;
    };

/** Client actions: `submit`, the scheduler's `choreoReveal`, and every server event. */
export type TurnAction =
  { type: "submit" } | { type: "choreoReveal" } | ServerEvent;

export const initialTurnState: TurnState = { status: "idle" };

/** Resolve a completed generation to its terminal state (refusal has no text). */
function settle(
  sources: SourcePayload[],
  nearMisses: SourcePayload[],
  receipt: Receipt,
  text: string,
): TurnState {
  if (receipt.refused)
    return { status: "refused", sources, nearMisses, receipt };
  return { status: "settled", sources, nearMisses, receipt, text };
}

export function turnReducer(state: TurnState, action: TurnAction): TurnState {
  switch (action.type) {
    case "submit":
      return { status: "retrieving", choreo: null, buffer: "", pending: null };

    case "sources": {
      // Sources always arrive before any text delta (RAG-16); the choreography
      // begins. A refusal is a zero-length stream that resolves at `done`.
      if (state.status !== "retrieving") return state;
      return {
        ...state,
        choreo: {
          stages: buildChoreography(action),
          revealed: 0,
          sources: action.sources,
          nearMisses: action.nearMisses,
          skeleton: action.receipt,
        },
      };
    }

    case "choreoReveal": {
      if (state.status !== "retrieving" || !state.choreo) return state;
      const { revealed, stages, sources, nearMisses, skeleton } = state.choreo;
      if (revealed < stages.length) {
        return {
          ...state,
          choreo: { ...state.choreo, revealed: revealed + 1 },
        };
      }
      // Every stage has shown for its minimum; leave `retrieving`.
      if (state.pending)
        return settle(sources, nearMisses, state.pending, state.buffer);
      return {
        status: "streaming",
        sources,
        nearMisses,
        receipt: skeleton,
        text: state.buffer,
      };
    }

    case "text":
      if (state.status === "retrieving")
        return { ...state, buffer: state.buffer + action.delta };
      if (state.status === "streaming")
        return { ...state, text: state.text + action.delta };
      return state;

    case "done":
      if (state.status === "streaming")
        return settle(
          state.sources,
          state.nearMisses,
          action.receipt,
          state.text,
        );
      // Arrived mid-choreography: hold it and settle when the choreography ends.
      if (state.status === "retrieving")
        return { ...state, pending: action.receipt };
      return state;

    case "error":
      return {
        status: "errored",
        message: action.message,
        retryable: action.retryable,
        text:
          state.status === "streaming"
            ? state.text
            : state.status === "retrieving"
              ? state.buffer
              : "",
      };

    default:
      return state;
  }
}
