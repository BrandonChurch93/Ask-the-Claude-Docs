"use client";

import type { TurnState } from "../../lib/stream/reducer";
import { config } from "../../lib/config";
import styles from "./Ask.module.css";

/**
 * The retrieval rail (ui-ux-spec §9, UX-11). The process story for the LAST query
 * only: stage summary, passing sources, the threshold rule, excluded candidates,
 * and the freshness foot. The rail owns process, the trail owns evidence - no
 * datum in both (the receipt slims when this is open). Visible only while pinned
 * and >=1120px; that is handled in CSS off the shell's data-pin + a media query.
 */
export function Rail({
  state,
  summary,
}: {
  state: TurnState | null;
  summary: { relative: string; pages: number };
}) {
  const foot = (
    <p className={styles.railFoot}>
      corpus synced {summary.relative} · {summary.pages.toLocaleString()} pages
    </p>
  );

  // Retrieval facts are present from `streaming` onward (and on a refusal).
  const hasData =
    state !== null &&
    (state.status === "streaming" ||
      state.status === "settled" ||
      state.status === "refused");

  if (!hasData) {
    return (
      <aside className={styles.rail} aria-label="Retrieval details">
        <div className={styles.railBox}>
          <h2 className={styles.railH2}>Last query · retrieval</h2>
          <p className={styles.railEmpty}>
            {state && state.status === "retrieving"
              ? "Retrieving…"
              : "Ask a question and the retrieval details appear here."}
          </p>
          {foot}
        </div>
      </aside>
    );
  }

  const { sources, nearMisses, receipt } = state;
  const refused = state.status === "refused";
  const settled = state.status === "settled";

  return (
    <aside className={styles.rail} aria-label="Retrieval details">
      <div className={styles.railBox}>
        <h2 className={styles.railH2}>Last query · retrieval</h2>
        <p className={styles.stage}>
          <b>✓</b> embedded · {Math.round(receipt.retrieval.embedMs)} ms
          <br />
          <b>✓</b> searched {receipt.corpusChunks.toLocaleString()} chunks ·{" "}
          {Math.round(receipt.retrieval.queryMs)} ms
          <br />
          <b>✓</b> {sources.length} of {config.retrieval.k}{" "}
          {refused ? "cleared · declined" : "cleared threshold"}
          {settled && (
            <>
              <br />
              <b>✓</b> streamed · {receipt.model}
            </>
          )}
        </p>

        {sources.map((s) => (
          <div key={s.chunkId} className={styles.railSrc}>
            <span>{s.breadcrumb}</span>
            <span className={styles.score}>{s.similarity.toFixed(2)}</span>
          </div>
        ))}

        <div className={styles.railRule}>
          <span>threshold {receipt.threshold ?? "-"}</span>
        </div>

        {nearMisses.map((m) => (
          <div
            key={m.chunkId}
            className={`${styles.railSrc} ${styles.railDim}`}
          >
            <span>
              {m.breadcrumb} <span className={styles.excluded}>excluded</span>
            </span>
            <span className={styles.score}>{m.similarity.toFixed(2)}</span>
          </div>
        ))}

        {foot}
      </div>
    </aside>
  );
}
