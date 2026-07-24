"use client";

import { useMemo } from "react";
import type { CSSProperties } from "react";

import { encodeEvent } from "../../../lib/stream/encode";
import { consumeStream } from "../../../lib/stream/stream-client";
import { useTurn, type TurnDriver } from "../../../lib/stream/use-turn";
import type { TurnState } from "../../../lib/stream/reducer";
import type { ChoreoStage } from "../../../lib/stream/choreography";
import {
  TRANSCRIPTS,
  isSentinelDecline,
  type Transcript,
} from "../../../lib/stream/transcripts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Replay a recorded transcript through the real client path (consumeStream). The
 *  interrupted transcript omits `done`, so the stream closes and PERF-09 fires. */
function replayDriver(t: Transcript): TurnDriver {
  return async (_question, onEvent) => {
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        for (const step of t.steps) {
          await sleep(step.delayMs);
          controller.enqueue(enc.encode(encodeEvent(step.event)));
        }
        controller.close();
      },
    });
    await consumeStream(stream, onEvent);
  };
}

const mono: CSSProperties = { fontFamily: "var(--font-mono, monospace)" };
const serif: CSSProperties = {
  fontFamily: "var(--font-serif, Georgia, serif)",
};

function StageLine({ stage }: { stage: ChoreoStage }) {
  const score = (n: number) => n.toFixed(2);
  if (stage.kind === "embedded")
    return (
      <div style={{ ...mono, color: "var(--ink-soft)" }}>
        ✓ embedded · {stage.ms} ms
      </div>
    );
  if (stage.kind === "searched")
    return (
      <div style={{ ...mono, color: "var(--ink-soft)" }}>
        ✓ searched {stage.corpusChunks.toLocaleString()} chunks · {stage.ms} ms
      </div>
    );
  if (stage.kind === "source")
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 13.5,
        }}
      >
        <span>{stage.breadcrumb}</span>
        <span style={{ ...mono, color: "var(--ink-muted)" }}>
          {score(stage.similarity)}
        </span>
      </div>
    );
  if (stage.kind === "threshold")
    return (
      <div
        style={{
          ...mono,
          color: "var(--accent)",
          borderTop: "1px solid var(--line-graphic)",
          paddingTop: 6,
          margin: "6px 0",
          fontSize: 10.5,
        }}
      >
        threshold {stage.threshold ?? "-"}
        {stage.noneCleared ? " · none cleared" : ""}
      </div>
    );
  // excluded: solid ink-soft + the word "excluded" (no opacity, §2.4 correction 3)
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: 13.5,
        color: "var(--ink-soft)",
      }}
    >
      <span>
        {stage.breadcrumb}{" "}
        <span style={{ ...mono, color: "var(--ink-muted)", fontSize: 10.5 }}>
          excluded
        </span>
      </span>
      <span style={{ ...mono, color: "var(--ink-muted)" }}>
        {stage.similarity.toFixed(2)}
      </span>
    </div>
  );
}

function Receipt({ text }: { text: string }) {
  return (
    <p
      style={{
        ...mono,
        fontSize: 11.5,
        color: "var(--ink-muted)",
        marginTop: 14,
      }}
    >
      {text}
    </p>
  );
}

function StateView({ state }: { state: TurnState }) {
  if (state.status === "idle")
    return (
      <p style={{ color: "var(--ink-muted)", fontSize: 13 }}>
        Press Play to replay the transcript.
      </p>
    );

  if (state.status === "retrieving") {
    const shown = state.choreo?.stages.slice(0, state.choreo.revealed) ?? [];
    return (
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ ...mono, fontSize: 10.5, color: "var(--ink-muted)" }}>
          retrieving…
        </div>
        {shown.map((s, i) => (
          <StageLine key={i} stage={s} />
        ))}
      </div>
    );
  }

  if (state.status === "streaming")
    return (
      <div>
        <p style={{ ...serif, fontSize: 17.5, lineHeight: 1.75 }}>
          {state.text}
          <span
            style={{
              display: "inline-block",
              width: 2,
              height: "1em",
              background: "var(--accent)",
              verticalAlign: "-2px",
              marginLeft: 1,
            }}
            aria-hidden
          />
        </p>
        <Receipt
          text={`${state.sources.length} sources · streaming · ${state.receipt.model}`}
        />
      </div>
    );

  if (state.status === "settled") {
    const decline = isSentinelDecline(state.text);
    return (
      <div>
        <p
          style={{
            ...serif,
            fontSize: 17.5,
            lineHeight: 1.75,
            color: decline ? "var(--ink-soft)" : "var(--ink)",
          }}
        >
          {state.text}
        </p>
        <Receipt
          text={
            decline
              ? `model-side decline · ${state.receipt.timings.totalMs} ms · $${state.receipt.costUsd.toFixed(6)}`
              : `${state.sources.length} sources · top ${state.sources[0]?.similarity.toFixed(2) ?? "-"} · threshold ${state.receipt.threshold} · ${state.receipt.timings.totalMs} ms · ${state.receipt.model} · $${state.receipt.costUsd.toFixed(6)}`
          }
        />
      </div>
    );
  }

  if (state.status === "refused")
    return (
      <div>
        <p style={{ ...serif, fontSize: 17.5, lineHeight: 1.7 }}>
          The Claude Code documentation doesn&apos;t cover this.
        </p>
        <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 6 }}>
          Nothing retrieved cleared the confidence threshold, so no answer was
          generated.
        </p>
        <div style={{ marginTop: 12, display: "grid", gap: 4 }}>
          {state.nearMisses.map((m) => (
            <div
              key={m.chunkId}
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 13.5,
                color: "var(--ink-soft)",
              }}
            >
              <span>
                {m.breadcrumb}{" "}
                <span
                  style={{ ...mono, fontSize: 10.5, color: "var(--ink-muted)" }}
                >
                  excluded
                </span>
              </span>
              <span style={{ ...mono, color: "var(--ink-muted)" }}>
                {m.similarity.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
        <Receipt
          text={`declined · ${state.receipt.timings.totalMs} ms · $${state.receipt.costUsd.toFixed(4)}`}
        />
      </div>
    );

  // errored
  return (
    <div>
      {state.text && (
        <p style={{ ...serif, fontSize: 17.5, lineHeight: 1.75 }}>
          {state.text}
        </p>
      )}
      <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 10 }}>
        {state.message}
      </p>
      {state.retryable && (
        <span style={{ color: "var(--accent)", fontSize: 14 }}>
          Try again (retry affordance)
        </span>
      )}
    </div>
  );
}

function TurnPanel({ transcript }: { transcript: Transcript }) {
  const driver = useMemo(() => replayDriver(transcript), [transcript]);
  const { state, busy, submit } = useTurn(driver);
  return (
    <section
      style={{
        border: "1px solid var(--line)",
        borderRadius: 10,
        background: "var(--card)",
        padding: 18,
        minHeight: 260,
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div>
          <div
            style={{
              ...mono,
              fontSize: 10.5,
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              color: "var(--ink-muted)",
            }}
          >
            {transcript.id}
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>
            {transcript.label}
          </div>
        </div>
        <button
          onClick={() => submit(transcript.question)}
          disabled={busy}
          style={{
            background: "var(--accent)",
            color: "var(--card)",
            border: "none",
            borderRadius: 8,
            padding: "7px 14px",
            fontSize: 13,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.45 : 1,
          }}
        >
          {busy ? "…" : state.status === "idle" ? "Play" : "Replay"}
        </button>
      </header>
      <p
        style={{
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: "-0.01em",
          marginBottom: 10,
        }}
      >
        {transcript.question}
      </p>
      <StateView state={state} />
      <div
        style={{
          ...mono,
          fontSize: 10,
          color: "var(--ink-muted)",
          marginTop: 14,
          borderTop: "1px dashed var(--line)",
          paddingTop: 8,
        }}
      >
        reducer status: <b style={{ color: "var(--accent)" }}>{state.status}</b>
        {" · dock "} {busy ? "busy" : "released"}
      </div>
    </section>
  );
}

export function Harness() {
  return (
    <main
      style={{ maxWidth: 1180, margin: "0 auto", padding: "32px 24px 80px" }}
    >
      <h1 style={{ ...serif, fontSize: 24, fontWeight: 600 }}>
        Turn lifecycle harness
      </h1>
      <p
        style={{
          color: "var(--ink-soft)",
          fontSize: 14,
          marginTop: 8,
          maxWidth: "60ch",
        }}
      >
        Each panel replays a recorded SSE transcript through the real client
        path (<code style={mono}>consumeStream → turnReducer</code>). Watch the
        choreography (200ms-min stage reveal), the streamed answer, and the
        terminal state; the dock-busy line shows the guaranteed release. Open
        the v10 mock beside it to compare.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: 20,
          marginTop: 24,
        }}
      >
        {TRANSCRIPTS.map((t) => (
          <TurnPanel key={t.id} transcript={t} />
        ))}
      </div>
    </main>
  );
}
