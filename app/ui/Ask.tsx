"use client";

import { useEffect, useId, useRef, useState } from "react";

import { useTurn } from "../../lib/stream/use-turn";
import type { TurnState } from "../../lib/stream/reducer";
import { SUGGESTIONS } from "../../lib/suggestions";
import styles from "./Ask.module.css";

/**
 * The interactive landing (ui-ux-spec §3-4, §10). One useTurn owns the current
 * turn (P5.1); the dock and suggestions both submit into it, and the hero
 * compacts + suggestions unmount once asked (UX-04). Busy derives from the
 * reducer so the dock cannot strand (UX-12).
 *
 * P5.2 scope: the first-visit landing (eyebrow, hero, suggestions, dock) as a
 * twin of the mock, plus the ask transition. The rich answer/refusal rendering
 * (choreography visuals, sources module, receipts) and the multi-turn journal
 * land at P5.3/P5.4/P5.5; here the active turn shows a compact lifecycle so the
 * transition is real end to end.
 */
export function Ask({
  summary,
  corpus,
  portfolioUrl,
}: {
  summary: { relative: string; pages: number; chunks: number; updated: number };
  corpus: { pages: number; chunks: number };
  portfolioUrl: string;
}) {
  const { state, busy, submit } = useTurn();
  const [value, setValue] = useState("");
  const asked = state.status !== "idle";
  const inputRef = useRef<HTMLInputElement>(null);
  const maxLen = 500;

  const onSubmit = (q: string) => {
    submit(q);
    setValue("");
  };

  return (
    <>
      <div className={styles.shell}>
        <main className={styles.trail}>
          <Eyebrow summary={summary} />

          <section className={styles.intro} data-asked={asked ? "yes" : "no"}>
            <h1 className={styles.thesis}>
              {asked ? (
                <>
                  Ask the Claude Code docs:{" "}
                  <em>cited answers, honest refusals</em>.
                </>
              ) : (
                <>
                  Ask the Claude Code docs a question. Every answer is{" "}
                  <em>cited</em>. When the docs don&apos;t cover it, it says so,{" "}
                  <em>with receipts</em>.
                </>
              )}
            </h1>
            <p className={styles.corpus}>
              corpus: claude code documentation ·{" "}
              {corpus.pages.toLocaleString()} pages ·{" "}
              {corpus.chunks.toLocaleString()} chunks
            </p>

            {!asked && (
              <div className={styles.suggest}>
                <p className={styles.suggestLabel}>Try one</p>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.question}
                    className={styles.sg}
                    onClick={() => onSubmit(s.question)}
                  >
                    <span>{s.question}</span>
                    {s.offCorpus ? (
                      <span className={styles.tag}>
                        &rarr; one it can&apos;t answer
                      </span>
                    ) : (
                      <span className={styles.arrow} aria-hidden="true">
                        &rarr;
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </section>

          {asked && <ActiveTurn state={state} />}

          <footer className={styles.foot}>
            <span>
              Built by{" "}
              <a href={portfolioUrl} target="_blank" rel="noopener">
                Brandon Church
              </a>{" "}
              · AI Product Engineer
            </span>
          </footer>
        </main>
      </div>

      <div className={styles.dock}>
        <div className={styles.dockInner}>
          <form
            className={styles.askbar}
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit(value);
            }}
          >
            <input
              id="ask-input"
              ref={inputRef}
              className={styles.input}
              type="text"
              placeholder="Ask the Claude Code docs&hellip;"
              aria-label="Ask a question"
              maxLength={maxLen}
              value={value}
              disabled={busy}
              onChange={(e) => setValue(e.target.value)}
            />
            <button className={styles.go} type="submit" disabled={busy}>
              {busy ? "…" : "Ask"}
            </button>
          </form>
          <p className={styles.dockMeta}>
            <span>single-turn · answers cite their sources</span>
            <span>
              {value.length} / {maxLen}
            </span>
          </p>
        </div>
      </div>
    </>
  );
}

/** The sync eyebrow + freshness popover (§3), a small interactive island. */
function Eyebrow({
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

/** Compact active-turn view (P5.2). P5.3/P5.4 replace this with the full answer /
 *  refusal anatomy + sources module; here it proves the transition end to end. */
function ActiveTurn({ state }: { state: TurnState }) {
  return (
    <article className={styles.turn} aria-label="Current answer">
      <div className={styles.provisional}>
        <p className={styles.provisionalNote}>
          {state.status === "retrieving" && "retrieving…"}
          {state.status === "streaming" && "answering…"}
          {state.status === "settled" && "answered"}
          {state.status === "refused" && "declined"}
          {state.status === "errored" && "interrupted"}
          {" · full answer + sources module land at P5.3/P5.4"}
        </p>
        {(state.status === "streaming" || state.status === "settled") && (
          <p className={styles.answer}>
            {state.text}
            {state.status === "streaming" && (
              <span className={styles.caret} aria-hidden="true" />
            )}
          </p>
        )}
        {state.status === "refused" && (
          <p className={styles.answer}>
            The Claude Code documentation doesn&apos;t cover this.
          </p>
        )}
        {state.status === "errored" && (
          <p className={styles.answer}>{state.message}</p>
        )}
      </div>
    </article>
  );
}
