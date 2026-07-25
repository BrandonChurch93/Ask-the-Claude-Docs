"use client";

import { useEffect, useId, useRef, useState } from "react";
import styles from "./Ask.module.css";

/** The sync eyebrow + freshness popover (ui-ux-spec §3, UX-03). Outside-click and
 *  Escape close it; values are the sync-derived summary (RAG-21). */
export function Eyebrow({
  summary,
}: {
  summary: { relative: string; pages: number; chunks: number; updated: number };
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={styles.stamp}>
      <div className={styles.eyebrowWrap} ref={wrapRef}>
        <button
          className={styles.sync}
          aria-expanded={open}
          aria-controls={popId}
          onClick={() => setOpen((o) => !o)}
        >
          <span className={styles.dot} aria-hidden="true" />
          synced {summary.relative}
        </button>
        <div className={styles.pop} id={popId} hidden={!open}>
          <h3 className={styles.popHead}>Corpus freshness</h3>
          <p className={styles.popBody}>
            Answers come only from a local index of the Claude Code docs, never
            from model memory. The index re-syncs from code.claude.com daily,
            picking up anything that changed.
          </p>
          <p className={styles.popMeta}>
            last sync {summary.relative} · {summary.pages.toLocaleString()}{" "}
            pages · {summary.chunks.toLocaleString()} chunks · {summary.updated}{" "}
            updated
          </p>
        </div>
      </div>
    </div>
  );
}
