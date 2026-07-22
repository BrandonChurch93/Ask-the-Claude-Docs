# engineering-standards.md

Engineering conventions and framework rules for Ask the Claude Docs.
Audience: the Claude Code session building this project. Status: **frozen** once approved.

This doc exists to pre-exercise judgment: every framework capability and convention is ruled on explicitly so nothing gets skipped by never coming up. Rule IDs use the prefix `ENG-`.

Related docs: `performance.md` (budgets these standards must hit), `security.md` (input/secret handling), `rag-design.md` (pipeline being implemented), `CLAUDE.md` (decision authority — any situation these rules don't cover is a Tier 3 stop-and-ask, not an improvisation).

---

## 1. Stack and versions

- **Next.js 16** (App Router, Turbopack), **TypeScript** (strict), **CSS Modules** with design tokens as CSS custom properties (no styling framework), **React 19**, deployed on **Vercel**. Node LTS.
- Exact versions are pinned at scaffold time in `package.json` and recorded in the scaffold checklist step's handoff. No `latest` tags. Upgrades during the build are Tier 3 decisions.
- Package manager: **npm** with committed `package-lock.json`.

**Rules**
- `ENG-01` All dependency versions pinned (exact or tilde-patch); lockfile committed; CI installs with `npm ci`.

## 2. Dependency policy

Minimal by design. The approved dependency set:

| Purpose | Package |
|---|---|
| Anthropic API | `@anthropic-ai/sdk` |
| OpenAI embeddings | `openai` |
| Postgres access | `postgres` (porsager) — direct SQL, no ORM |
| Validation | `zod` |
| Tokenization | `js-tiktoken` |
| Rate limiting | `@upstash/ratelimit`, `@upstash/redis` |
| Unit/integration tests | `vitest` |
| Browser tests + a11y scans | `playwright`, `@axe-core/playwright` |

Decisions embedded here (for the decision log):
- **No ORM** (rejected: Prisma/Drizzle). The schema is two tables and the queries are the curriculum — `order by embedding <=> $1` should be visible SQL, not abstracted. Migrations are plain `.sql` files in `db/migrations/`, applied by a script, committed in order.
- **No Vercel AI SDK** (rejected). The SSE protocol is custom by design: the sources-first event ordering (`RAG-16`) is the product's spine, and `useChat`-style abstractions assume their own protocol. Hand-rolled SSE (a route handler returning a `ReadableStream`, a small client parser) is ~150 lines, fully owned, fully explainable.
- **CSS Modules, no styling framework** (rejected: Tailwind). The design system is bespoke and token-driven; tokens live as CSS custom properties in `app/tokens.css` (the file `design-system.md` will define), components style via colocated `*.module.css` importing those properties. A utility framework would interpose its vocabulary between the tokens and the components without adding capability, and it's a dependency the project doesn't need. Inline styles only for genuinely dynamic values (e.g. a similarity-score width); everything static lives in the module file.
- **No component library** (rejected: shadcn/radix for v1). The component inventory is small and bespoke to the design system; primitives that need real a11y engineering (the citation-card disclosure, the pinned panel) are built and tested directly — that's the signature, not a liability. Revisit only if a Tier 3 case arises.

**Rules**
- `ENG-02` Adding any dependency not in the table above is a Tier 3 decision: stop and ask.
- `ENG-03` No ORM; all SQL lives in `lib/db/` as tagged-template queries; migrations are ordered `.sql` files.

## 3. Project structure

```
ask-claude-docs/
├── .claude/docs/            # this documentation pack (read-only to the build)
├── CLAUDE.md                # operating contract
├── app/
│   ├── layout.tsx           # root layout: fonts, metadata defaults, skip link
│   ├── page.tsx             # landing + chat (single surface)
│   ├── evals/page.tsx       # scoreboard (renders committed JSON)
│   ├── api/ask/route.ts     # the SSE query endpoint
│   ├── error.tsx            # segment error boundary
│   └── not-found.tsx
├── components/              # one component per file, colocated *.test.tsx
├── lib/
│   ├── config.ts            # single source of truth (RAG-19)
│   ├── env.ts               # zod-validated environment access
│   ├── db/                  # sql client + queries
│   ├── rag/                 # chunker, embedder, retriever, prompt templates
│   └── stream/              # SSE encode (server) / parse (client)
├── db/migrations/
├── evals/                   # testset.json, baseline.json, runs/, harness code
├── scripts/                 # ingest.ts, calibrate.ts (run via tsx)
├── .github/workflows/       # ci.yml, sync.yml, evals.yml
└── e2e/                     # playwright specs incl. axe scans
```

**Rules**
- `ENG-04` The structure above is authoritative; new top-level directories are Tier 2 (log it) — moving pipeline code out of `lib/rag/` is Tier 3.
- `ENG-05` Every file in `components/` and `lib/` uses kebab-case names and named exports (default exports only where Next.js requires them: pages, layouts, route handlers, error boundaries).

## 4. TypeScript

- `strict: true` plus `noUncheckedIndexedAccess: true`. No `any` — a genuinely unavoidable `any`/assertion carries an inline comment stating why, and more than a handful project-wide is an audit failure.
- All external data crosses a zod boundary before use: API request bodies, environment variables, third-party API responses (embedding and generation responses, `llms.txt` parse output), eval artifacts read from disk.
- Types shared between server and client (SSE event payloads, receipt shape, source card shape) live in `lib/stream/types.ts` — one definition, imported by both sides.

**Rules**
- `ENG-06` `tsc --noEmit` passes with zero errors in CI; no `@ts-ignore`/`@ts-expect-error` without an inline justification comment.
- `ENG-07` Every route handler validates its input with a zod schema before any other logic; parse failures return 400 with a typed error body.
- `ENG-08` SSE event payload types are defined once and imported on both server and client.

## 5. Environment and secrets

- `lib/env.ts` defines a zod schema for every variable and parses `process.env` once at module load — the app fails at boot, not at first use, on a missing/malformed variable.
- Server-only secrets (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DATABASE_URL`, `UPSTASH_*`) are never prefixed `NEXT_PUBLIC_` and never imported into client components (enforced via the `server-only` package import in `env.ts`).
- `.env.example` lists every variable with a placeholder and one-line description; kept in lockstep with the schema.

**Rules**
- `ENG-09` All environment access goes through `lib/env.ts`; `process.env` appears nowhere else.
- `ENG-10` `env.ts` imports `server-only`; secrets cannot reach the client bundle.
- `ENG-11` `.env.example` and the env schema list identical variable sets (audit: diff them).

## 6. Next.js framework-feature checklist

Every built-in capability, ruled on. "Use" means required; "Don't" means its absence is deliberate and documented here — not an oversight.

| Feature | Ruling |
|---|---|
| Server Components | **Default everywhere.** `'use client'` only on leaf components that need state/handlers (chat input, citation cards, pinned panel, choreography). Landing shell, /evals page, receipts markup render on the server. |
| `next/font` | **Use.** All typefaces self-hosted via `next/font/local` or `next/font/google` with subsetting; zero external font requests; `display` strategy per `performance.md`. |
| Metadata API | **Use.** Root defaults + per-route: title template, description, OpenGraph + Twitter cards (static OG image), canonical, favicon set, `viewport`. The repo's social card is part of the portfolio surface. |
| `next/image` | **Ruled, mostly unused.** v1 has at most the OG image (static, not rendered in-app). If any raster image enters the UI, it goes through `next/image`. SVG stays inline. |
| `loading.tsx` / Suspense | **Use** for `/evals`; the chat surface manages its own streaming states per `ui-ux-spec.md` (route-level spinners would fight the choreography). |
| `error.tsx` / `not-found.tsx` | **Use.** Both implemented, styled per design system, with recovery actions. API errors are handled in-surface (ui-ux-spec error state), not by the boundary. |
| Route handler runtime | **Explicit per route.** `/api/ask`: Node runtime (declared `export const runtime = 'nodejs'`), streaming response. Rationale: full SDK compatibility + Postgres driver; edge buys nothing here since latency is dominated by model TTFT. |
| Caching / revalidation | `/evals` and landing are static at build (`export const dynamic = 'force-static'` where applicable); eval JSON is committed, so a deploy is the revalidation event — no ISR timers to reason about. `/api/ask` is `force-dynamic`, uncached, `Cache-Control: no-store`. |
| Server Actions | **Don't.** The one mutation path is the SSE endpoint; Actions add a second invocation model for zero benefit. |
| Middleware | **Use, minimal.** Rate-limit check (Upstash) on `/api/ask` only, per `security.md`. No auth, no rewrites. |
| `next.config` | Explicit: typed routes on; security headers per `security.md`; anything else default and untouched. |
| Parallel/intercepting routes, i18n, PPR | **Don't.** No use case in this surface area; adopting any is Tier 3. |

**Rules**
- `ENG-12` A `'use client'` directive appears only on components listed as client islands in `ui-ux-spec.md`; each addition beyond that list is Tier 2 (logged with reason).
- `ENG-13` Every route handler declares its runtime explicitly.
- `ENG-14` `/api/ask` responses set `Cache-Control: no-store`.
- `ENG-15` The Metadata API checklist above (title template, description, OG/Twitter, canonical, favicons, viewport) is fully populated before the deploy phase.

## 7. React and client-code conventions

- Client data flow: the SSE parser feeds a single reducer per conversation turn (states: `idle → retrieving → streaming → settled | refused | errored`); components render from that state machine. No `useEffect` chains deriving state from state.
- No fetching in `useEffect` for anything a server component can fetch.
- No global state library; the state machine + context is sufficient at this scale (a store dependency would be Tier 3).
- Animation: CSS transitions/keyframes driven by state classes; `transform`/`opacity` only (`PERF` rules); every animation wrapped in `prefers-reduced-motion` handling per `accessibility.md`.

**Rules**
- `ENG-16` The streaming turn is modeled as one explicit state machine; its states match the surface states named in `ui-ux-spec.md` one-to-one.

## 8. Testing strategy

| Layer | Tool | What is covered |
|---|---|---|
| Unit | vitest | Chunker against fixture markdown (sizes, atomicity, breadcrumbs — `RAG-04/05/06`); chunk-id determinism (`RAG-08`); hash-diff planner (`RAG-09/20` via fixtures); threshold partition + refusal gate (`RAG-13/14`); SSE encoder/parser round-trip; zod schemas (reject cases). |
| Integration | vitest | `/api/ask` route with mocked model/db clients: event ordering (`RAG-16`), refusal path makes zero generation calls, error paths return typed bodies. |
| Browser + a11y | Playwright + axe | The golden-path walkthroughs from `success-criteria.md` that automate cleanly (ask → cited answer, refusal path, keyboard traversal); axe scan per surface with zero violations (`accessibility.md` gate). |
| Evals | harness | Per `eval-harness.md` — quality regression, distinct from correctness tests. |

- Mocks for the Anthropic/OpenAI clients live in `test/mocks/` and simulate streaming shapes; tests never call paid APIs (evals are the sanctioned spender).
- Coverage is not a vanity metric: the audited requirement is that every `RAG-`/`ENG-` rule marked testable has a named test, tracked in the checklist's audit steps.

**Rules**
- `ENG-17` `npm test` (unit+integration) and `npm run test:e2e` pass in CI; unit tests make zero network calls.
- `ENG-18` Every testable rule ID cited by a checklist step has a corresponding named test before that step is marked complete.

## 9. Lint, format, CI

- ESLint (`eslint-config-next` + `@typescript-eslint` strict) and Prettier (defaults, no bikeshedding), both enforced in CI.
- `ci.yml` on every PR, in order: `npm ci` → typecheck → lint → unit/integration tests → retrieval evals (`EVAL-06`) → build → Playwright+axe → Lighthouse CI (budgets per `performance.md`). Judged evals per `EVAL-13` path filters.
- Conventional commit messages; every commit made during the checklist build references its step ID (`[B4-07]`-style prefix) so the git history is an execution log of the checklist.

**Rules**
- `ENG-19` The CI pipeline order above is implemented as specified; a red step blocks merge — no `continue-on-error` anywhere in `ci.yml`.
- `ENG-20` Build-phase commits carry their checklist step ID.

---

## Decision summary (for architecture.md's log)

| Decision | Chosen | Rejected |
|---|---|---|
| Data access | Direct SQL (`postgres`), plain .sql migrations | ORM (abstracts the queries that are the point) |
| Styling | CSS Modules + custom-property tokens | Tailwind (interposes utility vocabulary over a bespoke token system; extra dependency) |
| Streaming | Hand-rolled SSE, custom sources-first protocol | Vercel AI SDK (owns the protocol; RAG-16 needs ours) |
| Components | Bespoke, built + tested directly | Component library (a11y engineering is the signature) |
| State | Explicit turn state machine, no store | Global state library (unneeded at this scale) |
| Runtime for /api/ask | Node, explicit | Edge (no latency win; SDK/driver friction) |
| Mutations | SSE endpoint only | Server Actions (second invocation model, zero benefit) |
| Test spend | Mocked model clients in tests; evals are the only paid caller | Live-API tests (cost + flake) |
