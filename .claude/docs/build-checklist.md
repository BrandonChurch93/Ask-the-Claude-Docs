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

**P2.3 · Chunker** `[x]`
reads: `rag-design.md` §2–3 · `engineering-standards.md` §8
Heading-aware splitter, size merge/split rules, breadcrumb prefix, atomic fences/tables, deterministic IDs, tiktoken counting. Fixture-driven unit tests for every RAG §2 rule.
Self-audit: RAG-04/05/06/07/08 each with a named passing test (ENG-18).
🔍 Brandon review: run the chunker on the real hooks page; eyeball five printed chunks with IDs and breadcrumbs.

**P2.4 · Embedder and upsert planner** `[x]`
reads: `rag-design.md` §3, §5, §9
Shared embed function (RAG-12), batch embedding, hash-diff planner (new/changed/unchanged/deleted), sync-log writer, coverage + freshness derivation.
Self-audit: RAG-12, RAG-09 via fixture (unchanged corpus → zero calls, tested with the mocked client), RAG-21/22.
🔍 Brandon review: planner dry-run output on a doctored fixture: shows exactly which chunks it would embed and why.

**P2.5 · First real ingestion** `[x]` *(spends: single-digit cents)*
reads: `rag-design.md` §5, §9
Run `scripts/ingest.ts` against the live docs with real keys. Then run it again immediately.
Self-audit: RAG-20 live (second run: zero embedding calls, log proves it); chunk count sane; spot-check three chunks against the live site.
🔍 Brandon review: both sync-log rows; the second one's zeros are the staleness story working.

**P2.6 🔶 BRANDON · Sync Action and repo secrets** `[x]`
reads: `rag-design.md` §9 · `security.md` §7
Opus writes `sync.yml` (daily + manual, loud failure). Brandon adds repo secrets: `OPENAI_API_KEY`, `DATABASE_URL` (Actions need them; `ANTHROPIC_API_KEY` added here too for Phase 4). Brandon triggers a manual run.
Self-audit: RAG-22, SEC-17; the Action run is green with a zero-work log.
🔍 Brandon review: the Actions tab run; secrets page shows three names, values hidden.

**P2.G2 · Gate** `[x]` — Unit/integration suite green; live corpus in Supabase; idempotency proven twice (fixture + live); Action green. Log counts and run URLs.

---

## Phase 3 · Retrieval and the API

**P3.1 · Retriever and threshold partition** `[x]`
reads: `rag-design.md` §6 · `performance.md` §3, §5
Query embed (shared fn), top-k SQL with model filter, similarity computation, partition against `T` (UNCALIBRATED tolerated until P4.4), refusal decision, timings with `performance.now()`.
Self-audit: RAG-10/11/13/14/15, PERF-06/10.
🔍 Brandon review: a CLI probe: your question in, five scored chunk IDs out, partition shown.

**P3.2 · Prompt templates and generation client** `[x]`
reads: `rag-design.md` §7 · `security.md` §2–3
System + sources templates in one module, question isolated in the user turn, Haiku default + Sonnet flag from config, `max_tokens` cap.
Self-audit: RAG-18, SEC-04/05/08, PERF-11.
🔍 Brandon review: the rendered prompt for a sample question, printed; confirm the structure reads as §7 specifies.

**P3.3 · SSE route and stream library** `[x]`
reads: `rag-design.md` §7 · `performance.md` §4 · `engineering-standards.md` §6–7
`/api/ask`: zod-strict input, Node runtime declared, `no-store`, events `sources → text* → done` with shared types, refusal payload path (no generation call), snippet-only sources payload, error events. Client parser + turn reducer skeleton.
Self-audit: RAG-16/17, ENG-07/08/13/14, PERF-07/08/12, SEC-06 (grep), integration tests: event order, refusal makes zero generation calls, typed 400s.
🔍 Brandon review: `curl -N` transcript of one answer and one refusal; the sources event visibly precedes text.

**P3.4 · Rate limit, spend cap, middleware** `[x]`
reads: `security.md` §4 · `rag-design.md` §8
Upstash sliding window in middleware (`/api/ask` only, fail-open, logged), spend counter accumulating usage-derived cost checked pre-generation (fail-closed), both from config, typed 429/cap responses matching UX §8 copy.
Self-audit: SEC-09/10/11, integration tests for both failure postures (mocked Upstash down).
🔍 Brandon review: hammer the endpoint with a loop; watch the 429 arrive; cap test with a temporarily tiny cap value.

**P3.G3 · Gate** `[x]` — Full suite green; ten live queries through the route: PERF §3 segments recorded and within budget; refusal round-trip under 600ms p95. Log the numbers.

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
**Blocking condition (added at P3.G3, Tier 3, Brandon-authorized):** re-run the P3.G3 ten-query PERF §3 measurement co-located on Vercel; all segments (`retrieval_ms` ≤ 400ms, `ttft_ms` ≤ 2.5s, refusal round-trip ≤ 600ms, all p95) must be within budget, or deploy sign-off is withheld. The P3.G3 local numbers (see build log) are the baseline: they were network-bound (local→OpenAI/Supabase/Upstash) and expected to fall inside budget once co-located; this condition proves it.
🔍 Brandon review: the changed-docs retrieval, live. The staleness story, demonstrated, on production. The co-located PERF §3 numbers, within budget.

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
P2.3 · 2026-07-22 · Chunker live-validated on the real corpus: 172 docs → 3496 chunks, max 6924 tokens, 0 over the 8191 embedding limit, 0 duplicate ids. lib/rag/chunker.ts: line-based block parser (headings/fences/tables), heading-aware grouping (config levels), sub-min merge + over-max split at block boundaries, oversize prose/list line-split (RAG-04), breadcrumb prefix (RAG-05), atomic fences/tables (RAG-06), config-driven sizes (RAG-07), deterministic structural chunk_id (RAG-08), cl100k_base counts; oversize-atomic segmentation per the RAG §2 amendment. 19 tests (one named per RAG-04/05/06/07/08 + oversize-atomic). Deps: js-tiktoken@1.0.21 (table). Self-audit RAG-04/05/06/07/08 + ENG-18 green; full suite green. Hooks page review: 115 chunks, ids/breadcrumbs/anchors eyeballed. Findings during build: (a) fixture RAG-04 test initially passed while real corpus had 99 non-atomic over-800 chunks (huge lists/tables) → fixed by line-splitting oversize prose + exempting atomic tables like code; (b) O(n²) token-counting perf bug (117s) → block-cache + running sums; (c) 3 tables over the embedding limit → Tier 3 resolved via the RAG §2 amendment above. Tier 2: (a) embeddingLimitTokens=8191/oversizeSegmentTokens=7000 in config; (b) chunk_id `~n` dedup safety for duplicate-heading pages (0 needed live); (c) chunking ~83s (js-tiktoken pure-JS on huge tables), acceptable for the offline ingest job.
P3.2 · 2026-07-23 · Prompt templates + generation client. lib/rag/prompt.ts (RAG-18: SYSTEM_INSTRUCTIONS + renderSources + buildMessages in one module; eval harness imports the same; pure, secret-free). Structure per RAG §7: instructions + sources block form the system prompt (both trusted); the question occupies ONLY the user turn, delimited in <question> tags (SEC-05); sources numbered [n] in score order (content already carries the breadcrumb, RAG-05). lib/rag/generator.ts (server-only): Anthropic client (lazy); selectedModel() Haiku default / Sonnet behind config flag (RAG §7); buildGenerationRequest = exactly {model, max_tokens, system, messages} — no tools, no client-tunable params (SEC-08); max_tokens from config (PERF-11, SEC-04). 36 tests (5 new: prompt RAG-18/SEC-05, generator SEC-04/08+PERF-11+model-select). scripts/prompt-preview.ts + `npm run prompt:preview`. Dep exact: @anthropic-ai/sdk@0.113.0 (table). Self-audit RAG-18/SEC-04/05/08/PERF-11 green; SEC-06 (no dangerouslySetInnerHTML) clean; full suite+build green. Review: live preview rendered the exact §7 structure (system = instructions + [1]..[5] sources; user = <question>…</question>; no question text in system). No generation call yet (P3.3 exercises it). Process note: fixed 2 em dashes in retriever.ts (P3.1) that slipped the audit before push (commit c9e43a7); DS-14 now clean across 52 files.
P3.1 · 2026-07-23 · Retriever live. lib/rag/retriever.ts: retrieve() = shared query embed (RAG-12) → retrieveTopK top-k cosine + model filter (RAG-10/11) → partition against T → refusal decision; performance.now() timings (PERF-06); module-scoped pooled client (PERF-10). partition() pure: ≥T context, <T near-miss (never to model RAG-14), empty context ⇒ refused (RAG-13); UNCALIBRATED T (until P4.4) ⇒ all context, no refusal (RAG §6 tolerated). 31 tests (3 new partition: RAG-13/14 + uncalibrated). scripts/retrieve.ts + `npm run retrieve`. Self-audit RAG-10/11/13/14/15 + PERF-06/10 green; full suite+build green. LIVE PROBE (Brandon review): answerable "how do PreToolUse hooks work?" → top-5 all hooks PreToolUse/PostToolUse sections, scores 0.6979/0.6747/0.6586/0.6264/0.6143; off-corpus "pizza dough" → 0.1589/0.1499/0.1394/0.1368/0.1367. Clean ~0.6 vs ~0.15 separation (calibration target for P4.4). FINDING (not a defect): CLI probe retrieval_ms ~1.5-2.2s is cold-connect + local→Supabase network + OpenAI embed latency; warm pgvector query ~150ms local (single-digit ms server-side, rest network), cold connect ~1s one-time. PERF §3 400ms budget is verified WARM/co-located at P3.G3 (10 live queries through the route), not the cold local CLI · Tier 2: UNCALIBRATED partition treats all retrieved as context so P3.2/P3.3 develop against real retrieval; refusal gate activates at P4.4.
P2.G2 · 2026-07-23 · PHASE 2 GATE GREEN. Unit/integration suite green: clean-room (rm node_modules + npm ci) typecheck/lint/format/secret-grep/em-dash-grep/tests(28)/audit/build all pass; CI run on the Phase 2 code (HEAD 9310a6f) success — https://github.com/BrandonChurch93/Ask-the-Claude-Docs/actions/runs/29981351255. Live corpus in Supabase: 172 documents, 3501 chunks (embedding dims=1536, 0 null embeddings), 5 sync_runs, freshness 2026-07-23. Idempotency proven twice: FIXTURE (diffChunks unchanged→zero-embed, RAG-09 test in the 28) + LIVE (P2.5 sync_run #4 zero-work: added/updated/deleted/embed all 0). Sync Action green: manual dispatch run 30026573762 success — https://github.com/BrandonChurch93/Ask-the-Claude-Docs/actions/runs/30026573762 (did a real 33-chunk incremental delta, also exercising the change path). Phase 2 complete.
P3.3 · 2026-07-23 · SSE ask route + stream library. app/api/ask/route.ts: POST, zod-strict {question} (.strict, 500-char cap, control-char strip; SEC-04/ENG-07 → typed 400 with a stable {error:{type,message}} body), Node runtime (ENG-13), Cache-Control no-store on both the stream and 400s (ENG-14), force-dynamic. Streams the RAG §7 protocol sources → text* → done (RAG-16, verified on the wire), deltas enqueued as received with no buffering (PERF-08), snippet-only sources at config.payload.snippetChars=300 (PERF-12); the refusal path emits sources+done with zero generation call (RAG-13/PERF-07); in-stream error events carry the exact UX §8 copy (request-failed vs interrupted, split on whether any text had streamed). lib/stream/: types.ts (SSE payload types defined once, ENG-08), encode.ts, parse.ts (incremental SSEDecoder), reducer.ts (turn state-machine skeleton idle→retrieving→streaming→settled|refused|errored, ENG-16), cost.ts (computeCostUsd from the API usage object — all four token fields × per-model config rate, RAG-17). config.ts: pricing block keyed by model ID (haiku 1/5, sonnet-4-6 3/15 + standard 1.25x/0.1x cache multiples; verified 2026-07-23, P7.5 re-checks against live pricing pages) + payload.snippetChars (RAG-19). 53 tests (17 new: encode/parse round-trip, cost, reducer, and route integration — event order RAG-16, refusal makes zero generation calls PERF-07/RAG-13, typed 400s ENG-07, control-char strip SEC-04). Self-audit RAG-16/17 + ENG-07/08/13/14 + PERF-07/08/12 + SEC-06 green; tsc/lint/format/DS-14/SEC-01/build clean. LIVE REVIEW (Brandon, ~a quarter cent spend): ANSWER "how do I give Claude Code memory across sessions" → sources(5, sims 0.60–0.67) visibly before 13 text deltas (cited answer resolving [3] to source 3); done receipt usage{1449 in/239 out}, costUsd $0.002644 = exact usage math (1449·$1 + 239·$5)/1M. REFUSAL (off-corpus "best recipe for sourdough bread") → sources→done only, 0 generation events, usage=null, costUsd=0, generationMs=0, 5 near-misses 0.16–0.19 held back from the model (RAG-14). FINDINGS/decisions: (a) under UNCALIBRATED T the partition never refuses (P3.1 tolerance), so the live refusal exhibit used a TRANSIENT provisional CALIBRATED T=0.35 (the clean gap between the P3.1 bands), then reverted via git checkout — the committed config stays UNCALIBRATED; P4.4 owns real calibration; (b) the source URL is heading_anchor directly — the chunker already stores the full pageUrl#slug deep link — which caught and reverted a doubled-URL bug from an initial (unnecessary) documents-join; (c) those URLs are the stored raw-markdown deep link (…/en/…​.md#anchor), so resolving citations to the rendered docs page is a P5 display decision, flagged; (d) query cost is generation-only for now — OpenAI's embedding rate is deliberately absent from config.pricing (to-be-verified at P4.4), so a refusal's costUsd is 0 until the embedding-only receipt (UX §7) is wired at calibration; (e) Tier 2: pricing/payload sections extend config past the strict §8 enumeration (prices and snippet length are product params — always-rule #7); cost prices all four usage token fields though v1 sends no cache_control (defensive).
P3.3-note · 2026-07-23 · KNOWN TIER 2 ITEM for P5 (Brandon-accepted, logged so it can't surprise us): source URLs currently carry the stored raw-markdown deep link (…/en/<page>.md#<slug>). P5 will transform these to the rendered docs-page URL for display. WHEN P5 WIRES IT: verify a sample of anchors actually resolve on the rendered site — raw-markdown heading slugs and rendered-page slugs can disagree, and a citation that deep-links to nothing would quietly break UX-08 (working source links) and W1 (golden-path: click a citation, land on the cited section). Refusal cost showing $0 until the embedding rate is verified at P4.4 is correct sequencing; the UX §7 embedding-only receipt is wired then.
P3.4 · 2026-07-23 · Rate limit + spend cap: two independent wallet layers with deliberately different failure postures (SEC §4). middleware.ts (per-IP, /api/ask only via matcher, ENG §6): two Upstash sliding windows from config (perMinute 10 / perDay 50, RAG-19); exceeding either → typed 429 with the exact UX §8 rate_limited copy + Retry-After + no-store; FAILS OPEN — if Upstash is unreachable the request proceeds, logged (SEC-09), because the fail-closed cap still bounds cost. lib/spend.ts (server-only): global daily cap, one Upstash counter keyed by UTC date (spend:YYYY-MM-DD, self-expiring), checked in the route BEFORE any generation and FAILS CLOSED — isSpendCapReached uses INCRBYFLOAT key 0 (reads the counter AND proves the key writable in one op), so a read/write failure throws and the route rejects with the UX §8 spend_cap copy and no generation; recordSpend accumulates the request's real computed cost (same usage math as the receipt, RAG-17) after a successful answer, a no-op on refusals (SEC-10). Both numbers live in config; both rejections render the specified UI states, not raw errors (SEC-11). Deps exact-pinned (ENG §2 approved table): @upstash/ratelimit@2.0.8, @upstash/redis@1.38.0; audit 0 vulns. vitest.config include extended to pick up the root middleware.test.ts. 67 tests (14 new: spend 5, middleware 5 incl fail-open, route 4 incl cap-reached + fail-closed + accumulate + refusal-no-record). Self-audit SEC-09/10/11 + ENG-14 green; tsc/lint/format/DS-14/SEC-01/build (middleware registered as ƒ Proxy) clean. LIVE REVIEW (Brandon): (1) RATE LIMIT — 12 rapid POSTs from one IP: reqs 1–10 HTTP 400 (passed the limiter, then invalid-body 400 at the route — proving middleware runs before the handler, and counting them cheaply at zero generation cost), reqs 11–12 HTTP 429 rate_limited with Retry-After:12 + no-store, exact UX §8 copy. (2) SPEND CAP — temporarily set dailyCapUsd=0.001 (fresh IP so the limiter didn't interfere): request A answered (HTTP 200, streamed, costUsd $0.002709 recorded), request B HTTP 429 spend_cap with the exact UX §8 copy and zero generation; cap restored to $5 via git checkout, the demo's counter key cleared from Upstash. Tier 2: (a) the cap is checked at route entry (before retrieval), which strictly satisfies "before the generation call" and returns a clean JSON 429 without even spending the embedding call on capped requests; (b) the INCRBYFLOAT-by-0 read-with-writability-proof so fail-closed honors "can't be read OR written"; (c) the rate-limit demo used invalid bodies to exercise the limiter at zero generation cost (the limiter counts by IP regardless of body).
P3.G3 · 2026-07-23 · PHASE 3 GATE — closed on Brandon's decision (Option 1). Full suite green (68 tests; +1 disconnect regression). Instrumentation completed at the gate: PERF-06 shipped only 2 of 3 segments at P3.1; route.ts now measures all three route-side from t0 (retrieval_ms = validated→sources, ttft_ms = validated→first token [null on refusal], totalMs = validated→done [refusal round-trip when refused]); embedMs/queryMs kept as retriever diagnostics (commit cf9d2e4). LOCAL BASELINE — 10 warm answer queries (ms): retrieval_ms p50 818 / p95 1972 (budget ≤400); ttft_ms p50 1550 / p95 3336 (budget ≤2500); refusal round-trip (10 off-corpus, provisional T=0.35, then reverted) p50 688 / p95 1357 (budget ≤600), 10/10 correctly formed with 0 generation events (PERF-07). Breakdown: embed_ms (OpenAI) p50 536, query_ms (Supabase round-trip) p50 282 while the pgvector query itself is single-digit ms server-side, Upstash spend-check ~697ms (wall−server_total) — every over-budget segment is local→internet network, server compute negligible. WARM-vs-COLD (confirms P3.1): cold query_ms 783 vs warm 282 (~500ms cold-connect); cold retrieval_ms 1420 vs warm p50 818. VERDICT: the budgets are defined for the warm/co-located production topology; they cannot be verified from a laptop (network geography), and we are not deployed yet. Everything provable locally passed (suite, instrumentation, refusal zero-generation + relatively snappier, cold/warm delta, negligible server compute). Gate spend ~$0.04 (10 answers + warm-up/cold); counter cleared afterward. TIER 3 RESOLUTION (Brandon-authorized amend, CLAUDE.md rule 1): P8.2 gains a BLOCKING CONDITION — re-run this 10-query PERF §3 measurement co-located on Vercel; all segments within budget (p95) or deploy sign-off is withheld. The local numbers above are the baseline for that comparison. TIER 2 (Brandon): dailyCapUsd $5 → $1 (standing demo cap; $5 was a leftover default). FINDING + FIX (Brandon Q, Option A): spend recording did NOT survive a mid-stream client disconnect — verified live (aborted at 1.5s, counter delta $0.000000). Root cause: on disconnect controller.enqueue throws → the generation loop breaks → diverts to catch → recordSpend (after send(done)) is skipped, so real (already-generated) cost goes unrecorded and the cap undercounts (bounded by the rate limit, but wrong). FIX: send() swallows client-gone enqueue errors and keeps draining server-side (variant A); recordSpend moved to run the moment usage resolves, BEFORE the final client-facing send, so accounting always completes; closeStream() guards controller.close() too. Mocked-abort regression test added (read the sources chunk, cancel the reader mid-stream, assert recordSpend still fires). Variant B (abort the Anthropic stream on req.signal to save the unseen tail + record partial usage) logged as a possible post-v1 refinement. Self-audit PERF-06 + SEC-10 green; full suite/tsc/lint/format/DS-14/SEC-01/build clean. Phase 3 complete.
P2.6 · 2026-07-23 · Sync Action live + green. .github/workflows/sync.yml: daily (08:00 UTC) + manual dispatch; actions SHA-pinned (SEC-17: checkout v7.0.1, setup-node v7.0.0); permissions contents:read; concurrency-guarded (no mid-write cancel); runs `npx tsx scripts/ingest.ts` with env from the step (NODE_OPTIONS=--conditions=react-server); a failure exits non-zero → Action red, no swallowed errors (RAG-22). Env: 3 real repo secrets (OPENAI_API_KEY, DATABASE_URL, ANTHROPIC_API_KEY per Brandon) + non-secret placeholders for Upstash/portfolio since env.ts validates all six at boot (ENG-06). Brandon added secrets + triggered a manual run: CI Actions run 30026573762 concluded SUCCESS (green). Self-audit RAG-22 + SEC-17 green; secrets page shows three names, values hidden · FINDING (positive): the manual run was NOT zero-work because the upstream docs changed in the ~5h since P2.5 — sync_run #5 did an INCREMENTAL delta (added=6, updated=26, deleted=1 across 10 pages) embedding only the 33-chunk delta in 1 batch, not all 3496. Confirms the delta path (RAG §9 change-detection + selective embed); the no-op/zero-embed path was already proven by P2.5's row #4. Corpus now current at 3501 chunks. Determinism verified (added/deleted chunk_ids on 10 specific pages = real upstream churn, not chunker drift) · Tier 2 (Brandon-requested, logged): batched upsertChunks (multi-row INSERT ON CONFLICT, config.ingest.upsertBatchSize=100) replaces ~3500 single-row upserts from P2.5; verified live (1536-dim, idempotent). Not pushed beyond 9310a6f (this + P2.6-complete commit local).
P2.5 · 2026-07-22 · FIRST REAL INGESTION (spent ~$0.026; projected 1,274,543 tokens × $0.02/M, within Brandon's 3-5¢ estimate). Two live runs. Sync-log row #3 (first): status=success, pages_fetched=172, chunks added=3496/updated=0/deleted=0, embedding_calls=35, duration=464.7s. Sync-log row #4 (second, immediate): status=success, added=0/updated=0/deleted=0, embedding_calls=0, duration=26.5s — RAG-20 proven live (zero embeds on unchanged corpus; unchanged+chunked pages skip re-chunk entirely). Chunk count sane: 3496 chunks, embedding dims=1536, 0 null embeddings. Three-chunk spot-check green (hooks#hook-lifecycle-1 486tok; mcp 210tok; settings available-settings segment part-1 6747tok — an oversize-atomic table segment under 7000). Self-audit RAG-20 + chunk sanity + spot-check all green · FLAG for P2.6: first-run wall-clock (464.7s) is dominated by ~3500 sequential chunk upserts to the Supabase pooler; batching the upserts is the optimization for the daily sync Action.
P2.4 · 2026-07-22 · Embedder + planner + sync-log writer + coverage/freshness. lib/rag/embedder.ts (single shared embed fn RAG-12; embedQuery wraps it; batched RAG §5; client injectable). lib/rag/planner.ts (pure diffPages/diffChunks RAG §9: new/changed/unchanged/removed). lib/rag/ingest.ts (runIngest, dependency-injected + dry-run; unchanged-with-chunks skipped RAG-20, chunkless bootstrap processed; failed run logged+rethrown RAG-22). lib/db/queries: getPageStates/getChunkStates/upsertChunk/deleteChunks/deletePages + getCoverage/getFreshness (RAG-21, DB-derived). scripts/ingest.ts thin entry + `npm run ingest -- --dry-run`. 28 tests (planner RAG-09, embedder RAG-12, ingest RAG-20/22 + dry-run + 4-category doctored fixture). vitest: server-only aliased to a stub + dummy env setup so server-side modules import under node. Deps: openai@6.48.0 (table). Self-audit RAG-12/09/20/21/22 + ENG-17/18 green; full suite + build green. LIVE dry-run (free): 172 fetched, all page-unchanged but chunkless → 3496 chunks "new" (bootstrap), 0 API calls/0 writes; coverage(172 titles)+freshness verified live · Tier 2: (a) test/ dir with server-only.stub.ts + setup-env.ts (ENG-04 new dir; setup writes process.env for the harness, app still reads only via env.ts); (b) runIngest upserts ALL fetched docs each sync to advance synced_at freshness (RAG-20 counts EMBED calls, still zero); (c) dummy test keys chosen short/creds-free so SEC-01 grep stays clean.
