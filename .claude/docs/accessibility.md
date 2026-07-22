# accessibility.md

Accessibility requirements for Ask the Claude Docs. WCAG 2.2 AA and Section 508 conformance, written as hard pass/fail rules.
Audience: the Claude Code session building this project. Status: **frozen** once approved.

This document is written as **constraints the design and implementation must satisfy** — it precedes the visual design deliberately. Where the design session later specifies concrete colors, components, or motion, those specifications must comply with this doc; a conflict is resolved by changing the design, or by an explicit Tier 3 amendment here — never by quietly shipping the conflict.

Accessibility is this project's professional signature. The bar is not "passes axe" — axe catches perhaps a third of real failures. The bar is: every rule below verified, plus manual screen-reader passes on the golden paths. Rule IDs use the prefix `A11Y-`.

Related docs: `ui-ux-spec.md` (surfaces these rules bind), `performance.md` (motion/CLS overlap), `success-criteria.md` (which of these gate acceptance).

---

## 1. Conformance frame

- Target: **WCAG 2.2 Level AA**, full conformance on every surface, including the new-in-2.2 criteria (Focus Not Obscured 2.4.11, Target Size 2.5.8, Focus Appearance guidance).
- Instruments: axe (via Playwright) with **zero violations** per surface; Lighthouse a11y score 100 (floor, not bar); manual keyboard pass and screen-reader pass per §8.

**Rules**
- `A11Y-01` axe reports zero violations on every surface in every state (including refusal, error, and rate-limited states — error states are where a11y quietly dies).
- `A11Y-02` Any axe rule exclusion/downgrade is a Tier 3 decision requiring Brandon's approval, recorded inline in the test config with reason.

## 2. Structure and semantics

- One `<h1>` per page; heading levels never skip; landmarks: `header`, `main`, `footer`, with the conversation as the primary content of `main`.
- A skip link ("Skip to question input") is the first focusable element.
- `lang="en"` on `<html>`; every route has a distinct, descriptive `<title>` (Metadata API per ENG-15).
- The conversation history is an `<ol>` of turns (it is a sequence; the semantics should say so). Each turn is an `<article>` with an accessible name derived from its question.
- Receipts, citation lists, and near-miss lists use list semantics. Data presented visually as "key · value · value" mono strings must also be structurally intelligible (see §5 receipt rule).

**Rules**
- `A11Y-03` Landmark structure and heading hierarchy as above; verified per surface.
- `A11Y-04` Skip link present, visible on focus, and functional.
- `A11Y-05` Conversation turns are list-structured articles with accessible names.

## 3. Keyboard

Complete keyboard operability, enumerated per locked IA surface:

| Surface | Required keyboard path |
|---|---|
| Landing | Skip link → question input → each suggested question (including the off-corpus one) → footer links. Enter on a suggestion submits it. |
| Answer state | Tab order: answer content links (if any) → receipt expand/collapse → each citation marker `[n]` → each citation card's disclosure button → links within expanded cards. |
| Refusal state | Receipt → near-miss list → each coverage chip (chips submit their topic as a question on Enter). |
| Pinned panel | The pin control is a toggle button reachable in the main tab order; panel contents join the tab order only while pinned. |
| /evals | Standard document navigation; any expandable per-question rows are disclosure buttons. |
| Error / rate-limit | The retry action (or the explanation's focusable content) is reachable and operable. |

- Citation markers `[n]` are focusable links whose accessible name is meaningful ("Source 1: Hooks reference — PreToolUse"), not "[1]". Activating a marker moves focus to its citation card.
- Expanded citation cards are **disclosures** (button + `aria-expanded` + `aria-controls`), not dialogs: no focus trap, Escape optional, Tab proceeds naturally.
- No positive `tabindex` anywhere. DOM order = visual order = tab order (this also serves the CLS discipline in `PERF` §6).

**Rules**
- `A11Y-06` Every interactive element is reachable and operable by keyboard alone; the per-surface paths above are walked in a Playwright test and in the manual pass.
- `A11Y-07` Focus is always visible: a focus indicator with ≥ 3:1 contrast against adjacent colors, never `outline: none` without an equal-or-better replacement, and never obscured by other content (WCAG 2.4.11).
- `A11Y-08` Citation markers carry descriptive accessible names and move focus to their card on activation.
- `A11Y-09` No positive `tabindex`; DOM order matches visual order.
- `A11Y-10` All pointer targets ≥ 24×24 CSS px (WCAG 2.5.8); the design should aim for 44×44 on primary controls.

## 4. Streaming (the signature pattern)

The naive implementation announces every token and turns a screen reader into a machine gun; the correct pattern is specified here exactly.

- One visually-hidden `aria-live="polite"` **status region** exists per conversation, separate from the answer text. It announces state transitions with short messages: "Searching the docs" → "5 sources found, generating answer" → "Answer complete, 2 sources cited" → or "Not covered by the docs — declined, 3 near-misses shown."
- The streaming answer text itself is **not** in a live region. Tokens append silently; the completion announcement invites reading.
- The answer container carries `aria-busy="true"` from submission until the `done` (or refusal/error) event, then `aria-busy="false"`.
- Focus is never moved programmatically during streaming. On completion, focus stays where the user put it; the status announcement is the notification channel.
- The error and rate-limit states announce through the same status region ("Answer interrupted — partial answer preserved, retry available").

**Rules**
- `A11Y-11` The token stream is never inside a live region; announcements happen only at the state transitions listed above.
- `A11Y-12` `aria-busy` bounds the streaming window on the answer container.
- `A11Y-13` No programmatic focus movement during or at the end of streaming.
- `A11Y-14` Every terminal state (answered, refused, errored, rate-limited) produces exactly one status announcement.

## 5. Text alternatives and non-visual equivalence

- The choreography is decorative narration of data that must exist accessibly: the sources, scores, and threshold information are real DOM content (the receipt and source lists), not canvas/SVG-only presentation. A screen-reader user gets the same facts as a sighted user, minus only the animation.
- The receipt's mono string ("5 sources · top 0.61 · …") is accompanied by structured semantics: a visually-hidden expansion or `aria-label` rendering it as prose ("5 sources retrieved, top similarity 0.61, threshold 0.43, 212 milliseconds, model haiku-4.5, cost $0.0071").
- Near-miss dimming conveys "excluded" via text (the word "excluded" / "below threshold" is present, per the approved mocks), never via opacity alone.
- The sync status dot has a text equivalent (it already does: the timestamp); the dot itself is `aria-hidden`.
- Any icon-only control carries `aria-label`; decorative icons are `aria-hidden="true"`.

**Rules**
- `A11Y-15` All retrieval data is real text in the DOM; nothing is conveyed by animation, color, or opacity alone.
- `A11Y-16` The receipt has a structured/prose accessible rendering, not just the display string.

## 6. Contrast (constraints the palette must clear)

Stated as ratios because the palette is not yet frozen — when the design session locks tokens, every pair below is verified numerically and the results recorded in `design-system.md`:

- Body and answer text vs its background: ≥ 4.5:1. Large text (≥ 24px / ≥ 19px bold): ≥ 3:1.
- The mono instrument text — including muted values and scores — is *informational*, not decorative: ≥ 4.5:1 everywhere it appears, including on raised/tinted surfaces.
- Excluded/near-miss rows: still content, still ≥ 4.5:1. "Dimmed" is achieved within contrast bounds (e.g. a lighter-but-conformant ink), not by dropping below them.
- UI component boundaries that carry meaning (input borders, the threshold rule, focus indicators): ≥ 3:1 against adjacent colors.
- Link text distinguishable from body by more than color alone in running text (underline or weight), or ≥ 3:1 against surrounding text plus a non-color cue on hover/focus.

**Rules**
- `A11Y-17` Every token pair used in the shipped design has its measured ratio recorded in `design-system.md`; any pair below the applicable ratio is a design defect.
- `A11Y-18` No information is conveyed by color alone (threshold pass/fail, sync status, excluded rows all carry text).

## 7. Motion

- Every animation — the choreography, card expansion, receipt tuck — is gated behind `prefers-reduced-motion: no-preference`. The reduced experience presents final states instantly with identical information and identical functionality (`PERF` §6 owns the mechanics; this doc owns the guarantee).
- Nothing flashes more than 3 times per second. Nothing auto-plays longer than 5 seconds without a pause/stop control — the choreography completes in ~3–4s and is therefore exempt, but this rule bounds any future ambient motion.

**Rules**
- `A11Y-19` With reduced motion active, every golden-path walkthrough passes with zero functional or informational difference.

## 8. Manual verification (what instruments can't check)

Performed at the UI phase gate and again at acceptance (`success-criteria.md` owns scheduling):

1. Full keyboard walk of every surface path in §3, no mouse.
2. Screen reader pass — VoiceOver (macOS/Safari) minimum, NVDA (Windows/Firefox) if available — through: ask → streamed answer → open citations → follow a docs link; and the refusal path. Verify the §4 announcement script verbatim.
3. 200% browser zoom: no loss of content or function, no horizontal scroll at 320px-equivalent width (WCAG 1.4.10 reflow).
4. Reduced-motion pass per §7.
5. Forced-colors/high-contrast mode smoke check: content remains legible and focus visible.

**Rules**
- `A11Y-20` The manual pass is a named checklist step with its findings recorded in the handoff; "ran axe" does not satisfy it.

---

## Decision summary (for architecture.md's log)

| Decision | Chosen | Rejected |
|---|---|---|
| Streaming announcements | State-transition status region; token stream outside live regions | Live-region on the answer text (token-by-token announcement storm) |
| Citation cards | Disclosure pattern, no trap | Popover/dialog pattern (focus management complexity for no benefit — and rejected already on design grounds) |
| Data presentation | All retrieval data as real DOM text; animation as narration only | Visual-only choreography (inequivalent experience) |
| Doc sequencing | A11y written before visual design, as constraints | A11y as post-design audit (chases the design; conflicts ship) |
