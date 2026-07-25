"use client";

import { memo, useCallback, useEffect, useId, useRef, useState } from "react";

import { useTurn } from "../../lib/stream/use-turn";
import type { TurnState } from "../../lib/stream/reducer";
import { SUGGESTIONS } from "../../lib/suggestions";
import { Turn } from "./answer/Turn";
import { Eyebrow } from "./Eyebrow";
import { Rail } from "./Rail";
import styles from "./Ask.module.css";

/**
 * The interactive shell (ui-ux-spec §2-4, §9-10). Owns the session journal (each
 * ask appends an independent turn - the app is single-turn, no conversational
 * memory, but the UI keeps a journal), the pin state (governs the retrieval rail
 * + receipt slimming), and session history (jump + flash). page.tsx is the server
 * data source. Busy derives from the last turn's status so the dock cannot strand
 * (UX-12).
 */

interface JournalTurn {
  id: string;
  question: string;
}

export function Ask({
  summary,
  corpus,
  chips,
  portfolioUrl,
}: {
  summary: { relative: string; pages: number; chunks: number; updated: number };
  corpus: { pages: number; chunks: number };
  chips: string[];
  portfolioUrl: string;
}) {
  const [turns, setTurns] = useState<JournalTurn[]>([]);
  const [states, setStates] = useState<Record<string, TurnState>>({});
  const [pinned, setPinned] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [spotId, setSpotId] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const nextId = useRef(0);
  const histRef = useRef<HTMLDivElement>(null);
  const histPopId = useId();
  const maxLen = 500;

  const asked = turns.length > 0;
  const lastTurn = turns.at(-1);
  const lastState = lastTurn ? (states[lastTurn.id] ?? null) : null;
  const busy =
    lastState?.status === "retrieving" || lastState?.status === "streaming";

  const reportState = useCallback((id: string, s: TurnState) => {
    setStates((m) => ({ ...m, [id]: s }));
  }, []);

  const ask = useCallback(
    (q: string) => {
      const question = q.trim();
      if (!question || busy) return; // empty input / mid-turn is a no-op
      const id = `t${(nextId.current += 1)}`;
      setTurns((t) => [...t, { id, question }]);
      setValue("");
    },
    [busy],
  );

  // History popover: outside-click + Escape close.
  useEffect(() => {
    if (!histOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!histRef.current?.contains(e.target as Node)) setHistOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHistOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [histOpen]);

  const jump = (id: string) => {
    setHistOpen(false);
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: rm ? "auto" : "smooth", block: "start" });
    setSpotId(id);
    window.setTimeout(() => setSpotId((s) => (s === id ? null : s)), 1400);
  };

  return (
    <>
      <header className={styles.top}>
        <div className={styles.topInner}>
          <span className={styles.wordmark}>Ask the Claude Docs</span>
          <nav className={styles.nav} aria-label="Site">
            <a href="/evals" className={styles.navLink}>
              eval scores
            </a>
            <a
              href="https://github.com/BrandonChurch93/Ask-the-Claude-Docs"
              target="_blank"
              rel="noopener"
              className={styles.navLink}
            >
              GitHub
            </a>
            <span className={styles.divider} aria-hidden="true" />
            <div className={styles.histWrap} ref={histRef}>
              <button
                className={styles.histBtn}
                aria-expanded={histOpen}
                aria-controls={histPopId}
                disabled={!asked}
                onClick={() => setHistOpen((o) => !o)}
              >
                {asked ? `history (${turns.length})` : "history"}
              </button>
              <div className={styles.histPop} id={histPopId} hidden={!histOpen}>
                <h3 className={styles.histHead}>This session</h3>
                <ol className={styles.histList}>
                  {turns.map((t, i) => (
                    <li key={t.id}>
                      <button
                        className={styles.hItem}
                        onClick={() => jump(t.id)}
                      >
                        <span>{t.question}</span>
                        <span className={styles.hn}>#{i + 1}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            <button
              className={styles.pin}
              aria-pressed={pinned}
              onClick={() => setPinned((p) => !p)}
            >
              {pinned ? "Hide retrieval details" : "Show retrieval details"}
            </button>
          </nav>
        </div>
      </header>

      <div className={styles.shell} data-pin={pinned ? "on" : "off"}>
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
                    onClick={() => ask(s.question)}
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

          {asked && (
            <ol className={styles.conversation}>
              {turns.map((t) => (
                <ConversationTurn
                  key={t.id}
                  id={t.id}
                  question={t.question}
                  chips={chips}
                  pinned={pinned}
                  spotlit={spotId === t.id}
                  onAsk={ask}
                  onState={reportState}
                />
              ))}
            </ol>
          )}

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

        <Rail state={lastState} summary={summary} />
      </div>

      <div className={styles.dock}>
        <div className={styles.dockInner}>
          <form
            className={styles.askbar}
            onSubmit={(e) => {
              e.preventDefault();
              ask(value);
            }}
          >
            <input
              id="ask-input"
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

/** One journal turn: its own reducer (ENG-16, one per turn), submitted on mount,
 *  reporting its state up so the dock-busy + rail track the active turn. */
const ConversationTurn = memo(function ConversationTurn({
  id,
  question,
  chips,
  pinned,
  spotlit,
  onAsk,
  onState,
}: {
  id: string;
  question: string;
  chips: string[];
  pinned: boolean;
  spotlit: boolean;
  onAsk: (q: string) => void;
  onState: (id: string, s: TurnState) => void;
}) {
  const { state, submit, reduceMotion } = useTurn();
  const submitted = useRef(false);
  const headingId = useId();

  useEffect(() => {
    if (submitted.current) return;
    submitted.current = true;
    submit(question);
  }, [submit, question]);

  useEffect(() => {
    onState(id, state);
  }, [id, state, onState]);

  return (
    <li
      id={id}
      className={`${styles.turnItem}${spotlit ? ` ${styles.spot}` : ""}`}
    >
      <article aria-labelledby={headingId}>
        <h2 id={headingId} className={styles.asked}>
          {question}
        </h2>
        <Turn
          state={state}
          reduceMotion={reduceMotion}
          chips={chips}
          onAsk={onAsk}
          pinned={pinned}
        />
      </article>
    </li>
  );
});
