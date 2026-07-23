# build-checklist.md

The master execution document for Ask the Claude Docs v1. Execute in order. This file is **living state**: update it as you work, so any fresh session knows exactly where the build stands.

## How to use this document

**Session start protocol:** read `/CLAUDE.md`, then this file top to bottom, find the first step not `[x]`, read that step's `reads:` list in full (mandatory even if the content feels fresh: re-reading is the mechanism), then work.

**Status markers** (the ONLY edits permitted to this file, per CLAUDE.md rule 1):
- `[ ]` not started · `[~]` in progress · `[x]` complete · `[!]` blocked (say why in the log)
- After each step: set the marker AND append one line to the Build log at the bottom: `{step} · {date} · {one-line outcome} · {Tier 2 decisions if any}`

**Step anatomy:** every step has `reads:` (execute before implementing), tasks, a **Self-audit** (verify each cited rule ID against its doc; remediate until green BEFORE presenting), and **🔍 Brandon review** (the handoff: say "Done", list exactly this, give the path or URL). Steps tagged **🔶 BRANDON** are his actions: stop, tell him precisely what to do, wait, then verify his input in the same step.

**Gates** (steps ending in G#) are mechanical: run the listed instruments; any red = the gate fails = fix before proceeding. Never look past the current phase's gate.

**Spending note:** ingestion, calibration, and judged evals spend real API money (cents to ~$1 per event, per EVAL §6). That is sanctioned. Tests never spend (ENG-17).

---

## Phase 0 · Preflight (Brandon's wiring, verified)

**P0.1 🔶 BRANDON · Accounts and keys** `[x]`
reads: `.claude/docs/security.md` §1
Brandon supplies, into `.env.local` (never committed): `ANTHROPIC_API_KEY` (funded), `OPENAI_API_KEY` (embeddings; new key if needed), Supabase project → pooled `DATABASE_URL`, Upstash Redis → `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, and the portfolio URL (for UX-13, used in P5.8).
Self-audit: SEC-01 posture (file untracked), every variable present and non-placeholder.
🔍 Brandon review: confirm four services exist and keys pasted; nothing else to check.

**P0.2 🔶 BRANDON · Repo and reference artifact** `[x]`
reads: `.claude/docs/design-system.md` §0
Brandon: the GitHub repo exists (it does); place `layout-mock-v10.html` at `.claude/design/layout-mock-v10.html`; confirm `.claude/docs/` contains all twelve docs and root `CLAUDE.md`.
Self-audit: DS-01 (mock present at exact path), doc inventory matches CLAUDE.md's table.
🔍 Brandon review: `ls .claude/docs` output shown; mock opens in a browser.

---

## Phase 1 · Scaffold and standards

**P1.1 · Scaffold Next.js 16** `[x]`
reads: `.claude/docs/engineering-standards.md` §1–3, §6 · `/CLAUDE.md`
`create-next-app` per ENG stack (TS strict, App Router, no Tailwind); prune to the ENG §3 structure; pin versions; commit lockfile. Record exact versions in the log.
Self-audit: ENG-01, ENG-04, ENG-05; `npm ci && npx tsc --noEmit` clean.
🔍 Brandon review: repo tree matches ENG §3; `npm run dev` boots to a blank page.

**P1.2 · Environment and config spine** `[x]`
reads: `engineering-standards.md` §4–5 · `rag-design.md` §8 · `security.md` §1
`lib/env.ts` (zod, `server-only`, boot-time parse), `.env.example`, `lib/config.ts` with every RAG §8 parameter; threshold entry `T` marked `UNCALIBRATED`.
Self-audit: ENG-06/09/10/11, RAG-19 (grep for stray literals), SEC-01.
🔍 Brandon review: `.env.example` lists everything you pasted in P0.1; boot fails loudly with a variable removed.

**P1.3 · Tokens, fonts, base styles** `[x]`
reads: `design-system.md` §2–5, §8 · `accessibility.md` §6
`app/tokens.css` with the §2.1 palette (corrected values, not the mock's), `next/font` per DS §3.3, global focus style, base typography roles as CSS.
Self-audit: DS-05/06/07/08, PERF-04/05 (font files counted), A11Y-07 focus visible on a test element.
🔍 Brandon review: a type-specimen scratch page in the three voices; colors sampled match §2.1 hex.

**P1.4 · CI skeleton and hygiene checks** `[x]`
reads: `engineering-standards.md` §9 · `security.md` §5, §7 · `performance.md` §7
`ci.yml` in ENG-19 order (later stages stubbed but wired), lint+prettier, security headers in `next.config` with an integration test, secret-shape grep, em-dash grep (DS-14), Actions SHA-pinned.
Self-audit: ENG-19, SEC-12/13/16/17, DS-14, ENG-14.
🔍 Brandon review: a PR shows the pipeline running; headers visible in devtools on `npm start`.

**P1.G1 · Gate** `[x]` — `npm ci`, typecheck, lint, build, headers test, both greps: all green in CI. Log the run URL.

---

## Phase 2 · Data and ingestion

**P2.1 · Schema and migrations** `[x]`
reads: `rag-design.md` §3–4 · `engineering-standards.md` §2 (no-ORM)
Migrations for `documents`, `chunks`, sync log, spend counter support; HNSW index exactly as RAG §4; migration runner script. Apply to Supabase.
Self-audit: ENG-03, RAG-08 shape, RAG-10/11 operator + model filter present in the query module stubs.
🔍 Brandon review: Supabase table editor shows the tables; `\d chunks` equivalent screenshot.

**P2.2 · Fetch and parse the corpus** `[x]`
reads: `rag-design.md` §1
`llms.txt` discovery, per-page `.md` fetch, markdown validation with skip+log (the changelog case), raw storage with page hashes.
Self-audit: RAG-01/02/03; the skip log names at least the known non-markdown page.
🔍 Brandon review: row count of `documents`; the skip log contents.

**P2.3 · Chunker** `[ ]`
reads: `rag-design.md` §2–3 · `engineering-standards.md` §8
Heading-aware splitter, size merge/split rules, breadcrumb prefix, atomic fences/tables, deterministic IDs, tiktoken counting. Fixture-driven unit tests for every RAG §2 rule.
Self-audit: RAG-04/05/06/07/08 each with a named passing test (ENG-18).
🔍 Brandon review: run the chunker on the real hooks page; eyeball five printed chunks with IDs and breadcrumbs.

**P2.4 · Embedder and upsert planner** `[ ]`
reads: `rag-design.md` §3, §5, §9
Shared embed function (RAG-12), batch embedding, hash-diff planner (new/changed/unchanged/deleted), sync-log writer, coverage + freshness derivation.
Self-audit: RAG-12, RAG-09 via fixture (unchanged corpus → zero calls, tested with the mocked client), RAG-21/22.
🔍 Brandon review: planner dry-run output on a doctored fixture: shows exactly which chunks it would embed and why.

**P2.5 · First real ingestion** `[ ]` *(spends: single-digit cents)*
reads: `rag-design.md` §5, §9
Run `scripts/ingest.ts` against the live docs with real keys. Then run it again immediately.
Self-audit: RAG-20 live (second run: zero embedding calls, log proves it); chunk count sane; spot-check three chunks against the live site.
🔍 Brandon review: both sync-log rows; the second one's zeros are the staleness story working.

**P2.6 🔶 BRANDON · Sync Action and repo secrets** `[ ]`
reads: `rag-design.md` §9 · `security.md` §7
Opus writes `sync.yml` (daily + manual, loud failure). Brandon adds repo secrets: `OPENAI_API_KEY`, `DATABASE_URL` (Actions need them; `ANTHROPIC_API_KEY` added here too for Phase 4). Brandon triggers a manual run.
Self-audit: RAG-22, SEC-17; the Action run is green with a zero-work log.
🔍 Brandon review: the Actions tab run; secrets page shows three names, values hidden.

**P2.G2 · Gate** `[ ]` — Unit/integration suite green; live corpus in Supabase; idempotency proven twice (fixture + live); Action green. Log counts and run URLs.

---

## Phase 3 · Retrieval and the API

**P3.1 · Retriever and threshold partition** `[ ]`
reads: `rag-design.md` §6 · `performance.md` §3, §5
Query embed (shared fn), top-k SQL with model filter, similarity computation, partition against `T` (UNCALIBRATED tolerated until P4.4), refusal decision, timings with `performance.now()`.
Self-audit: RAG-10/11/13/14/15, PERF-06/10.
🔍 Brandon review: a CLI probe: your question in, five scored chunk IDs out, partition shown.

**P3.2 · Prompt templates and generation client** `[ ]`
reads: `rag-design.md` §7 · `security.md` §2–3
System + sources templates in one module, question isolated in the user turn, Haiku default + Sonnet flag from config, `max_tokens` cap.
Self-audit: RAG-18, SEC-04/05/08, PERF-11.
🔍 Brandon review: the rendered prompt for a sample question, printed; confirm the structure reads as §7 specifies.

**P3.3 · SSE route and stream library** `[ ]`
reads: `rag-design.md` §7 · `performance.md` §4 · `engineering-standards.md` §6–7
`/api/ask`: zod-strict input, Node runtime declared, `no-store`, events `sources → text* → done` with shared types, refusal payload path (no generation call), snippet-only sources payload, error events. Client parser + turn reducer skeleton.
Self-audit: RAG-16/17, ENG-07/08/13/14, PERF-07/08/12, SEC-06 (grep), integration tests: event order, refusal makes zero generation calls, typed 400s.
🔍 Brandon review: `curl -N` transcript of one answer and one refusal; the sources event visibly precedes text.

**P3.4 · Rate limit, spend cap, middleware** `[ ]`
reads: `security.md` §4 · `rag-design.md` §8
Upstash sliding window in middleware (`/api/ask` only, fail-open, logged), spend counter accumulating usage-derived cost checked pre-generation (fail-closed), both from config, typed 429/cap responses matching UX §8 copy.
Self-audit: SEC-09/10/11, integration tests for both failure postures (mocked Upstash down).
🔍 Brandon review: hammer the endpoint with a loop; watch the 429 arrive; cap test with a temporarily tiny cap value.

**P3.G3 · Gate** `[ ]` — Full suite green; ten live queries through the route: PERF §3 segments recorded and within budget; refusal round-trip under 600ms p95. Log the numbers.

---

## Phase 4 · Eval harness and calibration

**P4.1 · Test set authoring** `[ ]`
reads: `eval-harness.md` §1 · `rag-design.md` §3
Author `evals/testset.json`: 20 answerable (user phrasing, coverage spread, gold `chunk_id`s from the live corpus), 5 refusal (plausible), 3 boundary with expectations. Dangling-gold check.
Self-audit: EVAL-01/02/03; every corpus top-level area represented.
🔍 Brandon review: read all 28 questions (five minutes); veto any that smell like paraphrase or feel unnatural. Your G2i eye is the audit here.

**P4.2 · Retrieval eval runner** `[ ]`
reads: `eval-harness.md` §2, §8 · `engineering-standards.md` §8
Runner imports the production retriever; hit@5, MRR, per-question records; deterministic; `npm run eval:retrieval`; run artifact schema per EVAL §8.
Self-audit: EVAL-04/05, EVAL-17.
🔍 Brandon review: first real retrieval numbers. Whatever they are, they are the truth we tune against.

**P4.3 · Retrieval iteration to floor** `[ ]` *(spends: cents)*
reads: `eval-harness.md` §2 · `rag-design.md` §2, §6 · `success-criteria.md` AC-01/02
If hit@5 < 0.85: diagnose per-question, adjust only within doc-sanctioned space (chunk sizing within RAG §2 bounds, k stays 5, gold-label fixes with changelog entries). Every change: re-run, record.
Self-audit: AC-01/02 floors met; EVAL-03 for any test-set edits; config still RAG-19-clean.
🔍 Brandon review: the before/after table per change; this is the "prove the change helped" muscle the whole project exists for.

**P4.4 · Threshold calibration** `[ ]` *(spends: cents)*
reads: `eval-harness.md` §7 · `rag-design.md` §6
Run the §7 procedure; resolve overlaps by inspection; write `T`, `calibrated_at`, run ID into config; commit distributions.
Self-audit: EVAL-14/15, RAG-15; UNCALIBRATED marker gone.
🔍 Brandon review: the two distributions and where the line fell; sanity-check the gap story.

**P4.5 · Judge, noise, baseline** `[ ]` *(spends: ~$1 total)*
reads: `eval-harness.md` §3–5
Judge runner (Sonnet, temp 0, strict JSON, four binary checks), refusal metadata assertions, full suite ×3 for noise margin `M`, then the explicit baseline commit.
Self-audit: EVAL-07/08/09/10/12; AC-03 floor met at baseline.
🔍 Brandon review: the baseline numbers and `M`; approve the re-baseline commit yourself.

**P4.6 · Eval CI wiring** `[ ]`
reads: `eval-harness.md` §5–6, §8
`evals.yml`: retrieval on every PR, judged on path filters, regression policy enforced, artifacts committed, `latest.json` updated, post-sync gold validation.
Self-audit: EVAL-06/11/13/16-adjacent (artifact plumbing), ENG-19 integration.
🔍 Brandon review: open a trivial PR touching `lib/rag/`; watch the full suite trigger and gate.

**P4.G4 · Gate** `[ ]` — Baseline committed with noise margin; AC-01/02/03 floors green; calibrated `T` in config; eval CI demonstrated on a real PR. Log all numbers.

---

## Phase 5 · The interface

Every P5 step's reads include `.claude/design/layout-mock-v10.html` (open it, drive it) alongside the cited docs. Build to the mock; ship the §2.4 corrections.

**P5.1 · Turn reducer and stream client** `[ ]`
reads: `ui-ux-spec.md` §5 · `engineering-standards.md` §7 · `performance.md` §4, §6
The state machine (idle→retrieving→streaming→settled|refused|errored), SSE consumption, event-paced choreography timing with 200ms minimums, guaranteed dock release.
Self-audit: ENG-16, UX-05/06/12, PERF-14 discipline in the render path.
🔍 Brandon review: a dev harness page replaying a recorded SSE transcript; watch the lifecycle against the mock side by side.

**P5.2 · Dock, hero, suggestions, eyebrow** `[ ]`
reads: `ui-ux-spec.md` §3–4, §10 · `design-system.md` §3–6 · `accessibility.md` §2–3
Landing exactly per spec: suggestions from the eval set's strongest answerables + one refusal entry; eyebrow with sync-derived popover; skip link; compact-hero swap. Plus the full Metadata API pass: title template, description, OG + Twitter card with a static image, canonical, favicons, viewport.
Self-audit: UX-03/04/12, A11Y-03/04, RAG-21 (no hardcoded corpus facts), ENG-15 (every metadata item present), DS conformance.
🔍 Brandon review: cold-load the page next to the mock's first-visit state; they should be twins with corrected colors.

**P5.3 · Answer state: streaming, markers, sources module** `[ ]`
reads: `ui-ux-spec.md` §5–6 · `security.md` §3 · `accessibility.md` §3, §5 · `performance.md` §6
Serif stream with caret, tokenizer-built markers (SEC-07), cross-highlight + click behavior keyboard-complete, the module with both receipt variants and real values, deep links with anchors.
Self-audit: UX-07/08, SEC-06/07, A11Y-08/09/15/16, PERF-12/13/14, DS §6.2 timings.
🔍 Brandon review: ask the hooks question live; run the W1 walkthrough informally.

**P5.4 · Refusal state** `[ ]`
reads: `ui-ux-spec.md` §7 · `design-system.md` §2 (calm register)
Full refusal anatomy, chips submitting topics, embedding-only receipt.
Self-audit: UX-09, A11Y-18 (excluded conveyed by text), zero alarm styling.
🔍 Brandon review: ask the off-corpus suggestion live; W2 informally.

**P5.5 · Header controls, history, retrieval rail** `[ ]`
reads: `ui-ux-spec.md` §2, §9 · `accessibility.md` §3
Nav in exact order, verb-labeled toggle, session history with jump+flash, the rail owning process with the receipt slimming, 1120px behavior.
Self-audit: UX-02/11, A11Y-06 paths for these controls.
🔍 Brandon review: pin, ask, watch the receipt slim; jump via history.

**P5.6 · Streaming accessibility layer** `[ ]`
reads: `accessibility.md` §4–5 · `ui-ux-spec.md` §13
The status live region with the exact interpunct announcement strings, `aria-busy` bounds, no focus theft, receipt prose rendering.
Self-audit: A11Y-11/12/13/14/16.
🔍 Brandon review: VoiceOver on for one ask; count the announcements: exactly the script, nothing else.

**P5.7 · Error, rate-limit, cap states** `[ ]`
reads: `ui-ux-spec.md` §8 · `performance.md` §4
All four states with verbatim copy, partial-stream preservation, retry, plus `error.tsx`/`not-found.tsx` in tokens.
Self-audit: UX-10, PERF-09 behavior (test lands in P6), A11Y-01 scope includes these states.
🔍 Brandon review: dev-toggle each state; read every string aloud; they should sound like the product, not like errors.

**P5.8 🔶 BRANDON · /evals page and the footer URL** `[ ]`
reads: `ui-ux-spec.md` §11–12 · `eval-harness.md` §8
Build /evals rendering `latest.json`; wire the footer with the real portfolio URL from P0.1 (Brandon confirms it renders and resolves).
Self-audit: UX-13/14, EVAL-16, AC-23 half-check.
🔍 Brandon review: /evals against the committed JSON; click your own name.

**P5.G5 · Gate** `[ ]` — axe zero violations across all surfaces and all §8 states; keyboard walk of every A11Y §3 path; side-by-side diff against the v10 mock signed by Brandon; DS-14 grep zero; Lighthouse local run both routes green. Log everything.

---

## Phase 6 · Hardening and instruments

**P6.1 · Playwright suite** `[ ]`
reads: `engineering-standards.md` §8 · `performance.md` §4, §6 · `success-criteria.md` §2
Automatable walkthrough cores (W1/W2/W3 skeletons), the mid-stream kill test with partial preservation, the scroll-stability assertion during stream, axe per surface per state.
Self-audit: PERF-09/14 tests named, ENG-17/18, A11Y-01 coverage.
🔍 Brandon review: the e2e run video artifacts; watch the kill test.

**P6.2 · Lighthouse CI and payload assertions** `[ ]`
reads: `performance.md` §1–2, §7
Budgets file asserting every PERF §1 number; build-manifest script asserting §2; wired into `ci.yml`'s final order.
Self-audit: PERF-01/03/15, ENG-19 order intact.
🔍 Brandon review: a CI run with the Lighthouse report artifacts; the numbers, green.

**P6.G6 · Gate** `[ ]` — Entire CI pipeline green end to end on a no-op PR: typecheck → lint → tests → retrieval evals → build → e2e+axe → Lighthouse. This is the machine that will guard every future change. Log the run.

---

## Phase 7 · Comprehensive sitewide audits

Each audit is a step: perform, record findings in the log, remediate, re-verify. Findings are normal; unrecorded findings are the failure.

**P7.1 · Performance audit** `[ ]`
reads: `performance.md` all · `success-criteria.md` AC-10/11/12
Lighthouse both routes (CI + a manual throttled devtools pass), ten live-query latency capture, cold-start observation recorded honestly (accepted per PERF §4).
🔍 Brandon review: one page of numbers vs budgets.

**P7.2 · Mobile and responsive audit** `[ ]`
reads: `ui-ux-spec.md` §14 · `accessibility.md` §8.3
Real phone plus 320px emulation: reflow, touch targets, dock ergonomics, rail fallback, popovers on touch.
🔍 Brandon review: use it on your phone for five minutes; note anything that annoys you.

**P7.3 · Design compliance audit** `[ ]`
reads: `design-system.md` all · the reference mock
Color grep (only §2.1 values), type-role spot checks, motion catalog cross-check (nothing animating that is not listed), DS-14 grep, final v10 diff.
🔍 Brandon review: sign the conformance note; this is the "it is the design we approved" moment.

**P7.4 · Accessibility manual pass** `[ ]`
reads: `accessibility.md` §8
All five checks: keyboard, screen reader script, 200% zoom / 320 reflow, reduced motion, forced colors. Recorded per A11Y-20.
🔍 Brandon review: co-run W3/W4 with me guiding; your hands, the spec's script.

**P7.5 · Security audit (the API-key check)** `[ ]`
reads: `security.md` all · `success-criteria.md` AC-16/17/22
Build-output grep for key shapes (SEC-01), log inspection for secrets and question text (SEC-02/14), headers verified live (SEC-12), rate-limit and cap behaviors re-tested including cap fail-closed with Upstash mocked away, injection smoke ("ignore your instructions" family: bounded, grounded, or declined), `dangerouslySetInnerHTML` grep, dependency audit.
🔍 Brandon review: the one-page security findings note; this is the check you asked for by name, done against the doc rather than vibes.

**P7.6 · Quality regression and honesty audit** `[ ]`
reads: `eval-harness.md` §5 · `honesty-boundaries.md` · `success-criteria.md` AC-01..07
Full eval suite; compare to baseline; then read the README-so-far against honesty-boundaries phrasing rules: no claim outlives its file.
🔍 Brandon review: the eval delta; strike any README sentence you would not say in an interview.

---

## Phase 8 · Deploy and acceptance

**P8.1 🔶 BRANDON · Vercel wiring** `[ ]`
reads: `engineering-standards.md` §6 · `security.md` §1, §5
Brandon: create the Vercel project from the repo, paste the four env vars, deploy. Opus verifies: headers live, static routes static, `/api/ask` dynamic.
🔍 Brandon review: the production URL loads.

**P8.2 · Production smoke and live-sync proof** `[ ]`
reads: `success-criteria.md` AC-08/09/20/22 · `rag-design.md` §9
Live ask + refusal with real receipts; trigger the sync Action against prod; then AC-09 for real: wait for (or find) an actual docs change upstream, sync, and retrieve the changed content. Verify the cap counter moved by the day's real spend.
🔍 Brandon review: the changed-docs retrieval, live. The staleness story, demonstrated, on production.

**P8.3 · Acceptance run** `[ ]`
reads: `success-criteria.md` all
Execute §3 protocol: the acceptance eval run, the instrument readings, every manual criterion, and walkthroughs W1..W7 with Brandon driving. Record each AC and W outcome in the log.
🔍 Brandon review: the filled acceptance table. Green means done.

**P8.4 · README finalization and tag** `[ ]`
reads: `honesty-boundaries.md` · `architecture.md` §4
README assembles the accreted decision log, usage guidance including what it declines and why, the scope-honesty section, the /evals link. Tag `v1.0.0`.
🔍 Brandon review: read the README as a recruiter would; then we ship the LinkedIn angles from chat.

**P8.G8 · Done.** `[ ]` — Every AC green, every W passed, tag pushed. v1 exists.

---

## Build log

*(append one line per completed step: `{step} · {date} · {outcome} · {Tier 2 decisions}`)*

P0.1 · 2026-07-22 · Four services keyed into untracked .env.local; all 6 vars present, non-placeholder, shapes verified (no values printed); SEC-01/02 posture green · Tier 2: portfolio URL stored as PORTFOLIO_URL (server-only, no NEXT_PUBLIC) per Brandon.
P0.2 · 2026-07-22 · DS-01 mock at exact path (valid HTML, renders — Brandon confirmed in browser); 12 docs + CLAUDE.md inventory matches; GitHub origin BrandonChurch93/Ask-the-Claude-Docs live · No Tier 2.
P1.1 · 2026-07-22 · Next 16.2.11 / React 19.2.4 / react-dom 19.2.4 scaffolded (TS strict + noUncheckedIndexedAccess, App Router, Turbopack, no Tailwind, ESLint); devDeps exact-pinned (@types/node 20.19.43, @types/react 19.2.17, @types/react-dom 19.2.3, eslint 9.39.5, eslint-config-next 16.2.11, typescript 5.9.3); pruned to blank <main> boot; npm ci + tsc clean; dev boots on Turbopack 200 · Tier 2: (a) dropped scaffold AGENTS.md (competes with CLAUDE.md); (b) commit next-env.d.ts + gitignore *.tsbuildinfo (CI typecheck precedes build); (c) placeholder metadata/globals reset only, fonts+tokens deferred to P1.3. FLAG: fresh scaffold carries 2 high (sharp/libvips CVEs) + 1 moderate (postcss) transitive via next@16.2.11 — no non-breaking fix; collides with SEC-16 at P1.4, resolution likely Tier 3.
P1.1-sec · 2026-07-22 · SEC-16 CVE resolution (Brandon-approved Option A, pulled forward from P1.4): package.json overrides force sharp 0.34.5→0.35.3 (libvips CVE-2026-33327/33328/35590/35591, GHSA-f88m-g3jw-g9cj, high×2) and postcss 8.4.31→8.5.22 (GHSA-qx2v-qp2m-jg93 XSS, moderate). next stays pinned 16.2.11 (no version movement). Fresh install: npm audit 0 vulns; sharp native binary loads (libvips 8.18.3); npm ci + tsc + prod build all clean · Tier 3 resolution: forced transitive resolution via overrides, next unchanged.
P1.2 · 2026-07-22 · env.ts (zod boot-parse + server-only; loud fail demonstrated — removed var throws naming it, values never printed), config.ts (all RAG §8 params, T=UNCALIBRATED), .env.example (6 vars, schema-parity). ENG-06/09/10/11 + RAG-19 + SEC-01/02 green; tsc/lint/build clean; audit 0 vulns. Deps exact-pinned: zod@4.4.3 (approved table), server-only@0.0.1 (mandated by ENG-10) · Tier 2: (a) embedding.batchSize=100, (b) generation.maxOutputTokens=1024, (c) spend.dailyCapUsd=$5 — all scalars the docs leave to config without a number; $5 cap flagged for Brandon (wallet is threat #1); (d) sonnet flag named useHigherQualityModel (survives a model swap); (e) config scoped to exactly the §8 enumeration (source/URL/500-char cap enter with their consumers); (f) next-env.d.ts churn left uncommitted (pre-existing P1.1 dev/build path flip-flop).
P1.3 · 2026-07-22 · tokens.css (§2.1 palette + 4 §2.4 corrections, DS-05 clean), globals.css (§3.1 fallback stacks, sans base type, :focus-visible ring A11Y-07, ::selection), fonts.ts+app/fonts/ (three voices, --serif/--sans/--mono), layout wires vars to <html>. Ships exactly 5 latin woff2 / 118.6KB, zero external font origins. DS-05/06/07/08 + PERF-04/05 + A11Y-07 green; tsc/lint/build clean · Tier 3 resolution (Brandon delegated "research the best answer"): next/font/google@16 self-hosts ALL Google subsets (latin+cyrillic+greek+vietnamese = 23 files/708KB; `subsets` only gates preload — confirmed in loader source), failing PERF-05 (≤5 files, latin) + the 130KB budget (latin-only preload alone = 186KB). Resolved by self-hosting the SAME families via next/font/local from latin-subset, wght-400:600-instanced woff2 (built once w/ fonttools, committed under OFL, app/fonts/LICENSE.md). DEVIATIONS FROM FROZEN DOCS (Brandon to amend docs or veto): DS §3.3 next/font/google→local; DS §3.1 Source Serif 4 opsz axis PINNED to 13 (keeping the axis costs 77KB/face, busts budget) + wght limited to used 400:600; Inter opsz pinned (DS §3.1 = Inter wght-only anyway). Subset also carries DS §7 symbols → ↗ ✓ · … — (▾ absent from all 3 families, falls back to system-ui). Tier 2: (a) opsz pin value 13 (matched to 17.5px body); (b) app/fonts/ new dir (ENG-04); (c) /specimen review page left UNCOMMITTED, to delete before P1.G1; (d) next-env.d.ts churn still uncommitted.
P1.4 · 2026-07-22 · ci.yml in ENG-19 order (npm ci → audit → secret+em-dash hygiene → typecheck → lint → format → tests → evals[stub] → build → e2e[stub] → lighthouse[stub]); actions SHA-pinned, permissions contents:read, no continue-on-error (ENG-19, SEC-16/17). Security headers via lib/security-headers.ts + next.config (full SEC §5 set global, no-store on /api; SEC-12/13, ENG-14) verified LIVE via npm start curl. Header integration test (vitest, 4 tests). Hygiene scripts: check-secret-shapes.mjs (SEC-01, excludes .env.example), check-em-dash.mjs (DS-14, excludes .claude/CLAUDE.md/LICENSE/woff2/lock). Prettier added (ENG §9); typedRoutes on (ENG §6). Full local pipeline green; audit 0 vulns · Deps exact-pinned: vitest@4.1.10, prettier@3.9.6 (both doc-mandated, not Tier 3). Tier 2/flag: (a) CSP script-src uses 'unsafe-inline' as SEC §5's "minimal Next inline allowance" — nonces would force CSP into middleware, conflicting with SEC §5 (headers in next.config) + ENG §6 (middleware = rate-limit/api-only); flagged for Brandon, nonce-hardening = a Tier 3 doc amendment if wanted; (b) removed em dashes DS-14 found in my own P1.2/P1.3 files (comments) + .env.example/.gitignore; (c) prettier excludes .github (YAML `on:` boolean), .claude, .env.example; (d) hygiene scripts hardened post-commit (fix ee16c20) to scan staged/new files via `git ls-files --cached --others --exclude-standard` after the gate caught em dashes in newly-tracked vitest.config.ts + check-secret-shapes.mjs; (e) /specimen deleted at gate; next-env.d.ts churn still uncommitted.
P1.G1 · 2026-07-22 · GATE GREEN in CI. Pushed main (HEAD ee16c20) to origin; CI run 29968889421 concluded success with every step green: npm ci, audit (SEC-16), secret grep (SEC-01), em-dash grep (DS-14), typecheck, lint, format, headers integration test (vitest ×4), build, plus wired stubs (evals/e2e/lighthouse). Run URL: https://github.com/BrandonChurch93/Ask-the-Claude-Docs/actions/runs/29968889421 · Phase 1 complete. Note: repo is public; push authorized by Brandon's "continue" after the offer to authorize; run verified via unauthenticated Actions API (gh CLI not authed in-session).
P2.1 · 2026-07-22 · Schema live on Supabase (PostgreSQL 17.6, pgvector 0.8.2). 4 ordered migrations: extensions, documents + chunks verbatim from RAG §4 (chunk_id text PK RAG-08; HNSW vector_cosine_ops m=16/ef_construction=64 exact; cascade FK), sync_runs (RAG §9.5). lib/db/: client (module-scoped pooled, prepare:false for Supabase pgbouncer, server-only PERF-10/SEC-03), queries.retrieveTopK stub (cosine <=> RAG-11 + embedding_model filter RAG-10), migrator (all SQL in lib/db/ per ENG-03). scripts/db-migrate.ts thin entry via `npm run db:migrate` (NODE_OPTIONS=--conditions=react-server tsx --env-file=.env.local — the pattern for all env-using scripts, since env.ts is server-only-guarded). Applied live + verified schema against §4 + idempotency (2nd run 0 applied). Deps exact: postgres@3.4.9 (table), tsx@4.23.1 (ENG §3). Self-audit ENG-03/RAG-08/10/11 + full local suite green · Tier 3 resolved (Brandon): NO Postgres spend table — cap counter is Upstash (SEC §4), DB = corpus + sync logs only (SEC §6); "spend counter support" read as sync_runs.embedding_calls. Tier 2: (a) script env pattern via tsx --env-file + react-server condition (documented in migrator/script); (b) schema_migrations bookkeeping table added by runner; (c) `if not exists` on DDL for safety (schema identical to §4). Not pushed (origin still at ee16c20; rides with next push).
P2.2 · 2026-07-22 · Corpus fetched + stored: 172 documents (raw markdown + sha256 page hashes), 0 skipped. lib/rag/corpus.ts (llms.txt discovery RAG-01 no hardcoded lists; content-sniff validation RAG-02; collision-free page_path derivation) with pure parse/sniff + fixture tests (RAG-01/02, ENG-18). lib/db/queries: upsertDocument (raw before chunking RAG-03), insertSyncRun (skips → sync_runs.pages_skipped, RAG-22), countDocuments. scripts/ingest.ts + `npm run ingest`; idempotent (2nd run 172); 2 sync_runs rows. config.corpus.{llmsTxtUrl,source,fetchConcurrency} (RAG-19). Self-audit RAG-01/02/03 green; full suite green. FINDING (Brandon-confirmed complete): RAG §1's changelog-serves-HTML edge case is outdated; all 172 pages now serve text/markdown, so live skip log is empty; RAG-02 satisfied by mechanism + fixture proof. RAG §1 amended separately (see docs entry below).
docs · 2026-07-22 · Docs-drift correction (Brandon-authorized per CLAUDE.md rule 1): amended rag-design.md §1 known-edge-case note. Changelog historically served rendered HTML on GitHub and serves markdown as of 2026-07 (verified across all 172 pages in P2.2); validation retained since any page could regress. Committed separately as `docs: amend RAG §1 edge-case to match live corpus`.
docs · 2026-07-22 · RAG §2 amendment + Tier 3 resolution (Brandon-authorized per CLAUDE.md rule 1). Tension found in P2.3: RAG §2 keeps tables/code atomic (whole even >800), but 3 huge reference tables (env-vars 26819, settings 12813, commands 9701 tokens) exceed text-embedding-3-small's 8191 input cap (RAG §5) — kept whole they are un-embeddable, hence unretrievable, defeating the purpose atomicity serves. Resolution (Brandon): bounded oversize-atomic exception added to RAG §2 — an atomic unit over the embedding limit splits at natural boundaries (table rows / code logical blocks) into self-describing segments under 7,000 tokens, each re-carrying the table header + breadcrumb, ids extending the parent as {parent-id}/part-N. Implemented; live corpus re-run: 3496 chunks, max 6924 tokens, 0 over the 8191 limit, 0 duplicate ids; the 3 tables became env-vars(4)/settings(2)/commands(2) segments. Committed separately as `docs: amend RAG §2 with bounded oversize-atomic exception`.
