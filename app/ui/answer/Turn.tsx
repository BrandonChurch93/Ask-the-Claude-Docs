"use client";

import { useCallback, useRef, useState, type RefObject } from "react";

import type { TurnState } from "../../../lib/stream/reducer";
import type {
  SourcePayload,
  ReceiptSkeleton,
  Receipt,
} from "../../../lib/stream/types";
import type { ChoreoStage } from "../../../lib/stream/choreography";
import { tokenizeAnswer } from "../../../lib/stream/tokenize";
import {
  receiptFields,
  receiptDisplay,
  receiptProse,
} from "../../../lib/stream/receipt";
import { DECLINE_SENTINEL } from "../../../lib/rag/prompt";
import styles from "./answer.module.css";

/**
 * The answer state (ui-ux-spec §5-6, P5.3). Renders the retrieving choreography
 * (a real-DOM narration, A11Y-15), then the serif stream with a caret and
 * tokenizer-built `[n]` markers resolved against the sources (SEC-07), then the
 * sources module (§6.2) with the receipt head and deep-linked rows. Markers and
 * rows cross-highlight; activating a marker opens the module, scrolls the row
 * into view, and flashes it (§6.1, A11Y-08). Refusal + error states are minimal
 * here; their full anatomy is P5.4.
 */
export function Turn({
  state,
  reduceMotion,
  chips,
  onAsk,
  pinned,
}: {
  state: TurnState;
  reduceMotion: boolean;
  /** Sync-derived coverage topics for the server-refusal chips (§7, RAG-21). */
  chips: string[];
  /** Submit a new question (coverage chip -> "Tell me about {topic}"). */
  onAsk: (question: string) => void;
  /** Rail pinned: the sources-module receipt slims to defer to the panel (§6.2). */
  pinned: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const [flashing, setFlashing] = useState<number | null>(null);
  const rowRefs = useRef(new Map<number, HTMLDivElement | null>());
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activate = useCallback(
    (n: number) => {
      setOpen(true);
      requestAnimationFrame(() => {
        rowRefs.current.get(n)?.scrollIntoView({
          block: "nearest",
          behavior: reduceMotion ? "auto" : "smooth",
        });
      });
      setFlashing(n);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlashing(null), 1400);
    },
    [reduceMotion],
  );

  if (state.status === "retrieving") {
    return state.choreo ? (
      <Choreography
        stages={state.choreo.stages.slice(0, state.choreo.revealed)}
      />
    ) : null;
  }

  if (state.status === "errored") {
    return (
      <>
        {state.text && (
          <AnswerBody text={state.text} sources={[]} streaming={false} />
        )}
        <p className={styles.errorNote}>{state.message}</p>
      </>
    );
  }

  if (state.status === "refused") {
    // Server refusal (§7 species a): the full anatomy, embedding-only receipt.
    return (
      <ServerRefusal
        nearMisses={state.nearMisses}
        receipt={state.receipt}
        chips={chips}
        onAsk={onAsk}
      />
    );
  }

  if (state.status === "idle") return null; // Turn only mounts once asked

  // streaming | settled. A settled answer whose text opens with the decline
  // sentinel is a model-side decline (§7 species b): rendered as a decline but
  // carrying its sources module and its real generation receipt (label reads
  // "declined", numbers tell the two species apart).
  const streaming = state.status === "streaming";
  const sources = state.sources;
  return (
    <>
      <AnswerBody
        text={state.text}
        sources={sources}
        streaming={streaming}
        onHover={setHovered}
        onActivate={activate}
      />
      <SourcesModule
        sources={sources}
        receipt={state.receipt}
        streaming={streaming}
        declined={
          state.status === "settled" && state.text.startsWith(DECLINE_SENTINEL)
        }
        pinned={pinned}
        open={open}
        onToggle={() => setOpen((o) => !o)}
        hovered={hovered}
        flashing={flashing}
        rowRefs={rowRefs}
      />
    </>
  );
}

/** Server refusal anatomy (§7 species a): decline line, sub, near-miss block,
 *  sync-derived coverage chips, and the embedding-only receipt. Calm register,
 *  no alarm styling (UX-09); "excluded" is text, not color alone (A11Y-18). */
function ServerRefusal({
  nearMisses,
  receipt,
  chips,
  onAsk,
}: {
  nearMisses: SourcePayload[];
  receipt: Receipt;
  chips: string[];
  onAsk: (question: string) => void;
}) {
  const ms = Math.round(receipt.timings.totalMs);
  return (
    <>
      <p className={styles.declineLine}>{DECLINE_SENTINEL}</p>
      <p className={styles.declineSub}>
        Nothing retrieved cleared the confidence threshold, so no answer was
        generated.
      </p>

      <div className={styles.misses}>
        <div className={styles.missesRule}>
          <span>
            nearest sections · none cleared {receipt.threshold ?? "-"}
          </span>
        </div>
        {nearMisses.map((m) => (
          <div key={m.chunkId} className={styles.miss}>
            <span>
              {m.breadcrumb} <span className={styles.excluded}>excluded</span>
            </span>
            <span className={styles.score}>{m.similarity.toFixed(2)}</span>
          </div>
        ))}
      </div>

      {chips.length > 0 && (
        <div className={styles.covers}>
          <p className={styles.coversLabel}>The corpus does cover</p>
          {chips.map((topic) => (
            <button
              key={topic}
              className={styles.chip}
              onClick={() => onAsk(`Tell me about ${topic}`)}
            >
              {topic}
            </button>
          ))}
        </div>
      )}

      <p className={styles.refusalReceipt}>
        <span className={styles.declinedKey}>declined</span> · {ms} ms ·
        embedding only
      </p>
    </>
  );
}

function Choreography({ stages }: { stages: ChoreoStage[] }) {
  return (
    <div className={styles.choreo}>
      {stages.map((s, i) => (
        <ChoreoLine key={i} stage={s} />
      ))}
    </div>
  );
}

function ChoreoLine({ stage }: { stage: ChoreoStage }) {
  if (stage.kind === "embedded")
    return <p className={styles.stageLine}>✓ embedded · {stage.ms} ms</p>;
  if (stage.kind === "searched")
    return (
      <p className={styles.stageLine}>
        ✓ searched {stage.corpusChunks.toLocaleString()} chunks · {stage.ms} ms
      </p>
    );
  if (stage.kind === "source")
    return (
      <div className={styles.cSrc}>
        <span>{stage.breadcrumb}</span>
        <span className={styles.cScore}>{stage.similarity.toFixed(2)}</span>
      </div>
    );
  if (stage.kind === "threshold")
    return (
      <div className={styles.cRule}>
        <span>
          threshold {stage.threshold ?? "-"}
          {stage.noneCleared ? " · none cleared" : ""}
        </span>
      </div>
    );
  return (
    <div className={`${styles.cSrc} ${styles.cDim}`}>
      <span>
        {stage.breadcrumb} <span className={styles.excluded}>excluded</span>
      </span>
      <span className={styles.cScore}>{stage.similarity.toFixed(2)}</span>
    </div>
  );
}

function AnswerBody({
  text,
  sources,
  streaming,
  onHover,
  onActivate,
}: {
  text: string;
  sources: SourcePayload[];
  streaming: boolean;
  onHover?: (n: number | null) => void;
  onActivate?: (n: number) => void;
}) {
  const paras = tokenizeAnswer(text);
  return (
    <div className={styles.answer}>
      {paras.map((p, pi) => (
        <p key={pi}>
          {p.inlines.map((inline, ii) => {
            if (inline.type === "text")
              return <span key={ii}>{inline.value}</span>;
            if (inline.type === "code")
              return (
                <code key={ii} className={styles.code}>
                  {inline.value}
                </code>
              );
            return (
              <Marker
                key={ii}
                n={inline.n}
                sources={sources}
                onHover={onHover}
                onActivate={onActivate}
              />
            );
          })}
          {streaming && pi === paras.length - 1 && (
            <span className={styles.caret} aria-hidden="true" />
          )}
        </p>
      ))}
      {streaming && paras.length === 0 && (
        <p>
          <span className={styles.caret} aria-hidden="true" />
        </p>
      )}
    </div>
  );
}

/** A `[n]` citation marker (§6.1, SEC-07). Resolves against sources; an
 *  unmatched marker renders as literal text, never an interactive element. */
function Marker({
  n,
  sources,
  onHover,
  onActivate,
}: {
  n: number;
  sources: SourcePayload[];
  onHover?: (n: number | null) => void;
  onActivate?: (n: number) => void;
}) {
  const source = sources[n - 1];
  if (!source) return <>[{n}]</>;
  return (
    <sup
      className={styles.cite}
      role="link"
      tabIndex={0}
      aria-label={`Source ${n}: ${source.breadcrumb}`}
      onMouseEnter={() => onHover?.(n)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(n)}
      onBlur={() => onHover?.(null)}
      onClick={() => onActivate?.(n)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate?.(n);
        }
      }}
    >
      [{n}]
    </sup>
  );
}

function SourcesModule({
  sources,
  receipt,
  streaming,
  declined,
  pinned,
  open,
  onToggle,
  hovered,
  flashing,
  rowRefs,
}: {
  sources: SourcePayload[];
  receipt: ReceiptSkeleton | Receipt;
  streaming: boolean;
  declined: boolean;
  pinned: boolean;
  open: boolean;
  onToggle: () => void;
  hovered: number | null;
  flashing: number | null;
  rowRefs: RefObject<Map<number, HTMLDivElement | null>>;
}) {
  // Retrieval-known fields during streaming; the full receipt at settled. A
  // model-side decline shows a real generation receipt labeled "declined" (§7b).
  const full = !streaming && "timings" in receipt ? receipt : null;
  const declinedLine = full
    ? `declined · ${Math.round(full.timings.totalMs)} ms · $${full.costUsd.toFixed(4)}`
    : "";
  const line = !full
    ? `${sources.length} sources · top ${sources[0]?.similarity.toFixed(2) ?? "-"} · threshold ${receipt.threshold ?? "-"} · ${receipt.model} · streaming…`
    : declined
      ? declinedLine
      : receiptDisplay(receiptFields(sources, full));
  const prose = !full
    ? `${sources.length} sources retrieved, streaming.`
    : declined
      ? `Declined. ${declinedLine.replace(/·/g, ",")}.`
      : receiptProse(receiptFields(sources, full));

  return (
    <div
      className={`${styles.sources}${pinned ? ` ${styles.pinned}` : ""}`}
      data-open={open}
    >
      <button
        className={styles.head}
        aria-expanded={open}
        aria-label={prose}
        onClick={onToggle}
      >
        <span className={styles.receiptLine} aria-hidden="true">
          <span className={styles.process}>{line}</span>
          <span className={styles.slim}>
            {sources.length} sources cited · see retrieval panel
          </span>
        </span>
        <span className={styles.chev} aria-hidden="true">
          ▾
        </span>
      </button>
      <div className={styles.wrap}>
        <div className={styles.body}>
          {sources.map((s, i) => {
            const n = i + 1;
            return (
              <div
                key={s.chunkId}
                ref={(el) => {
                  rowRefs.current.set(n, el);
                }}
                className={`${styles.srow} ${hovered === n || flashing === n ? styles.hl : ""}`}
                data-src={n}
              >
                <div className={styles.srowTop}>
                  <span className={styles.srowL}>
                    <span className={styles.marker}>[{n}]</span> {s.breadcrumb}
                  </span>
                  <span className={styles.score}>
                    {s.similarity.toFixed(2)}
                  </span>
                </div>
                <p className={styles.srcQuote}>{s.snippet}</p>
                <a
                  className={styles.srcLink}
                  href={s.url}
                  target="_blank"
                  rel="noopener"
                >
                  read at code.claude.com{" "}
                  <span className={styles.x} aria-hidden="true">
                    ↗
                  </span>
                </a>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
