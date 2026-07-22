# performance.md

Performance budgets and rules for Ask the Claude Docs.
Audience: the Claude Code session building this project. Status: **frozen** once approved.

Philosophy: "polished" is a set of numbers with enforcement, not an adjective. Every budget below is checked by an instrument (Lighthouse CI, Playwright timing, server-side measurement) — a budget without a gate is a wish. Rule IDs use the prefix `PERF-`.

Related docs: `engineering-standards.md` (the practices that hit these numbers), `success-criteria.md` (which budgets are acceptance-blocking), `honesty-boundaries.md` (what production monitoring would add).

---

## 1. Page budgets (lab, Lighthouse CI, throttled mobile profile)

| Metric | Budget | Applies to |
|---|---|---|
| Performance score | ≥ 95 | `/` and `/evals` |
| Accessibility score | 100 | `/` and `/evals` (score is the floor; the real bar is `accessibility.md` + axe) |
| LCP | ≤ 2.0 s | both routes |
| CLS | ≤ 0.05 | both routes (stricter than the 0.1 standard: a streaming UI must prove layout discipline) |
| INP | ≤ 200 ms | both routes |
| TTFB | ≤ 500 ms | both routes (static-rendered, so this is mostly CDN) |

**Rules**
- `PERF-01` Lighthouse CI runs in the pipeline with these budgets as assertions; any breach fails CI.
- `PERF-02` Both routes are statically rendered (per ENG §6 caching table); nothing on the landing shell blocks on runtime data.

## 2. Payload budgets

| Asset class | Budget |
|---|---|
| First-load JS, `/` | ≤ 120 KB gzipped (Next 16 baseline leaves ~30–40 KB for app code — the client islands must stay lean) |
| First-load JS, `/evals` | ≤ 100 KB gzipped |
| Fonts, total | ≤ 130 KB, ≤ 5 files (three families × minimal weights; latin subset only) |
| CSS | ≤ 30 KB gzipped (tokens file + CSS Modules output) |
| Images | None in-app (OG image excluded from budgets; served only to scrapers) |

- Bundle composition is checked with `next build` output in CI; the budget assertion reads the build manifest.
- No third-party scripts. None. No analytics tag, no font CDN, no widget (`honesty-boundaries.md` notes what production observability would add).

**Rules**
- `PERF-03` First-load JS budgets asserted in CI from build output; a breach fails the build step.
- `PERF-04` Zero third-party script or style origins; fonts self-hosted (`ENG` next/font ruling).
- `PERF-05` Font files ≤ 5 and latin-subset; every `@font-face` weight/style shipped is used by a design-system token.

## 3. Query-path latency budgets (server-measured)

Definitions — measured server-side in the route handler, reported in the receipt (`RAG-17` companion), asserted in integration/e2e tests against mocked-model timing where deterministic and recorded as observed values where not:

| Segment | Definition | Budget |
|---|---|---|
| `retrieval_ms` | request validated → sources event emitted (embed call + pgvector query + partition) | ≤ 400 ms p95 |
| `ttft_ms` | request validated → first generation token emitted | ≤ 2.5 s p95 (dominated by model TTFT; our overhead within it ≤ 500 ms) |
| refusal round-trip | request validated → refusal payload complete | ≤ 600 ms p95 (no generation call — refusals must feel *faster* than answers; that snappiness is part of the honesty story) |

- The receipt's displayed latency uses these definitions exactly, so the UI number and the budget number are the same instrument.
- pgvector query at this corpus size should run in single-digit ms; if `retrieval_ms` is blown, the embed call or connection setup is the suspect — connection pooling per §5.

**Rules**
- `PERF-06` The three segments above are measured in the route handler with `performance.now()` and included in SSE metadata; the UI renders these values, not client-side re-measurements.
- `PERF-07` A refusal response makes zero generation calls and completes its payload in one flush after retrieval.

## 4. Streaming architecture

- `/api/ask` returns a `ReadableStream` with `Content-Type: text/event-stream`, `Cache-Control: no-store`, `Connection: keep-alive`; events per the protocol in `rag-design.md` §7 (`sources` → `text*` → `done`).
- No buffering between the model stream and the client: each model delta is encoded and enqueued as received. No accumulate-then-flush, no artificial pacing.
- Token deltas are appended to the DOM via the turn state machine (`ENG-16`); rendering must not re-layout prior content (see §6 CLS discipline). Markers `[n]` are resolved against the already-received sources array as they arrive — never a post-hoc pass that rewrites streamed text.
- Client handles stream interruption: `done` never received → the turn enters the error state with partial text preserved and a retry affordance (ui-ux-spec error state; exercised by a golden-path walkthrough).
- Vercel function cold starts exist and are accepted for v1 (portfolio traffic pattern); noted in `honesty-boundaries.md` with the production mitigations. Do not add keep-warm hacks.

**Rules**
- `PERF-08` No server-side buffering or batching of generation deltas.
- `PERF-09` Stream interruption is a handled state with partial-content preservation, verified by a Playwright test that kills the connection mid-stream.

## 5. Server-side practices

- Postgres: one module-scoped connection (pooled via Supabase's pooler URL) reused across invocations; never a connection per request.
- The embedding call and any per-request setup run concurrently where dependency-free; sequential awaits that could be `Promise.all` are an audit finding.
- `max_tokens` for generation is capped in config (answers are documentation answers, not essays) — this bounds both cost and worst-case stream duration.
- Payload hygiene: the sources SSE event carries snippets (first ~300 chars) + metadata, not full chunk texts; the full text ships only for chunks the user expands (fetched lazily) — keeps time-to-choreography tight.

**Rules**
- `PERF-10` One shared DB client at module scope; no per-request connection setup.
- `PERF-11` `max_tokens` read from config; no unbounded generation.
- `PERF-12` The sources event payload carries snippets, not full chunk bodies.

## 6. Rendering and motion performance

- CLS discipline for streaming: the answer container reserves min-height; the receipt strip and citation cards mount in pre-reserved space or push *downward only* below the viewport-stable content; nothing above the streaming text moves after first paint. Expanding a citation card animates height via transform techniques, not by reflowing the conversation above it.
- All animation: `transform` and `opacity` only. Anything animating layout properties (height/top/margin) in the choreography is a defect. `will-change` used sparingly and removed after transition.
- The choreography (sources surfacing, threshold rule drawing) is CSS-class-driven off the state machine — no rAF loops, no animation libraries (dependency policy `ENG-02` stands).
- `prefers-reduced-motion`: all choreography collapses to instant state presentation (`accessibility.md` owns the rule; performance note: the reduced path is also the cheapest path and must remain fully functional).

**Rules**
- `PERF-13` No animation touches layout properties, with two sanctioned exceptions defined in `design-system.md` §6: the sources-module disclosure expansion (grid-template-rows, content pushed downward below the reading line only) and the ask-bar focus border/shadow. Verified by code audit at the UI phase gate.
- `PERF-14` Streaming never shifts previously painted content (the CLS ≤ 0.05 budget is the instrument; a Playwright scroll-position assertion during stream is the test).

## 7. Measurement and enforcement summary

| Instrument | Where | Gates |
|---|---|---|
| Lighthouse CI (budgets file in repo) | CI, both routes | PERF-01 metrics |
| Build-manifest assertion script | CI | PERF-03 payload budgets |
| Server timing in SSE metadata | runtime + receipts | PERF-06 latency definitions |
| Playwright timing + interruption + scroll assertions | CI e2e | PERF-09, PERF-14 |
| Phase-gate manual pass (throttled devtools run, real query) | phase gates | observed values recorded in the gate's handoff |

Field/RUM monitoring is deliberately out of scope for v1 — lab-only measurement is a stated limit in `honesty-boundaries.md`, with what production would add (RUM, tracing, alerting).

**Rules**
- `PERF-15` Every budget in this doc maps to a row in the table above; a budget with no instrument may not be added to this doc.

---

## Decision summary (for architecture.md's log)

| Decision | Chosen | Rejected |
|---|---|---|
| Measurement scope | Lab-only (Lighthouse CI + tests), stated honestly | RUM in v1 (adds a third-party script against PERF-04, unneeded for portfolio traffic) |
| CLS bar | 0.05, stricter than standard | 0.1 (a streaming UI should prove layout discipline, not meet the floor) |
| Latency truth source | Server-measured segments rendered verbatim in receipts | Client-side timing (measures the wrong thing; can drift from the shown number) |
| Cold starts | Accepted, documented | Keep-warm pings (a hack that misrepresents the deployment class) |
| Sources payload | Snippets + lazy full text | Full chunks up front (delays choreography for data mostly never read) |
