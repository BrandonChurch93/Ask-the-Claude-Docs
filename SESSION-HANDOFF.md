# SESSION HANDOFF — Ask the Claude Docs

_Last updated: 2026-07-26. This orients a cold session in one read. Authoritative
sources remain `CLAUDE.md` (operating contract) and `.claude/docs/build-checklist.md`
(execution state + build log). Read those two first; this is the map, not the terrain._

## What this is

A RAG chatbot over the Claude Code documentation: cited answers, honest server-side
refusals, a CI eval harness. Next 16 (App Router, Turbopack) · React 19 · Supabase
Postgres + pgvector · OpenAI embeddings (`text-embedding-3-small`) · Anthropic
generation (`claude-haiku-4-5`) · hand-rolled SSE. Spec is frozen in `.claude/docs/`;
the job is faithful execution, not redesign. Direct-to-main after full local audit +
Brandon review; every push must keep CI green (never mark a step complete on a red check).

## Where we are

**Phases 0–6 complete and CI-green. Production is LIVE.** A Tier-3 resequence
(Brandon-authorized, interview timing) pulled the deploy **ahead** of the Phase-7
audits.

- **Live:** https://ask-the-claude-docs.vercel.app — Vercel, function region **pdx1**
  co-located with Supabase **us-west-2** (docs assumed US-East; same-region premise
  holds, different coast — logged).
- **P8.1 verified live (2026-07-26):** security headers correct on every route (CSP
  with no external origins, nosniff, referrer-policy, permissions-policy); `/` and
  `/evals` static (vercel-cache HIT/PRERENDER); `/api/ask` dynamic + `no-store`; a real
  cited answer and a live server refusal both work end-to-end.
- **Informal live latency** (formal p95 is P8.2): answer TTFB ~1.5s / total ~7s;
  refusal ~1.4s; retrieval ~1s in cold single-shot samples (queryMs high = cold pooled
  connection, not warm pgvector — re-measure warm at P8.2).

## The one open item (does NOT block the demo)

**OG/canonical tags still render `http://localhost:3000`.** `SITE_URL` was not present
at the build that is currently live (a redeploy likely reused the build cache;
page metadata is baked into the static prerender). **Fix (Brandon, Vercel-side):**
confirm `SITE_URL` is set for the **Production** environment, then trigger a **fresh**
build — redeploy with "Use existing Build Cache" **unchecked**, or push any commit.
Affects social-share previews + SEO canonical only; the demo itself is fully functional.

## What remains — this week, against the live deploy, in this order

1. **P7.0** · Design fine-tuning pass (🔶 Brandon-driven; the deferred UI polish). Start here.
2. **P7.1–P7.6** · Audits: performance, mobile/responsive, design compliance, a11y
   manual pass, security (the API-key check). Findings ship as normal CI-guarded commits
   → auto-redeploy via Vercel's git integration.
3. **P8.2–P8.4** · Formal production smoke + live-sync proof, acceptance table
   (`success-criteria.md`), README + version tag.

## First action for the next session

Confirm with Brandon whether the **`SITE_URL`/OG fix** landed (quick re-check:
`curl -s https://ask-the-claude-docs.vercel.app/ | grep canonical` should show the prod
URL, not localhost). Then **begin P7.0** — the design fine-tuning pass — per the
checklist: read its `reads:` (`design-system.md`, `ui-ux-spec.md`, the v10 mock), walk
each surface with Brandon on the live site, apply adjustments within DS/UX rules (any
token/spec deviation is Tier 3), re-verify. Do **not** re-run completed steps; locate
position from the build log (last entries: P6.G6 gate green, then the P8.1 deploy).

## Operating reminders (from CLAUDE.md)

- Never edit `.claude/docs/` except build-checklist **status markers + build-log lines**,
  unless Brandon explicitly authorizes a doc amendment (he did for the PERF §1/§2
  floor amendments this cycle).
- Tier 3 (stop and ask): anything touching `architecture.md`'s decision log, schema, a
  **new dependency**, the API/SSE contract, a design-token/visual deviation, or scope.
- Tests never call paid APIs; the eval harness is the only sanctioned spender. Live
  production smoke calls are Brandon-authorized exceptions, kept minimal.
- Commits reference their step ID; small per-step commits; end messages with the
  `Co-Authored-By` trailer.
