# rag-design.md

Authoritative specification for the retrieval pipeline of Ask the Claude Docs.
Audience: the Claude Code session building this project. Status: **frozen** once approved — changes require an explicit instruction from Brandon, never a unilateral edit.

Rule IDs use the prefix `RAG-`. Checklist self-audit steps cite these IDs. Every rule is pass/fail.

Related docs: `architecture.md` (decision log), `eval-harness.md` (how this pipeline is measured), `ui-ux-spec.md` (how retrieval renders).

---

## 1. Corpus

- **v1 corpus:** Claude Code documentation only. Source of truth: `https://code.claude.com/docs/llms.txt` (the markdown index of all pages).
- Discovery: fetch `llms.txt`, parse the linked page URLs. Each page serves raw markdown at its `.md` URL.
- **Corpus scope:** the discovered set MINUS `config.corpus.excludedPagePatterns` (`changelog`, `whats-new/*`), applied at discovery so excluded pages are never ingested and the daily sync deletes any that were ingested before. *(Added 2026-07-23 at P4.3 per rule-1 authorization.)* Release-note content is high-volume and low-value for how-to questions, and grows every sync; excluding it at ingestion keeps the retrieval query a plain top-k (no HNSW post-filter or `ef_search` machinery). Accepted foreclosure: "what changed in week X" is out of scope for this how-to Q&A. The retrieval-time-filter alternative was rejected after being falsified twice — HNSW post-filters its approximate candidate set, and its candidate count is capped at `ef_search` — so a `WHERE`-clause exclusion returns fewer than `k` results when a query's nearest neighbours are all excluded.
- The schema is multi-corpus from day one (`source` column); v1 populates a single source value `claude-code`.
- **Known edge case:** not every listed URL is guaranteed to serve raw markdown. The changelog historically served rendered HTML on GitHub and serves markdown as of 2026-07 (verified across all 172 pages); validation is retained because any page could regress. Ingestion must validate each response before parsing.

**Rules**
- `RAG-01` Ingestion fetches only URLs discovered from `llms.txt`, minus `config.corpus.excludedPagePatterns` (applied at discovery); no hardcoded page lists.
- `RAG-02` A fetched page is ingested only if the response is markdown (content sniff: response parses as markdown and is not an HTML document). Non-markdown pages are skipped and recorded in the sync log with the reason — never silently dropped, never HTML-scraped.
- `RAG-03` Raw fetched markdown is stored per page (in the `documents` table) before any chunking, so chunking can be re-run without re-fetching.
- `RAG-23` Excluded pages (`config.corpus.excludedPagePatterns`) are dropped at discovery, so they are never ingested and the diff planner deletes any that were ingested before. Because the corpus is scoped this way, retrieval is a plain top-k and coverage/chips are naturally clean (a defensive filter on the coverage query is belt-and-suspenders). Deleting chunks leaves dead HNSW graph entries, so the sync `VACUUM`s after any deletion, and the eval keeps a permanent under-return guard.

## 2. Chunking

Strategy: **heading-aware structural splitting.** The corpus is well-structured markdown; heading boundaries are the semantic boundaries.

- Split at `##` and `###` headings. `#` (page title) is metadata, not a split point. `####` and deeper stay inside their parent chunk.
- Target chunk size **~500 tokens**; hard maximum **800 tokens**. A section exceeding 800 tokens is split at paragraph boundaries into sequential parts (`part 1/2`, `part 2/2` recorded in metadata), never mid-paragraph, never mid-sentence.
- Minimum chunk size **120 tokens**: a smaller section is merged with the following sibling section (or the preceding one if it is the last section). Merged chunks record both heading paths.
- **No sliding-window overlap.** Rationale (decision log entry): overlap exists to repair arbitrary boundaries; heading boundaries are not arbitrary, and current (2026) analysis shows overlap adds index cost without retrieval benefit on structured corpora. Rejected alternative: 10–20% overlap, the generic default.
- **Contextual header:** every chunk's embedded text is prefixed with its breadcrumb line — `Claude Code docs › {page title} › {heading path}` — followed by a blank line, then the section text. This is the cheap form of contextual retrieval: the embedding carries document provenance, disambiguating sections whose local text is generic ("Configuration", "Examples"). The breadcrumb is part of the embedded text AND stored as structured metadata.
- Fenced code blocks are atomic: never split inside a fence. A code block that alone exceeds 800 tokens stays whole in its own chunk (documented exception to the maximum). Tables are likewise atomic.
- **Oversize-atomic exception:** when an atomic unit (table or code fence) alone exceeds the embedding input limit, split it at natural boundaries — table rows for tables, top-level logical blocks for fences — into segments each under 7,000 tokens (margin below the 8,191 cap). Every table segment re-carries the table's header row plus the chunk's full breadcrumb prefix, so each segment is self-describing. Segment IDs extend the parent deterministically: `{parent-id}/part-1`, `/part-2`, etc. Atomicity remains the rule for everything that fits; this exception exists solely because an unembeddable chunk is unretrievable, which defeats the purpose atomicity serves.
- Token counts are computed with the tokenizer matching the embedding model (`tiktoken`, `cl100k_base` family for text-embedding-3-small); character-count approximations are not acceptable.

**Rules**
- `RAG-04` No chunk except an atomic code-block chunk exceeds 800 tokens; no chunk is below 120 tokens after merging.
- `RAG-05` Every chunk's embedded text begins with its breadcrumb line.
- `RAG-06` No fenced code block or table is split across chunks.
- `RAG-07` All chunking parameters (split levels, target/max/min sizes) are read from the central config (§8), not inlined.

## 3. Chunk identity

The most consequential schema decision in the project: identity is **deterministic**, change detection is **hash-based**, and the two are separate concerns.

- `chunk_id` = slug of `{source}/{page_path}#{heading_slug_path}[-{part_n}]`. Example: `claude-code/hooks#pretooluse`. Derived purely from position in the document structure — identical across syncs while the structure holds.
- `content_hash` = SHA-256 of the normalized chunk text (embedded text, whitespace-normalized). Changes when the words change.
- Consequence: eval gold labels and citations reference `chunk_id` and survive re-syncs. A heading rename or restructure changes the `chunk_id` — that is correct behavior (the section is genuinely a different thing) and surfaces in eval runs as a broken gold label to be re-pointed, never silently remapped.

**Rules**
- `RAG-08` `chunk_id` is derived from source + page path + heading path only. No UUIDs, no auto-increment IDs, no hash-of-content as identity.
- `RAG-09` Re-running ingestion on unchanged docs produces zero embedding calls and zero row changes (idempotency check — this is a required test).

## 4. Storage schema (Supabase Postgres + pgvector)

```sql
create extension if not exists vector;

create table documents (
  page_path      text primary key,          -- e.g. 'hooks'
  source         text not null,             -- 'claude-code'
  title          text not null,
  url            text not null,             -- live docs URL
  raw_markdown   text not null,
  page_hash      text not null,             -- sha256 of raw_markdown
  synced_at      timestamptz not null
);

create table chunks (
  chunk_id        text primary key,          -- deterministic, §3
  page_path       text not null references documents(page_path) on delete cascade,
  source          text not null,
  breadcrumb      text not null,             -- display form
  heading_anchor  text not null,             -- for deep-linking: url + '#' + anchor
  content         text not null,             -- embedded text incl. breadcrumb prefix
  content_hash    text not null,
  token_count     int  not null,
  embedding       vector(1536) not null,
  embedding_model text not null,             -- 'text-embedding-3-small'
  updated_at      timestamptz not null
);

create index chunks_embedding_hnsw on chunks
  using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);
```

- HNSW with pgvector defaults (`m=16, ef_construction=64`, query-time `ef_search` default 40). At this corpus size (single-digit thousands of chunks) an exact scan would also be correct; the index is kept because it is free at this scale and the recall behavior of ANN search is part of what the eval harness demonstrates. Do not tune these parameters without an eval-run justification.
- `embedding_model` guards against mixed-model tables: retrieval queries filter `where embedding_model = $configured_model`, so a partial migration can never silently compare cross-model vectors.

**Rules**
- `RAG-10` The retrieval query filters on the configured `embedding_model`.
- `RAG-11` Distance operator is cosine (`<=>`) everywhere; similarity is computed as `1 - distance`. No mixing of L2/inner-product operators.

## 5. Embedding

- Model: `text-embedding-3-small`, 1536 dimensions, default parameters. No dimension truncation.
- Queries and chunks use the identical model and parameters (`RAG-10` enforces at read time; this rule enforces at write time).
- Ingestion embeds in batches (API accepts arrays); batch size from config.

**Rules**
- `RAG-12` Query embedding and chunk embedding code paths call one shared function; there are not two embedding implementations.

## 6. Retrieval, threshold, and refusal

Per query:
1. Embed the question (shared function, `RAG-12`).
2. `select ... order by embedding <=> $query limit k` with `k = 5` (config).
3. Compute similarity for each result. Partition by the **calibrated threshold** `T`:
   - Chunks with similarity ≥ `T` → the context set.
   - Chunks below `T` → excluded; returned to the client as near-misses (they render dimmed below the threshold rule), never sent to the model.
4. If the context set is **empty**, the request is a **refusal**: no generation call is made. The server returns the refusal payload (near-misses, corpus coverage chips, receipt with embedding-only cost). Refusal is a server-side gate, deterministic and cheap — not a model behavior.
5. Otherwise, assemble the prompt (§7) and stream generation.

Retrieval runs a plain top-k (no exclusion filter): excluded pages are scoped out at ingestion (§1, `RAG-01`/`RAG-23`), so the corpus is already clean and HNSW needs no post-filter.

**The threshold `T` is a calibrated value, never a borrowed one.** Similarity scores are relative to a corpus and model; published numbers from other systems are meaningless here. Calibration procedure and cadence are owned by `eval-harness.md` (§7 there); the resulting value lives in config with its calibration date. Until first calibration, the config value is marked `UNCALIBRATED` and the build-checklist blocks the refusal feature's completion on running the calibration.

Note for implementers: real cosine similarities from text-embedding-3-small typically land well below 1.0 even for strong matches (relevant pairs often 0.4–0.65 against this kind of corpus). Any illustrative scores seen in design mockups are placeholders; the UI renders whatever the instrument actually reads.

**Rules**
- `RAG-13` No generation API call occurs when zero chunks clear the threshold.
- `RAG-14` Chunks below the threshold are never included in the model's context.
- `RAG-15` `k` and `T` are read from config; `T` carries a `calibrated_at` date and the eval-run ID that produced it.

## 7. Context assembly, generation, and citations

Prompt structure (system + user, Anthropic Messages API):

- **System prompt** states: answer only from the provided sources; every factual claim carries a citation marker `[n]` matching a source; if the sources do not contain the answer, the response must **begin with the exact decline sentinel** `The Claude Code documentation doesn't cover this.` and nothing before it, instead of answering; answer style (concise, technical, no preamble). The sentinel is the model-side backstop to the server-side gate (belt and suspenders) and is a single string reused by eval detection and UI rendering (it matches the existing refusal copy). *(Sentinel added 2026-07-23 at P4.4 per rule-1 authorization; calibration showed plausible off-corpus questions are not separable from weak answerable ones by cosine, so the model-side decline carries the refusal load for them — see §6 and eval-harness §3.)*
- **Sources block:** each context chunk rendered as `[n] {breadcrumb}\n{content}` in retrieval-score order, `n` starting at 1.
- **User turn:** the question, verbatim, clearly delimited as untrusted input (see `security.md` for injection posture).

Response protocol (SSE):
1. First event: `sources` — the ordered array of context chunks (id, breadcrumb, url + anchor, similarity, snippet) plus near-misses and the receipt skeleton. Sent **before** any generated token, so the client can resolve `[n]` markers the moment they stream in. The receipt skeleton also carries `retrieval: {embedMs, queryMs}` and `corpusChunks` (see the extension note below).
2. Then: `text` deltas from the generation stream.
3. Final event: `done` — completed receipt: model, latency, token usage, computed cost from the API response's usage object (never an estimate). Being a superset of the skeleton, it inherits `retrieval`/`corpusChunks`, so the early and final retrieval numbers stay consistent.

**SSE-contract extension (P5.1, Tier 3, Brandon-authorized).** The `sources` event's receipt skeleton gained two fields: `retrieval: {embedMs, queryMs}` (the retrieval timings, already measured route-side at the emit point) and `corpusChunks` (total chunks searched, sourced from the RAG-21 corpus stats, cached off the latency path). Rationale: `ui-ux-spec.md` §5 requires the retrieving choreography to narrate *this one event's payload, never a second data source* — its first two stages are `✓ embedded · {ms}` and `✓ searched {chunks} chunks · {ms}`, whose values did not previously ride the `sources` event. Front-loading the retrieval slice into the skeleton keeps the choreography a single-event narration; the `done` Receipt's full `Timings` is unchanged (superset).

- Generation model: `claude-haiku-4-5` default; `claude-sonnet-4-6` behind config flag. Max output tokens from config.
- A `[n]` marker with no corresponding source is a defect (eval-harness checks this as `citations-valid`).

**Rules**
- `RAG-16` The sources SSE event precedes the first text delta.
- `RAG-17` Displayed query cost is computed from the API usage object of that request.
- `RAG-18` The system prompt and sources block templates live in one module; the eval harness imports the same templates (no parallel prompt copies).

## 8. Central config

One module (`lib/config.ts`) is the single source of truth for: chunk split levels, target/max/min token sizes, batch size, embedding model, generation models + active flag, `k`, threshold `T` (+ `calibrated_at`, `calibration_run_id`), max output tokens, rate-limit numbers, daily spend cap. Every other module imports from it. The eval harness snapshots this config into every run's output.

**Rules**
- `RAG-19` No pipeline parameter appears as a literal outside `lib/config.ts`.

## 9. Re-sync (staleness handling)

GitHub Action: scheduled daily + manual `workflow_dispatch`.

1. Fetch `llms.txt`; diff the page list against `documents` → new / removed pages.
2. Fetch every current page; compare `page_hash` → changed pages.
3. For new/changed pages: re-chunk the page, then per chunk compare `content_hash` against existing rows by `chunk_id`:
   - new `chunk_id` → embed + insert;
   - existing id, changed hash → embed + update;
   - existing id, same hash → touch nothing (no embedding call);
   - ids present in DB but absent from the re-chunk of that page → delete.
4. Removed pages → cascade delete.
5. Write a sync log row: timestamp, pages fetched/skipped (with reasons per `RAG-02`), chunks added/updated/deleted, embedding calls made, duration. `synced_at` (max) feeds the UI freshness indicator.
6. Regenerate the corpus coverage list (the refusal state's "the corpus does cover" chips) from the current set of page titles — stored, not hardcoded.

**Rules**
- `RAG-20` A sync against unchanged docs makes zero embedding API calls (same invariant as `RAG-09`, verified in CI against a fixture).
- `RAG-21` Coverage chips and the freshness timestamp are derived from sync data, never hardcoded.
- `RAG-22` Every sync writes a log row; the Action fails loudly (non-zero exit) on partial failure rather than committing a half-sync.

---

## Decision summary (for architecture.md's log)

| Decision | Chosen | Rejected |
|---|---|---|
| Corpus access | llms.txt + .md endpoints | HTML scraping |
| Chunking | Heading-aware, ~500 tok target, 800 max, 120 min, breadcrumb prefix | Fixed-size sliding window with overlap |
| Overlap | None | 10–20% overlap (no benefit on semantic boundaries; index cost) |
| Identity | Deterministic chunk_id + separate content_hash | UUIDs (breaks citations + gold labels on sync) |
| Index | HNSW, pgvector defaults | IVFFlat (worse recall curve); exact-only (forgoes the ANN teaching point) |
| Refusal | Server-side threshold gate, pre-generation | Model-side-only refusal (nondeterministic, spends tokens) |
| Threshold | Calibrated from own eval data | Borrowed literature value (meaningless cross-corpus) |
| Contextual retrieval | Breadcrumb prefix (cheap form) | LLM-generated chunk context (cost/complexity unjustified at this corpus size) |
