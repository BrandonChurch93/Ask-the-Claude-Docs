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
}: {
  state: TurnState;
  reduceMotion: boolean;
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
    return (
      <article className={styles.turn} aria-label="Retrieving">
        {state.choreo && (
          <Choreography
            stages={state.choreo.stages.slice(0, state.choreo.revealed)}
          />
        )}
      </article>
    );
  }

  if (state.status === "errored") {
    return (
      <article className={styles.turn} aria-label="Answer interrupted">
        {state.text && (
          <AnswerBody text={state.text} sources={[]} streaming={false} />
        )}
        <p className={styles.errorNote}>{state.message}</p>
      </article>
    );
  }

  if (state.status === "refused") {
    // Minimal here; the full refusal anatomy is P5.4.
    return (
      <article className={styles.turn} aria-label="Declined">
        <p className={styles.declineLine}>
          The Claude Code documentation doesn&apos;t cover this.
        </p>
      </article>
    );
  }

  if (state.status === "idle") return null; // Turn only mounts once asked

  // streaming | settled
  const streaming = state.status === "streaming";
  const sources = state.sources;
  return (
    <article className={styles.turn} aria-label="Answer">
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
        open={open}
        onToggle={() => setOpen((o) => !o)}
        hovered={hovered}
        flashing={flashing}
        rowRefs={rowRefs}
      />
    </article>
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
  open,
  onToggle,
  hovered,
  flashing,
  rowRefs,
}: {
  sources: SourcePayload[];
  receipt: ReceiptSkeleton | Receipt;
  streaming: boolean;
  open: boolean;
  onToggle: () => void;
  hovered: number | null;
  flashing: number | null;
  rowRefs: RefObject<Map<number, HTMLDivElement | null>>;
}) {
  // Retrieval-known fields during streaming; the full receipt at settled.
  const full = !streaming && "timings" in receipt ? receipt : null;
  const line = full
    ? receiptDisplay(receiptFields(sources, full))
    : `${sources.length} sources · top ${sources[0]?.similarity.toFixed(2) ?? "-"} · threshold ${receipt.threshold ?? "-"} · ${receipt.model} · streaming…`;
  const prose = full
    ? receiptProse(receiptFields(sources, full))
    : `${sources.length} sources retrieved, streaming.`;

  return (
    <div className={styles.sources} data-open={open}>
      <button
        className={styles.head}
        aria-expanded={open}
        aria-label={prose}
        onClick={onToggle}
      >
        <span className={styles.receiptLine} aria-hidden="true">
          {line}
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
