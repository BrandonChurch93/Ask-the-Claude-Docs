import type {
  ServerEvent,
  SourcePayload,
  ReceiptSkeleton,
  Receipt,
} from "./types";

/**
 * The single turn state machine (ENG-16). Its states match the surface states
 * named in ui-ux-spec §5 one-to-one: `idle -> retrieving -> streaming ->
 * settled | refused | errored`. This is the P3.3 skeleton: correct transitions
 * over the §7 events, with no choreography timing yet; P5.1 layers the paced,
 * 200ms-minimum version on top of these same transitions.
 */
export type TurnState =
  | { status: "idle" }
  | { status: "retrieving" }
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

/** The client `submit` action plus every server event; all discriminate on `type`. */
export type TurnAction = { type: "submit" } | ServerEvent;

export const initialTurnState: TurnState = { status: "idle" };

export function turnReducer(state: TurnState, action: TurnAction): TurnState {
  switch (action.type) {
    case "submit":
      return { status: "retrieving" };

    case "sources":
      // Sources always arrive before any text delta (RAG-16); generation phase
      // begins. A refusal is a zero-length stream that resolves at `done`.
      return {
        status: "streaming",
        sources: action.sources,
        nearMisses: action.nearMisses,
        receipt: action.receipt,
        text: "",
      };

    case "text":
      if (state.status !== "streaming") return state;
      return { ...state, text: state.text + action.delta };

    case "done":
      if (state.status !== "streaming") return state;
      if (action.receipt.refused) {
        return {
          status: "refused",
          sources: state.sources,
          nearMisses: state.nearMisses,
          receipt: action.receipt,
        };
      }
      return {
        status: "settled",
        sources: state.sources,
        nearMisses: state.nearMisses,
        receipt: action.receipt,
        text: state.text,
      };

    case "error":
      return {
        status: "errored",
        message: action.message,
        retryable: action.retryable,
        text: state.status === "streaming" ? state.text : "",
      };

    default:
      return state;
  }
}
