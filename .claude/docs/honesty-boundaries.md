# honesty-boundaries.md

Every place this portfolio project differs from what production would require — so the project is never overstated in interviews, on the resume, or in the README.
Audience: Brandon first, the build session second. The public README's "scope and honesty" section is condensed from this file. Status: **frozen** once approved.

Format: what v1 does → what production would require. Each entry is phrased so it can be said out loud, verbatim, in an interview. The posture throughout: these are *scoping decisions with reasons*, not gaps discovered later.

---

## Scale

- **Corpus:** a few hundred pages, low thousands of chunks. pgvector with HNSW is comfortable far beyond this — but running it at 3k chunks is not evidence of running it at 300M. Production at serious scale means index memory planning, partitioning strategy, embedding-throughput pipelines, and possibly a dedicated vector service; none of that is demonstrated here, and the pgvector-over-Pinecone decision explicitly assumed this corpus size.
- **Traffic:** designed for portfolio traffic (dozens of users, single region, cold starts accepted). Production means concurrency planning, connection-pool sizing under load, queueing/backpressure on the model APIs, multi-region strategy, and load testing — none performed.
- **The honest sentence:** "It's architected with the seams in the right places for scale — deterministic IDs, hash-diff sync, one config surface — but it has never carried load, and I'd say so before anyone asked."

## Identity & access

- **v1:** no accounts, no auth, no sessions, no personalization. This deletes entire vulnerability and compliance classes — deliberately.
- **Production:** authn/authz, session management, per-user quotas, tenant isolation, and the privacy/compliance obligations user data brings (retention policy, DSRs, encryption posture).
- The privacy story is one sentence because there is no user data: questions are never persisted (`SEC-14`). Production analytics would reopen that entire question.

## Observability & operations

- **v1:** lab-only performance measurement (Lighthouse CI, Playwright, server-side timings in receipts); Vercel's default function logs; a sync log table; CI as the only alarm.
- **Production:** RUM, distributed tracing, structured logging with retention policy, dashboards, alerting with an on-call rotation, error budgets/SLOs, incident process. The receipts show single-request truth; production needs population truth.
- **No SLA.** The demo can be down; the spend cap prefers down to expensive (`SEC-10`), which is exactly backwards from a revenue system and correct for this one.

## Security

- **v1 covers its actual threat surface** (wallet, injection, XSS, secrets — `security.md`) and stops there.
- **Production adds:** WAF/bot management beyond IP rate limiting, secret rotation and KMS, dependency scanning beyond `npm audit`, pen testing, DDoS posture beyond platform defaults, and a security review process. The prompt-injection story also changes completely the day the generation call gets tools — v1's "blast radius is its own token cost" property is load-bearing and would need re-derivation.

## Retrieval quality

- **Eval set is n≈28.** Large enough to catch real regressions on deterministic metrics; small enough that judged pass-rates carry visible noise (measured and margined per `EVAL` §4–5, but a margin is a mitigation, not a fix). Production means hundreds of cases, stratified by query type, refreshed from real traffic, with human-labeled samples auditing the judge.
- **No hybrid search, no reranker, single embedding model, no A/B machinery.** The harness can *detect* whether those would help; v1 doesn't ship them. Deferred, not forgotten (`architecture.md` §5).
- **Judge-based scoring inherits judge fallibility.** Binary rubric + stronger-tier judge + temp 0 + noise margins reduce it; only human evaluation removes it.
- **Sync is daily, not real-time.** The freshness timestamp makes the staleness window honest; production docs-QA might want webhook-driven sync. A daily window on a docs corpus was judged acceptable and, more importantly, is *displayed*.

## Cost & product economics

- Per-query cost is real and displayed, and the daily cap bounds spend — but there is no billing, quota, or unit-economics machinery. The cap is a fuse, not a metering system.

## What is NOT on this list (claims defensible as-is)

Worth stating so the humility above doesn't undersell what's real: the accessibility conformance is genuinely verified, not aspirational (`accessibility.md` §8 manual passes included). The eval harness genuinely gates CI. The re-sync genuinely diffs by hash and is exercised against real doc changes. The refusal behavior is genuinely deterministic and measured. The performance budgets are genuinely enforced by instruments. These are production-grade *practices* applied at portfolio *scale* — that distinction, stated plainly, is the whole positioning.

## Resume/interview phrasing rules

- Never "production-ready." Say: "built with production practices — CI-gated evals, enforced performance budgets, WCAG 2.2 AA verified — at portfolio scale, with the scale boundaries documented."
- Never "handles X" for anything in this file's production columns. The README's honesty section links here in spirit: what it does, what it deliberately doesn't, why.
- When asked "what would you do differently for production," the answer is this file, roughly in order: load-test and observe first, grow the eval set from real traffic second, then auth and the compliance surface it drags in.
