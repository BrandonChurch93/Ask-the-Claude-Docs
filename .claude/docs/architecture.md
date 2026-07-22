# architecture.md

System architecture and complete decision log for Ask the Claude Docs.
Audience: the Claude Code session building this project. Status: **frozen** once approved; design-pending entries are completed after the design deep-dive.

This is the "why" document. Every locked decision lives here with its rejected alternative. The build never re-litigates an entry in this log; a conflict between code convenience and this log is a Tier 3 stop (see `CLAUDE.md`).

---

## 1. What this is

A RAG chatbot over the Claude Code documentation that returns grounded, cited answers — and honestly declines, with receipts, when the docs don't cover the question. Three subsystems:

1. **Ingestion** (offline; GitHub Action, daily + manual): fetch markdown via `llms.txt` → heading-aware chunking → hash-diff → embed only what changed → Supabase Postgres + pgvector. Spec: `rag-design.md` §1–5, §9.
2. **Serving** (Vercel; per query): validate → embed question → top-5 cosine retrieval → threshold partition → either refusal payload (no generation call) or context assembly → Claude generation → SSE stream, sources-first. Spec: `rag-design.md` §6–7, `performance.md` §4.
3. **Evaluation** (CI): deterministic retrieval metrics on every PR; LLM-judged answer quality on pipeline-touching changes; committed run artifacts render the public `/evals` page. Spec: `eval-harness.md`.

The eval harness exercises the production retrieval function and prompt templates — one code path, measured and shipped identically (`RAG-18`, `EVAL-04`).

## 2. Why RAG at all (the standing defense)

Sonnet-class models offer 1M-token context; stuffing the corpus per query is technically possible. It loses on economics and latency: ~200k tokens of context costs on the order of $0.60 of input *per query* with severe time-to-first-token, versus ~5k tokens (≈ $0.007–0.02/query) through retrieval — a 40–80× input-cost reduction and a stream that starts fast enough to ship. Retrieval additionally yields the citation and refusal mechanics that *are* this product. RAG here is an economics-and-product decision, not a fashion one, and the live receipt on every answer is the cost math on display.

## 3. Cost model (operating envelope)

- Per answered query: ~$0.007 (Haiku 4.5 default) / ~$0.021 (Sonnet 4.6 flag), computed live from the usage object (`RAG-17`).
- Per refusal: ~an embedding call (fractions of a cent) — the threshold gate is also the spend defense (`SEC` §4).
- Full corpus embed: single-digit cents; incremental syncs typically zero-to-few chunks (`RAG-20`).
- Eval runs: retrieval < $0.01; full judged suite ~$0.15–0.40 (`EVAL` §6).
- Global daily spend cap bounds the total (`SEC-10`).

## 4. Decision log

### Product
| Decision | Chosen | Rejected & why |
|---|---|---|
| Conversation model | Single-turn v1; schema/design leave room for multi-turn | Multi-turn now — requires LLM query rewriting with its own failure modes and eval surface; deferred deliberately, narratable |
| Unanswerable queries | Server-side decline + near-misses shown under the threshold rule + coverage chips | Answer-with-caveat (undermines grounding); blank refusal (wastes the teaching moment) |
| Citations | Inline `[n]` + expandable citation cards; passage-level with heading anchors | Hover popovers (a11y-fragile, demo-poor); sentence-level attribution (open research problem — don't overpromise) |
| Eval transparency | Public `/evals` page rendering CI-committed JSON | Repo-only (hides the differentiator); live-computed page (can drift from CI truth) |
| Receipt depth | Full: sources · top score · threshold · latency · model · computed cost | Minimal receipt (cost transparency is on-brand and collapses away anyway) |
| Landing suggestions | Include one labeled off-corpus question, positioned last | Only answerable suggestions (visitors would never discover the signature behavior) |
| Abuse posture | Per-IP rate limit + global daily spend cap, both visible product states | Auth-gated demo (kills the self-serve portfolio value) |
| Brand | Standalone under Brandon's name; studio in footer at most | Studio-branded (recruiters are evaluating the person) |
| Corpus scope v1 | Claude Code docs only; multi-source schema day one | All three doc sets (triples eval authoring before the pipeline is validated) |

### Pipeline & data
| Decision | Chosen | Rejected & why |
|---|---|---|
| Corpus access | `llms.txt` + `.md` endpoints; non-markdown pages skipped + logged | HTML scraping (fragile, unnecessary — the corpus is machine-readable) |
| Chunking | Heading-aware; ~500 target / 800 max / 120 min tokens; breadcrumb prefix | Fixed-size sliding window (severs semantic structure) |
| Overlap | None | 10–20% overlap (no measured benefit on semantic boundaries; index cost) |
| Contextual retrieval | Breadcrumb-prefix (cheap form) | LLM-generated chunk context (cost/complexity unjustified at this scale) |
| Chunk identity | Deterministic `chunk_id` + separate `content_hash` | Random UUIDs (breaks citations and eval gold labels every sync) |
| Vector store | pgvector on Supabase; HNSW (`m=16, ef_construction=64`), cosine | Pinecone (headroom without need; abstracts the layer being learned; second vendor). IVFFlat (worse recall curve) |
| Refusal mechanism | Server-side threshold gate, pre-generation; threshold also filters context | Model-side-only refusal (nondeterministic, spends tokens); padding context with sub-threshold chunks |
| Threshold value | Calibrated from own eval distributions; committed artifacts; dated config entry | Borrowed literature value (meaningless across corpora/models) |
| Re-sync | GitHub Action (daily + manual), hash-diff, loud failure, sync log | Vercel cron (runtime ceiling, less visible); full re-embed each sync (wasteful, hides the diff skill) |
| Freshness/coverage UI | Derived from sync data | Hardcoded (drifts into lying) |

### Models
| Decision | Chosen | Rejected & why |
|---|---|---|
| Embeddings | OpenAI `text-embedding-3-small`, 1536d | `3-large` (6× cost, marginal gain at this corpus size); Voyage (fine, thinner tooling, third vendor) |
| Generation | Claude Haiku 4.5 default; Sonnet 4.6 config flag; evals arbitrate | Always-Sonnet (spend should be earned by measured quality delta) |
| Judge | Sonnet 4.6, temp 0 — stronger tier than generator | Same-tier judging (self-preference risk) |

### Frontend & engineering
| Decision | Chosen | Rejected & why |
|---|---|---|
| Framework | Next.js 16 App Router, React 19, TS strict, Vercel | (uncontested defaults for this stack and story) |
| Styling | CSS Modules + custom-property tokens | Tailwind (utility vocabulary between a bespoke token system and components; extra dependency) |
| Streaming | Hand-rolled SSE; sources event precedes first token | Vercel AI SDK (owns the protocol; sources-first ordering is the product's spine) |
| Data access | Direct SQL (`postgres`), plain `.sql` migrations | ORM (abstracts the queries that are the curriculum) |
| Components | Bespoke, directly tested | Component library (the a11y engineering is the signature) |
| State | Explicit turn state machine | Store library (unneeded at this scale) |
| API runtime | Node, explicit per route | Edge (no latency win — model TTFT dominates; SDK/driver friction) |
| Mutations | The SSE endpoint only | Server Actions (second invocation model, zero benefit) |
| Output rendering | Owned tokenizer → React elements; zero `dangerouslySetInnerHTML` | Markdown renderer on raw output (XSS surface) |
| Test spend | Mocked model clients; evals are the only paid caller | Live-API tests (cost + flake) |

### Quality & measurement
| Decision | Chosen | Rejected & why |
|---|---|---|
| Eval architecture | Deterministic retrieval backbone + judged answer layer, split | Single judged score (noisy at n≈28; can't isolate retrieval regressions) |
| Rubric | Four binary checks | 1–5 scalars (unstable across judge runs) |
| Refusal scoring | Server-metadata assertion (generation calls = 0) | LLM-judged refusal (nondeterminism where determinism exists) |
| Regression bar | Zero-tolerance on exact metrics; measured noise margin on judged | Fixed universal margin |
| Baselines | Explicit reviewed re-baseline commits | Auto-update on green (silently ratchets down) |
| Perf measurement | Lab-only (Lighthouse CI, Playwright, server timing); stated honestly | RUM in v1 (third-party script; unneeded at portfolio traffic) |
| CLS bar | 0.05 | 0.1 standard (a streaming UI should prove layout discipline) |
| Latency truth | Server-measured segments rendered verbatim in receipts | Client re-measurement (can drift from the displayed number) |
| A11y sequencing | Constraints written before visual design | Post-design audit (conflicts ship) |
| Streaming a11y | Status-region state announcements; token stream never live | Live-region answer text (announcement storm) |

### Security
| Decision | Chosen | Rejected & why |
|---|---|---|
| Failure posture | Per-IP limiter fails open; spend cap fails closed | Uniform posture (risks wallet or availability needlessly) |
| Spend accounting | Real computed cost, checked pre-generation | Request-count proxy (miscounts refusals vs answers) |
| Injection defense | Structural: no tools, no client params, bounded tokens, template isolation | Instruction-based defense as primary (weakest layer alone) |
| User data | Questions never persisted; no user-derived tables | Query analytics (privacy cost, no v1 consumer) |

### Design (locked at direction level; detail pending the design deep-dive)
| Decision | Chosen | Rejected & why |
|---|---|---|
| Direction | Editorial-light body + mission-control instrument detail; "glass box" — cinema is the pipeline made visible | Terminal-dark genre (camouflage in 2026); decorative motion (undefendable under reduced-motion) |
| Theme | Light-only; tokens architected for a later dark swap | Dark-first (genre default); toggle (doubles QA surface, impresses no one) |
| Type system | Three voices — serif answers, sans chrome, mono instrument | Single-family UI (loses the who's-speaking signal) |
| Pipeline visibility | Choreograph per question → persistent receipt strip; pinnable full panel (demo mode) | Always-on panel (premium software puts machinery away); fully hidden (buries the differentiator) |
| Refusal tone | Calm editor's note; no red, no error iconography | Alarm styling (declining is the system working) |
| *Pending* | Typography selection, final palette values + measured contrast pairs, spacing/motion tokens, per-surface layouts | — completed in `design-system.md` / `ui-ux-spec.md` after the deep-dive |

## 5. Deliberately deferred (v1.5+ roadmap, not scope creep)

Multi-turn with query rewriting · multi-corpus (API + MCP docs) · hybrid search (tsvector + vector fusion) and reranking · dark theme · persistent research-mode panel as default · RUM/observability stack. Each is deferred with reasoning recorded above or in `honesty-boundaries.md`; none may be pulled into v1 without a Tier 3 decision.
