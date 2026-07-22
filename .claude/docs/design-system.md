# design-system.md

The approved visual system for Ask the Claude Docs, frozen as values.
Audience: the Claude Code session building this project. Status: **frozen**. Any deviation from a value in this document is a Tier 3 decision (see `CLAUDE.md`).

Rule IDs use the prefix `DS-`. Related docs: `ui-ux-spec.md` (surfaces and behavior), `accessibility.md` (the constraints these tokens were measured against), `performance.md` (motion and payload rules).

## 0. Reference artifact

The approved interactive mock lives at **`.claude/design/layout-mock-v10.html`** (Brandon places it there at scaffold time). It is the *illustrative* reference: open it, click through it, match its feel. Where the mock and these documents disagree, **the documents win**; the four known corrections to the mock are listed in §2.4 and `ui-ux-spec.md` §0.

- `DS-01` UI work is diffed against the reference mock at review; the corrections list is the only sanctioned divergence.

## 1. Principles (why the values are what they are)

1. **Three voices.** Serif is the answer speaking, sans is the interface, mono is the machine. Typography signals who is talking before a word is read. No element mixes voices.
2. **Glass box, scheduled.** Retrieval information earns screen time by when it matters: choreography while asking, one receipt line while reading, disclosure to verify, pinned rail to audit. Nothing process-shaped is permanently ambient except the receipt line and the sync eyebrow.
3. **Paper does the separating.** Borders are scarce; whitespace and rules carry structure. One box per answer (the sources module). No chat cosplay: no bubbles, no avatars, no alternating alignment.
4. **Light-only, dark-ready.** Every color is a token; a dark theme is a future token swap, not a rewrite. No dark styling ships in v1.
5. **Restraint is the premium.** Micro-interactions are small, fast, and informational. The one showpiece interaction is the citation-marker cross-highlight.

## 2. Color

### 2.1 Tokens (final, contrast-verified)

| Token | Value | Role |
|---|---|---|
| `--paper` | `#FAF7F0` | Page background |
| `--paper-raised` | `#F4F0E6` | Raised tint: receipt head hover, rail rows, misses block interior accents |
| `--card` | `#FFFEFA` | Card surfaces: sources module, rail box, popovers, ask bar |
| `--ink` | `#211F1A` | Primary text |
| `--ink-soft` | `#59543F` | Secondary text; also the "dimmed/excluded" text color (see 2.4) |
| `--ink-muted` | `#726C59` | Muted text: labels, captions, scores, meta lines |
| `--accent` | `#99512A` | Accent: links, markers, receipt keywords, Ask button fill, focus ring |
| `--accent-deep` | `#7F421F` | Accent hover/active |
| `--accent-wash` | `rgba(153,81,42,.10)` | Hover/highlight wash: suggestions, marker pills, row highlight |
| `--line` | `#E7E2D5` | Decorative hairlines: dividers, card borders, turn separators |
| `--line-graphic` | `#857F6E` | Meaning-bearing lines: the threshold rule, ask-bar border, nav divider |
| `--ok` | `#1D9E75` | Sync status dot only |

### 2.2 Measured contrast (WCAG, computed 2026-07-22)

| Pair | paper | raised | card | Requirement | Verdict |
|---|---|---|---|---|---|
| ink | 15.39 | 14.47 | 16.31 | 4.5 | pass |
| ink-soft | 7.10 | 6.67 | 7.53 | 4.5 | pass |
| ink-muted `#726C59` | 4.90 | 4.61 | 5.20 | 4.5 | pass |
| accent | 5.51 | 5.18 | 5.84 | 4.5 | pass |
| accent-deep | 7.27 | 6.83 | 7.70 | 4.5 | pass |
| card on accent (Ask button) | 5.84 | · | · | 4.5 | pass |
| line-graphic as graphics | 3.73 | 3.51 | 3.96 | 3.0 | pass |
| ok dot as graphic | 3.17 | · | 3.36 | 3.0 | pass on paper/card only |

- `DS-02` These pairs are re-verified in CI-adjacent tooling if any token value changes (per `A11Y-17`, the measured table must stay truthful).
- `DS-03` The `--ok` dot appears only on `--paper` or `--card`, never on `--paper-raised`, and always beside its text equivalent.
- `DS-04` `--line` never carries meaning; anything semantic (the threshold rule above all) uses `--line-graphic`.

### 2.3 Usage rules

- Accent is scarce: markers, links, receipt key numbers, one filled button (Ask), focus rings, active toggle states. Never body text, never backgrounds larger than a wash.
- Text on accent fill is `--card`. There is exactly one filled button in the product.
- `DS-05` No color not in §2.1 appears anywhere in the UI. No opacity applied to text (see 2.4).

### 2.4 Corrections to the v10 mock (mock renders the old values)

1. Muted ink: mock `#857F6E` → ship `#726C59` (contrast).
2. Threshold rule / ask-bar border / nav divider: mock `--line-strong #B8AE96` → ship `--line-graphic #857F6E` (3:1 graphics floor). `#B8AE96` is retired.
3. Excluded/dimmed rows: mock uses `opacity:.62` → ship solid `--ink-soft` text plus the word "excluded" (no opacity on text, ever).
4. Fonts: mock loads Google Fonts CDN → ship self-hosted `next/font` (§3.3).

## 3. Typography

### 3.1 Families (the gavel: Pairing A)

| Voice | Family | Fallback stack |
|---|---|---|
| Answer (serif) | Source Serif 4 (variable: wght, opsz) | Georgia, serif |
| Interface (sans) | Inter (variable: wght) | system-ui, sans-serif |
| Instrument (mono) | IBM Plex Mono (400, 500) | ui-monospace, monospace |

### 3.2 Type roles (extracted from v10)

| Role | Voice | Size | Weight | Line-height | Notes |
|---|---|---|---|---|---|
| Thesis (first visit) | serif | 27px | 400 | 1.35 | max-width 32ch; `<em>` accents in `--accent` italic |
| Thesis (compact) | serif | 18px | 400 | 1.35 | after first ask |
| Wordmark | serif | 19px | 600 | · | · |
| Question anchor | sans | 19px | 600 | · | letter-spacing −0.01em |
| Answer body | serif | 17.5px | 400 | 1.75 | paragraphs spaced 14px |
| Decline line | serif | 17.5px | 400 | 1.7 | · |
| Source quote | serif | 14.5px | 400 | 1.6 | left rule 2px `--line` |
| UI body / suggestions | sans | 15px | 400 | 1.55 | · |
| Source titles / rows | sans | 14px | 400–500 | · | · |
| Small UI (chips, links, sub-copy) | sans | 12.5–14px | 400 | · | · |
| Receipt / stages / rail data | mono | 11.5px | 400 | · | keywords in `--accent` |
| Markers `[n]`, scores | mono | 11px | 500 | · | · |
| Eyebrow stamp, popover meta, dock meta | mono | 10.5–11px | 400 | · | 11px floor for standalone status text |
| Popover section labels | mono | 10–10.5px | 500 | · | uppercase, letter-spacing .07em; the only uppercase in the product |

- `DS-06` No font size below 10px anywhere; standalone informational text no smaller than 11px.
- `DS-07` Sentence case everywhere except the popover section labels named above. No other uppercase, no title case.

### 3.3 Loading (`next/font`, per ENG §6 and PERF-04/05)

Self-hosted via `next/font/google`: Source Serif 4 variable (latin subset, `wght 400..600`, opsz axis), Inter variable (latin, `wght 400..600`), IBM Plex Mono 400 + 500 (latin). ≤ 5 files total, `display: 'swap'`, exposed as CSS variables `--serif`, `--sans`, `--mono`.

- `DS-08` Zero external font origins; the three families load exactly as specified.

## 4. Layout and spacing

| Token | Value |
|---|---|
| Shell max-width | 1180px, 24px side padding |
| Reading column | 660px |
| Rail width | 296px; column↔rail gap 56px |
| Rail behavior | `position: sticky; top: 44px` |
| Breakpoint | 1120px: rail hidden, receipt reverts to full process line |
| Turn rhythm | 52px above a turn; 44px padding after the separator rule |
| Sources module offset | 20px above, internal padding 11–14px |
| Radii | controls 8px; cards/modules 10px; ask bar 12px; pills 999px |
| Dock | fixed bottom; 30px gradient fade into `--paper`; inner column 660px |
| Eyebrow stamp | left-aligned, 26px top padding; intro follows at 14px |

- `DS-09` The reading column is 660px everywhere; nothing except the rail lives outside it.

## 5. Borders, elevation, focus

- Hairlines: 1px `--line`. Dashed 1px `--line` separates source rows inside the module. The nav divider is a 1×14px `--line-graphic` block.
- Elevation: exactly two shadows in the product. Ask bar: `0 2px 14px rgba(33,31,26,.07)`, blooming to `0 2px 18px rgba(153,81,42,.14)` on focus-within. Popovers: `0 6px 24px rgba(33,31,26,.10)`. Nothing else casts.
- Focus: `outline: 2px solid var(--accent); outline-offset: 2px` on every focusable element, never removed (`A11Y-07`).
- `DS-10` No shadow, gradient, or blur beyond the two shadows and the dock fade named here.

## 6. Motion

### 6.1 Tokens

`--t-fast: .15s` (hovers, washes) · `--t-base: .25s` (reveals, expansion, chevron) · `--ease: cubic-bezier(.3,.7,.4,1)` (everything eased).

### 6.2 Catalog (every animation in the product; nothing else animates)

| Animation | Spec | Purpose |
|---|---|---|
| Choreography stage line | fade + 4px rise, t-base | narrate pipeline stages |
| Choreography source row | fade + 5px rise, staggered ~130–150ms | sources surfacing |
| Threshold rule draw | scaleX 0→1, .4s | the bar being set |
| Stream caret | 1s step blink | generation in progress |
| Sources expansion | grid-template-rows 0fr→1fr, t-base | receipt opens into evidence (sanctioned PERF-13 exception, below reading line only) |
| Chevron | rotate 180°, t-base | open state |
| Marker/row highlight | `--accent-wash` background, t-fast; click-flash held 1400ms | citation linkage |
| Suggestion hover | wash + 6px indent + arrow 5px slide, t-fast | affordance |
| Buttons (Ask, toggle, chips) | −1px lift on hover, .97–.98 scale on press, t-fast | tactility |
| Ask bar focus | border → accent + shadow bloom, t-base | attention |
| Nav link underline | left→right 1px accent rule, t-fast | affordance |
| History jump flash | question text → accent, held 1400ms, .6s ease | wayfinding |
| Sync dot breathe | opacity 1→.45, 3.2s loop | live status |
| Turn arrival scroll | smooth scroll to `block: start` | journal turns the page |

- `DS-11` Only `transform`, `opacity`, and the two sanctioned exceptions (sources grid expansion; ask-bar border-color/shadow) animate. Timings come from §6.1 tokens; no new durations.
- `DS-12` `prefers-reduced-motion: reduce` disables every animation and transition above; all states present instantly with identical information (`A11Y-19`). The reference mock implements this with a global media-query kill switch; production does the same.
- Real-event pacing note: choreography timers in the mock are placeholders; production paces stages to actual pipeline events with a 200ms minimum display per stage (`ui-ux-spec.md` §5 owns this).

## 7. Iconography

None. The product's only glyphs are typographic: `→ ▾ ↗ ✓ ·` and the CSS-drawn status dot. No icon font, no SVG icon set.

- `DS-13` No icon library enters the dependency tree (reinforces `ENG-02`).

## 8. Copy style (binding for all authored strings)

- **No em dashes in any authored copy, anywhere in the product.** Interpuncts (·), periods, colons, or restructured sentences instead. Model-generated answer text is exempt; everything else is not. This is a standing rule from Brandon, not a preference to relitigate.
- Sentence case (DS-07). Interpunct-separated mono data strings. Verb-first control labels ("Show retrieval details", "Ask"). No exclamation marks in system copy. Contractions welcome.
- `DS-14` A grep for the em dash character over authored copy (components, docs pages, UI strings) returns zero; this is a CI-adjacent audit check at the UI phase gate.

---

## Decision summary (for architecture.md's log; completes the "pending" design row)

| Decision | Chosen | Rejected |
|---|---|---|
| Type | Source Serif 4 / Inter / IBM Plex Mono (Pairing A) | Fraunces/Instrument Sans/Space Mono (more personality, less gravity for a grounding product) |
| Muted ink | #726C59 (4.6:1 worst case) | Mock's #857F6E (3.5:1, fails small-text AA) |
| Semantic lines | Dedicated `--line-graphic` at 3:1+ | One line color for decoration and meaning |
| Dimming | Solid ink-soft + "excluded" label | Opacity on text (contrast-unstable) |
| Icons | Typographic glyphs only | Icon library (dependency + visual noise) |
| Elevation | Two shadows total | Ambient card shadows (paper does the separating) |
