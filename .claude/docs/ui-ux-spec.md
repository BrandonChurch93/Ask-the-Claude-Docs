# ui-ux-spec.md

Every surface, state, behavior, and authored string in Ask the Claude Docs.
Audience: the Claude Code session building this project. Status: **frozen**.

Rule IDs use the prefix `UX-`. Related docs: `design-system.md` (all values), `accessibility.md` (interaction constraints, announcement script), `rag-design.md` §7 (the SSE events this UI consumes), `performance.md` §4/§6 (streaming and layout discipline).

## 0. Authority and reference

The interactive reference is `.claude/design/layout-mock-v10.html`. Build to match it; where mock and documents disagree, the documents win. Known sanctioned divergences: the four corrections in `design-system.md` §2.4, real-event choreography pacing (§5 here), and everything the mock stubs (states in §8, the /evals page, real deep links, real receipt values).

- `UX-01` Every surface below is implemented; no surface or state not listed here is added without a Tier 3 decision.

## 1. Surface map

One page (`/`) containing: header · sync eyebrow · hero (full ↔ compact) · the trail of turns · dock · footer · retrieval rail (pinned only). Plus `/evals` (§12) and the global error boundary / not-found pages (per ENG §6, styled with these tokens).

## 2. Header

Sticky is NOT used; the header scrolls away (the dock carries the persistent input). Layout: wordmark left; right cluster in exact order: **eval scores · GitHub · divider · history · Show retrieval details**.

- Wordmark: "Ask the Claude Docs", serif 19/600. Not a link in v1 (the page is home).
- "eval scores" → `/evals`, same tab. "GitHub" → repo, new tab (`rel="noopener"`). Nav links use the underline-sweep hover (DS §6.2).
- **history**: disabled until the first ask; label becomes "history (n)". Opens a 320px popover listing session questions, numbered. Item click: close popover, smooth-scroll that turn to `block: start`, flash its question accent for 1400ms. Popover closes on outside click and Escape; `aria-expanded` maintained. Session-only, in-memory; nothing persisted (SEC-14 alignment).
- **Show retrieval details**: the one bordered control in the header. Label toggles to "Hide retrieval details" when pressed; `aria-pressed` maintained. Governs `data-pin` (§9).

- `UX-02` The header contains exactly these five elements in this order; the toggle's label always states the action it will perform, never the current state.

## 3. Sync eyebrow and freshness popover

A left-aligned mono line above the hero: status dot + "synced {relative time} ago", 11px, clickable, `aria-expanded`. Popover (left-anchored, downward):

> **Corpus freshness**
> Answers come only from a local index of the Claude Code docs, never from model memory. The index re-syncs from code.claude.com daily, picking up anything that changed.
> `last sync {time} · {pages} pages · {chunks} chunks · {n} updated`

All values derive from the latest sync log row (`RAG-21`); nothing hardcoded. Closes on outside click / Escape.

- `UX-03` The eyebrow is the sole persistent freshness indicator; its values and the hero corpus line come from sync data.

## 4. Hero and suggestions

**First visit** (no turns yet): thesis, serif 27 with accent italics:

> Ask the Claude Code docs a question. Every answer is *cited*. When the docs don't cover it, it says so, *with receipts*.

Corpus line beneath, mono: `corpus: claude code documentation · {pages} pages · {chunks} chunks`.

Suggestions: label "Try one", then four full-width rows (top-hairline list, no boxes): three answerable questions drawn from the eval set's strongest performers, and the fourth the off-corpus demonstration, tagged right in mono accent: `→ one it can't answer`. Row hover: accent wash, 6px indent, arrow slide. Click submits the question exactly as typed input would.

**After first ask**: suggestions unmount; thesis compacts to serif 18: "Ask the Claude Code docs: *cited answers, honest refusals*." Corpus line persists.

- `UX-04` The off-corpus suggestion is present, last, and labeled; its question is one of the eval set's `refusal` entries.

## 5. The ask lifecycle (the turn state machine, `ENG-16`)

States: `idle → retrieving → streaming → settled | refused | errored`. One reducer per turn, driven by the SSE events of `rag-design.md` §7.

**On submit** (Enter or Ask; empty input is a no-op): input clears and disables; Ask label becomes "…" and disables; hero compacts if first ask; a new turn mounts with the question as its anchor (sans 19/600) and smooth-scrolls to `block: start`; the turn enters `retrieving`.

**Retrieving (the choreography)** renders beneath the question, paced by real events with a **200ms minimum display per stage** so fast pipelines still read:

1. `✓ embedded · {ms} ms` (on embed completion)
2. `✓ searched {chunks} chunks · {ms} ms` (on query completion)
3. Passing sources surface one by one (~130–150ms stagger), sans rows with mono scores
4. The threshold rule draws: `threshold {T}` (or `threshold {T} · none cleared`)
5. Excluded candidates surface below it in ink-soft with the word `excluded`

The `sources` SSE event supplies everything above; the choreography is a narration of that single event's payload, never a second data source.

**Streaming**: the choreography region unmounts; the sources module (§6.2) mounts collapsed with its retrieval-known fields populated; answer text streams into the serif container above it, blinking caret at the insertion point, `[n]` markers materializing inline as React elements resolved against the sources array (`SEC-07`). Layout never shifts above the stream point (`PERF-14`); the module and later content push downward only.

**Settled**: on `done`, the caret unmounts and the receipt completes with model, total latency, and computed cost. Focus returns to the input; Ask restores. Announcement per `A11Y` §4.

- `UX-05` Choreography stages are bound to real pipeline events with the 200ms minimum; no fixed-timer theater in production.
- `UX-06` The turn reducer's states match this section one-to-one and are the only source of UI state for a turn.

## 6. The answer state

### 6.1 Markers

`sup` elements, mono 11/500 accent, wash pill on hover/focus, `role="link"`, `tabIndex=0`, `aria-label="Source {n}: {source title}"`. Hover highlights the matching source row (even while the module is closed, harmlessly). Click/Enter: open the module, scroll the row into view (`block: 'nearest'`), flash it 1400ms.

### 6.2 The sources module (one box per answer)

Collapsed head = the receipt, a full-width button (`aria-expanded`), chevron right. Two receipt variants, switched by pin state:

- Unpinned (default): `{n} sources · top {sim} · threshold {T} · {ms} ms · {model} · ${cost}`
- Pinned (≥1120px): `{n} sources cited · see retrieval panel`

Below 1120px the unpinned variant always shows. Expanded body: source rows separated by dashed hairlines, each with `[n]` marker + breadcrumb title, mono score right, path line, serif quote snippet with left rule, and the link **"read at code.claude.com ↗"** opening `{page url}#{heading_anchor}` in a new tab (`rel="noopener"`), landing on the exact cited heading.

All receipt numbers are the server-measured, usage-derived values (`PERF-06`, `RAG-17`); the UI renders, never computes.

- `UX-07` Marker↔row linkage works exactly as specified, keyboard included.
- `UX-08` Every source link deep-links to its heading anchor and opens a new tab; `/evals` and internal links never do.

## 7. The refusal state

There are **two species of decline** (P4.4 amendment, rule-1 authorized), because calibration showed plausible off-corpus questions are not separable from weak answerable ones by cosine and so pass the server gate:

**(a) Server refusal** — the gate declined (nothing cleared `T`, no generation call). The full refusal state below, rendered from the refusal payload. This fires for clearly-off-corpus questions (e.g. "pizza dough").

**(b) Model-side decline** — the question passed the gate but the model found the sources insufficient and began its response with the decline sentinel `The Claude Code documentation doesn't cover this.`. Detected by the sentinel prefix on the stream; rendered as a decline (not a full answer), but with its **honest generation receipt** (a real model call happened: tokens + cost shown, not the embedding-only refusal receipt). Spec details land at P5; the sentinel detection and the two-species reducer states are part of P5.1.

Both share the same calm register and copy. **Server refusal** state:

> **{question}**
> The Claude Code documentation doesn't cover this. *(serif, answer-size)*
> Nothing retrieved cleared the confidence threshold, so no answer was generated. *(sans 14, ink-soft)*

Then one bordered block: centered rule `nearest sections · none cleared {T}`, followed by the near-miss rows (ink-soft, `excluded` tag, mono scores). Then "The corpus does cover" with topic chips (pill buttons from sync-derived coverage, `RAG-21`); clicking a chip submits `Tell me about {topic}`. Then the bare receipt line: `declined · {ms} ms · ${cost}` (embedding-only cost, displayed proudly).

- `UX-09` Refusals render only from the refusal payload (server refusal) or the sentinel-detected decline; no generation artifacts beyond the honest receipt, no red, no warning iconography.

## 8. Error, rate-limit, and cap states (not in the mock; normative here)

All render in-trail with the turn's anatomy, sans-voice body, no alarm styling; each produces one status announcement (`A11Y-14`).

- **Stream interrupted** (`done` never arrives): partial answer text is preserved as-is with a closing note beneath in sans 14 ink-soft: "The answer was interrupted. What streamed is above; nothing after it was lost, because nothing after it arrived." plus a "Try again" text button that resubmits the question. (`PERF-09` test covers this.)
- **Request failed** (non-stream error): "Something went wrong reaching the model. Your question wasn't charged. Try again." with retry.
- **Rate limited** (429 per-IP): "You've hit the request limit for now. It resets within a minute; the daily limit resets at midnight UTC."
- **Spend cap reached** (global): "This demo caps its own spending for the day. It resets at midnight UTC. The eval scores and source links still work while it rests."
- `UX-10` Every terminal failure state above is implemented with this copy, a preserved trail, and a working retry where listed.

## 9. The retrieval rail (pinned mode)

Visible only while `data-pin="on"` and viewport ≥ 1120px; sticky at top 44px beside the column. Content is the **process story for the last query only**: heading `Last query · retrieval`; stage summary block; passing sources with scores; the threshold rule; excluded candidates; foot line `corpus synced {time} ago · {pages} pages`. Empty state before any ask: "Ask a question and the retrieval details appear here."

Division of labor is absolute: the rail owns process, the trail owns evidence; no datum renders in both simultaneously (the receipt slims when the rail is open, per §6.2).

- `UX-11` The rail updates on every terminal state, including refusals; below 1120px it is hidden and the receipt reverts to full.

## 10. The dock

Fixed bottom, gradient fade into paper, inner width 660px. Ask bar: text input (`placeholder: "Ask the Claude Code docs…"`, `aria-label: "Ask a question"`, `maxlength 500`) + the one filled button, "Ask". Focus-within: border to accent, shadow bloom. Busy: input disabled, button disabled showing "…", always restored on any terminal state (implemented with a guaranteed-release pattern; a stuck dock is a defect class we have already met once).

Meta line, mono 10.5: left "single-turn · answers cite their sources", right live counter "{len} / 500".

- `UX-12` The dock is the only input path; its busy state is bound to the turn reducer and cannot strand.

## 11. Footer

End of trail, hairline above: "Built by [Brandon Church]({PORTFOLIO_URL}) · AI Product Engineer". The link opens a new tab. **`{PORTFOLIO_URL}` is a required build input**: the checklist's scaffold phase collects it from Brandon; building past that step with the placeholder is an audit failure.

- `UX-13` The footer contains exactly this line; the URL is supplied by Brandon before the UI phase completes.

## 12. /evals (the scoreboard)

Same chrome (header without history/retrieval controls, eyebrow, footer), reading column layout, rendering `evals/latest.json` only (`EVAL-16`). Top-to-bottom:

1. Title "Eval scores", serif; run meta line, mono: `run {id} · commit {sha} · {date}`.
2. Headline numbers as a mono figure row: retrieval `hit@5` and `MRR`; answer pass rate with its noise margin stated beside it (`± {M}, measured`); refusals `{passed}/{total} correctly declined`.
3. Per-category tables (sans rows, mono scores): answerable questions with per-check marks; the refusal list with "correctly declined" as the pass state, styled with the same calm register as the product's refusals; boundary questions with their expected behaviors.
4. Config snapshot block, mono: `k`, threshold + `calibrated_at`, models, embedding model.
5. Baseline delta line: `vs baseline: retrieval {±}, answers {±}` including honest negatives.

No charts in v1; typeset numbers in the instrument voice are the aesthetic. A run-history list is deferred.

- `UX-14` `/evals` renders committed artifacts verbatim, including regressions; nothing on the page is computed at request time.

## 13. Copy inventory (authored strings, verbatim, binding)

All strings above plus: skip link "Skip to question input" · status announcements exactly per `accessibility.md` §4 ("Searching the docs" / "{n} sources found, generating answer" / "Answer complete, {n} sources cited" / "Not covered by the docs · declined, {n} near-misses shown" / "Answer interrupted · partial answer preserved, retry available") · popover heading "Corpus freshness" · history heading "This session" · receipt keyword "declined" · suggestion label "Try one" · coverage label "The corpus does cover".

Style: `design-system.md` §8 governs (no em dashes, sentence case, interpuncts). The announcement strings adopt the interpunct forms shown here, superseding any em-dash renderings elsewhere.

- `UX-15` Authored strings ship exactly as inventoried; new strings follow §8 style and are logged as Tier 2 decisions.

## 14. Responsive behavior

- ≥1120px: full layout, rail available.
- <1120px: rail hidden, receipts full, layout single column (unchanged otherwise).
- Small viewports: 24px side padding holds; suggestion rows, module, and dock go full column width; nothing horizontal-scrolls at 320px-equivalent (`A11Y` reflow); touch targets ≥24px with primary controls at 44px (`A11Y-10`).

## 15. Client-island registry (the exhaustive `'use client'` list for `ENG-12`)

1. `AskDock` (input, busy state, counter)
2. `TurnStream` (the turn reducer: choreography, streaming, settled/refused/errored rendering, markers, chips)
3. `SourcesModule` (disclosure + marker linkage; owned by TurnStream's tree)
4. `HeaderControls` (history popover + retrieval toggle)
5. `SyncEyebrow` (freshness popover)
6. `RetrievalRail`

Everything else renders on the server. Additions to this list are Tier 2 with rationale.

- `UX-16` `'use client'` appears only in the components above.
