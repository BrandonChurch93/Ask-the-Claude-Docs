# security.md

Security requirements for Ask the Claude Docs. Short and sharp by design: a public, unauthenticated demo that spends money per request has a specific threat surface, and this doc covers exactly that surface.
Audience: the Claude Code session building this project. Status: **frozen** once approved.

Rule IDs use the prefix `SEC-`. Related docs: `engineering-standards.md` (env/validation mechanics), `rag-design.md` (prompt structure), `honesty-boundaries.md` (what production security would add: auth, WAF, audit logging, secret rotation).

Threat model in one paragraph: no accounts, no user data at rest, no privileged actions — so the real risks are (1) **wallet drain** via automated traffic, (2) **prompt injection** attempting to repurpose the generation call, (3) **output-handling XSS** if model text were ever rendered as markup, and (4) **secret leakage** through the client bundle, logs, or repo. Everything below maps to one of those four.

---

## 1. Secrets

- All secrets (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DATABASE_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) live in Vercel environment config and locally in untracked `.env.local`; access only via `lib/env.ts` (`ENG-09`) with its `server-only` guard (`ENG-10`).
- Never logged: no secret, in full or in part, appears in any log statement, error message, thrown error, or SSE payload. Error objects from SDK calls are sanitized before any logging (SDKs can embed request metadata).
- The Supabase connection uses the pooled connection string with the service role confined to the server; no Supabase client-side SDK, no anon key in the bundle (the browser never talks to the database).
- `.gitignore` covers `.env*` except `.env.example`; a pre-commit hygiene check in CI greps the diff for key-shaped strings (`sk-`, `postgres://` with credentials).

**Rules**
- `SEC-01` No secret reaches the client bundle (build-output grep for key prefixes is a CI assertion).
- `SEC-02` No secret appears in logs or error payloads; SDK errors are sanitized at the catch site.
- `SEC-03` The browser has no database credentials of any kind; all data access is server-side.

## 2. Input validation

- `/api/ask` accepts exactly one shape: `{ question: string }`, zod-validated (`ENG-07`): non-empty after trim, **max 500 characters**, control characters stripped, no other fields tolerated (`.strict()`).
- Single-turn is a security property, not just a scope decision: there is no client-supplied history, system prompt, source list, or model parameter — the client sends a question and nothing else. Model, `k`, threshold, and max_tokens come from server config exclusively.
- Oversize or malformed input → 400 with a typed error body; never echoed back unescaped in any HTML context (it's rendered only through React text nodes, §3).

**Rules**
- `SEC-04` Request schema is `.strict()` with the 500-char cap; every other generation parameter is server-owned.
- `SEC-05` No client-supplied content is ever interpolated into the system prompt or source block — the question occupies only the user-turn slot defined in `rag-design.md` §7.

## 3. Prompt injection and output handling

Posture: the user question is **untrusted instruction-shaped data**; the corpus is **our own docs but still data, not instructions**; model output is **untrusted text**.

- The prompt template (`RAG-18`) places instructions in the system prompt and delimits the user question explicitly as a question to be answered from sources. A question containing "ignore your instructions and…" is just a question that the sources won't support — the worst realistic outcome is a refusal or an off-topic answer bounded by `max_tokens` (`PERF-11`).
- Injection cannot escalate because there is nothing to escalate to: no tools, no function calling, no user data, no actions. The generation call's blast radius is its own token cost. This is a stated design property — keep it true (adding tool use to the generation call later would be a Tier 3 security decision, not a feature tweak).
- Model output is rendered exclusively as text through React's default escaping. **No `dangerouslySetInnerHTML` anywhere in the codebase** — not for the answer, not for anything. Citation markers `[n]` are parsed from the text stream by a tokenizer and rendered as React elements; markers resolve only against the server-sent sources array (a marker with no matching source renders as plain text, per the `citations-valid` eval check).
- If lightweight formatting (code spans, paragraphs) is wanted from the model, it is parsed with the same owned tokenizer into React elements — never handed to an HTML/markdown renderer with raw output.
- Retrieved chunk content shown in citation cards is likewise rendered as text (our corpus could one day contain adversarial markdown in a code sample; it stays inert).

**Rules**
- `SEC-06` `dangerouslySetInnerHTML` appears zero times in the codebase (CI grep assertion).
- `SEC-07` Model output and chunk content render only through React text nodes / the owned tokenizer.
- `SEC-08` The generation call has no tools and no user-controllable parameters; adding either is Tier 3.

## 4. Rate limiting and spend cap (the wallet defense)

Two independent layers, different failure postures — this asymmetry is deliberate:

- **Per-IP limiter** (Upstash sliding window, in middleware, `/api/ask` only): defaults **10 requests/min** and **50 requests/day** per IP (values in `lib/config.ts` per `RAG-19`). Exceeded → 429 with the rate-limit UI state and `Retry-After`. **Fails open**: if Upstash is unreachable, requests proceed — availability wins for the per-IP layer because the global cap still bounds the damage.
- **Global daily spend cap**: a server-side counter (Upstash, keyed by UTC date) accumulates the *computed real cost* of every request (the same usage-object math as the receipt, `RAG-17`/`PERF-06`). Requests are rejected once the counter exceeds the configured daily dollar cap — checked *before* the generation call. **Fails closed**: if the counter can't be read or written, no generation call is made. The wallet layer prefers a down demo to an unbounded bill.
- The rate-limit and cap-reached responses are honest product states (per IA surface 5): the cap message says what the cap is for. "This demo caps its own spending; resets at midnight UTC."
- Cost asymmetry note: refusals cost ~an embedding call (`RAG-13`), so hostile junk traffic mostly hits the cheap path — the threshold gate is also a spend defense.

**Rules**
- `SEC-09` Per-IP limits enforced in middleware before the route handler runs; fail-open, logged when open.
- `SEC-10` Global spend cap checked before every generation call, accumulating real computed cost; fail-closed.
- `SEC-11` Both layers' numbers live in `lib/config.ts`; both rejection states render the specified UI states, not raw errors.

## 5. Transport and headers

Set globally in `next.config` (`ENG` §6):

- `Content-Security-Policy`: `default-src 'self'`; `script-src 'self'` (plus the minimal Next-required inline allowances — prefer nonces if friction is low); `style-src 'self' 'unsafe-inline'` (CSS Modules inject styles; accepted and documented); `img-src 'self' data:`; `font-src 'self'`; `connect-src 'self'`; `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self'`. Self-hosted fonts (`PERF-04`) are what make a no-external-origins CSP possible — the performance rule and the security rule are the same rule.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` denying sensors/camera/mic. HSTS is provided by Vercel on the platform domain.
- `/api/ask`: `Cache-Control: no-store` (`ENG-14`) — answers must never be cached cross-user by any intermediary.

**Rules**
- `SEC-12` The header set above ships on every route; verified by an integration test asserting response headers.
- `SEC-13` CSP contains no wildcard origins and no external origins.

## 6. Data minimization and logging

- **User questions are not persisted.** No analytics store, no query log table in v1. What exists server-side: ephemeral function logs (Vercel's default retention) containing request metadata and sanitized errors — and even there, log the question's length and outcome, not its text. A curious visitor's question is theirs.
- The database contains only corpus data and sync logs — nothing user-derived. This makes the privacy story one sentence long and true.
- The spend counter stores aggregate cost per day, no per-request records.

**Rules**
- `SEC-14` No user question text is written to any persistent store or structured log.
- `SEC-15` The database schema contains no user-derived tables; adding one is Tier 3.

## 7. Supply chain and CI

- Dependencies pinned + `npm ci` (`ENG-01`); `npm audit` runs in CI — blocking on high/critical, report-only below.
- GitHub Actions pinned to commit SHAs, not floating tags; workflow permissions default to `contents: read`, elevated per-job only where the sync/eval commit steps need write.
- Secrets used by Actions (sync + evals need API keys) live in GitHub Actions secrets, referenced per-job, never echoed.

**Rules**
- `SEC-16` `npm audit` blocking at high severity in CI.
- `SEC-17` All Actions SHA-pinned; workflow permissions least-privilege.

---

## Decision summary (for architecture.md's log)

| Decision | Chosen | Rejected |
|---|---|---|
| Failure posture | Per-IP limiter fails open; spend cap fails closed | Uniform posture (either risks the wallet or kills availability unnecessarily) |
| Spend accounting | Real computed cost accumulated pre-generation-gated | Request-count proxy (miscounts expensive vs refused requests) |
| Output rendering | Owned tokenizer → React elements; zero dangerouslySetInnerHTML | Markdown renderer on raw model output (XSS surface for zero need) |
| Question logging | Not persisted; length + outcome only in ephemeral logs | Query analytics (privacy cost with no v1 consumer) |
| Injection defense | Structural (no tools, no client params, bounded tokens) + template isolation | Prompt-based "do not obey injections" as primary defense (weakest layer alone) |
