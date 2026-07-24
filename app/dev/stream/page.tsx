import type { Metadata } from "next";
import { Harness } from "./Harness";

/**
 * P5.1 dev harness (Brandon review): replays the four recorded terminal-state
 * transcripts - settled, sentinel decline, server refusal, interrupted - through
 * the identical client path (consumeStream -> turnReducer -> render), so the turn
 * lifecycle can be watched against the v10 mock without spending on the model.
 * Not a production surface: noindex, and it renders the reducer state directly
 * rather than the P5.2/P5.3 chrome.
 */
export const metadata: Metadata = {
  title: "Turn lifecycle harness (dev)",
  robots: { index: false, follow: false },
};

export default function StreamHarnessPage() {
  return <Harness />;
}
