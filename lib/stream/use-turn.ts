"use client";

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useSyncExternalStore,
} from "react";

import type { ServerEvent } from "./types";
import {
  turnReducer,
  initialTurnState,
  type TurnState,
  type TurnAction,
} from "./reducer";
import { buildChoreography, CHOREO_MIN_MS } from "./choreography";
import { consumeStream } from "./stream-client";
import { REQUEST_FAILED } from "./messages";

/**
 * The client wiring for one turn (ENG-16, §7): a single `useReducer` over the
 * turn state machine, fed by a transport `driver`. The choreography scheduler is
 * bound to the real `sources` event (UX-05) - when it arrives, the stages are
 * revealed one at a time at the 200ms minimum (instantly under reduced motion),
 * which is a timer side-effect, not a state-derivation chain. Busy is derived
 * straight off the reducer status, so the dock's disabled state cannot strand
 * (UX-12): every terminal state (`settled|refused|errored`, and the initial
 * `idle`) is non-busy by construction.
 */

/** A transport: run the turn, calling `onEvent` for each server event. */
export type TurnDriver = (
  question: string,
  onEvent: (event: ServerEvent) => void,
) => Promise<void>;

/** The production transport: POST the question and consume the SSE stream. */
export const fetchDriver: TurnDriver = async (question, onEvent) => {
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok || !res.body) {
    onEvent({ type: "error", message: REQUEST_FAILED, retryable: true });
    return;
  }
  await consumeStream(res.body, onEvent);
};

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Subscribe to the reduced-motion preference without effect-driven setState. */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(REDUCED_MOTION_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false, // server snapshot: assume motion allowed
  );
}

export interface UseTurn {
  state: TurnState;
  busy: boolean;
  submit: (question: string) => void;
}

export function useTurn(driver: TurnDriver = fetchDriver): UseTurn {
  const [state, dispatch] = useReducer(turnReducer, initialTurnState);
  const reduceMotion = usePrefersReducedMotion();
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  // Pace the choreography off the real `sources` event (UX-05): reveal each stage
  // after the 200ms minimum, plus one final tick to leave `retrieving`. Under
  // reduced motion the reveals fire synchronously (instant state presentation).
  const startChoreo = useCallback(
    (stageCount: number) => {
      const ticks = stageCount + 1;
      if (reduceMotion) {
        for (let i = 0; i < ticks; i++)
          dispatch({ type: "choreoReveal" } as TurnAction);
        return;
      }
      for (let i = 1; i <= ticks; i++)
        timersRef.current.push(
          setTimeout(
            () => dispatch({ type: "choreoReveal" }),
            i * CHOREO_MIN_MS,
          ),
        );
    },
    [reduceMotion],
  );

  // Clear any pending reveal timers on unmount.
  useEffect(() => clearTimers, [clearTimers]);

  const submit = useCallback(
    (question: string) => {
      const q = question.trim();
      if (!q) return; // empty input is a no-op (§5)
      clearTimers();
      dispatch({ type: "submit" });
      driver(q, (event) => {
        dispatch(event);
        if (event.type === "sources")
          startChoreo(buildChoreography(event).length);
      }).catch(() => {
        // Transport threw before/around streaming: a non-stream failure (§8).
        dispatch({ type: "error", message: REQUEST_FAILED, retryable: true });
      });
    },
    [driver, clearTimers, startChoreo],
  );

  const busy = state.status === "retrieving" || state.status === "streaming";
  return { state, busy, submit };
}
