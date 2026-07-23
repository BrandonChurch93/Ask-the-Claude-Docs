# eval-harness.md

Authoritative specification for the evaluation harness of Ask the Claude Docs.
Audience: the Claude Code session building this project. Status: **frozen** once approved.

The harness is a first-class feature, not test scaffolding. It has two jobs: prove whether pipeline changes improve or regress quality, and publicly demonstrate that the system knows what it cannot answer.

Rule IDs use the prefix `EVAL-`. Related docs: `rag-design.md` (the system under test), `success-criteria.md` (acceptance thresholds), `ui-ux-spec.md` (the /evals page).

Design principle, stated once: **deterministic retrieval metrics are the backbone; LLM-judged answer quality is the second layer.** Retrieval metrics are exact, free, and run constantly. Judged metrics are noisy and cost money; they run on triggers and are interpreted against measured noise, never as raw point values.

---

## 1. Test set

A versioned file in the repo: `evals/testset.json`. Target size 28 questions in v1:

| Category | Count | Purpose |
|---|---|---|
| `answerable` | 20 | Core retrieval + answer quality. Each has gold chunk labels. |
| `refusal` | 5 | Off-corpus or beyond-corpus questions. Correct behavior is the server-side decline. |
| `boundary` | 3 | Adjacent-to-corpus questions (topic exists but the specific ask isn't covered). These are the hard cases that tune the threshold; expected behavior is recorded per question and may legitimately change after calibration. |

Entry schema:

```json
{
  "id": "q-014",
  "category": "answerable",
  "question": "Can hooks block a tool call before it runs?",
  "gold_chunks": ["claude-code/hooks#pretooluse", "claude-code/hooks#exit-codes"],
  "notes": "Any one gold in top-k counts as a hit."
}
```

Authoring rules:
- Questions are phrased as a real user would ask them — never as paraphrases of the chunk's own sentences. A test set of paraphrases inflates hit-rate and measures nothing (`EVAL-01`).
- Gold labels are deterministic `chunk_id`s per `rag-design.md` §3. Multiple golds are allowed; a hit is any gold in top-k.
- Every corpus top-level area gets at least one answerable question (coverage spread).
- Refusal questions must be *plausible* asks (things a Claude Code user might genuinely wonder, e.g. fine-tuning, pricing negotiation, other products) — not gibberish, which would make the decline trivial.
- The test set is append-mostly. Removing or editing a question requires a changelog note in the file (`why`), because silent edits can manufacture fake improvements.

**Rules**
- `EVAL-01` No test question shares more than incidental wording with its gold chunk text (reviewer check at authoring time).
- `EVAL-02` Every `answerable` question has ≥1 gold `chunk_id` that exists in the current corpus; the harness fails fast on dangling golds (this is how heading restructures surface — see rag-design §3).
- `EVAL-03` Test-set edits carry a changelog entry in the file.

## 2. Retrieval evals (deterministic layer)

For every `answerable` and `boundary` question: embed the question, run the exact production retrieval function (imported, not reimplemented), record the top-k `chunk_id`s and similarities.

Metrics:
- **hit@5** — fraction of answerable questions with ≥1 gold chunk in top-5.
- **MRR** — mean reciprocal rank of the first gold chunk (0 when absent).
- **Per-question record** — retained in the run output so a regression is traceable to specific questions, not just an aggregate dip.

Cost: query embeddings only (fractions of a cent). Runs on **every PR** and locally via `npm run eval:retrieval`.

**Rules**
- `EVAL-04` Retrieval evals import the production retrieval function and production config; zero parallel implementations (mirrors `RAG-18`).
- `EVAL-05` Retrieval eval runs are deterministic given a fixed corpus snapshot. The determinism contract is byte-identical **metrics** (hit@5, MRR) and **chunk rankings**, so a changed number always means a changed system, never run-to-run jitter. Raw similarity scores are diagnostic detail, stored at 3 decimals and documented as carrying ~1e-5 external-API float noise: OpenAI's embedding endpoint is not bit-deterministic for identical input, so cosine scores wobble at the 5th–6th decimal without ever reordering results. Raw scores are therefore not part of the byte-identity contract. *(Amended 2026-07-23 per P4.2 rule-1 authorization; two-run evidence: metrics + rankings byte-identical, raw floats wobbling ~1e-5.)*
- `EVAL-06` Retrieval evals run in CI on every pull request.

## 3. Answer evals (judged layer)

For every `answerable` question that clears retrieval: run the full production query path (context assembly → generation), capture the answer + its citation markers, then judge.

**Judge model:** `claude-sonnet-4-6` — deliberately a stronger tier than the `haiku-4.5` generator (a judge should be at least as capable as the judged; same-model judging invites self-preference bias). Judge calls use temperature 0.

**Rubric — four binary checks per answer** (binary, not 1–5 scales: pass/fail judgments are far more stable across judge runs than scalar scores, and stability is what makes regression detection possible):

| Check | Question the judge answers |
|---|---|
| `grounded` | Is every factual claim in the answer supported by the cited sources provided? |
| `citations-valid` | Does every `[n]` marker exist in the source list, and does the cited source actually support the sentence it's attached to? |
| `complete` | Does the answer address what was asked (not a fragment, not a tangent)? |
| `no-fabrication` | Does the answer avoid asserting anything the sources do not contain (including plausible-sounding additions)? |

The judge prompt receives: the question, the exact sources the generator saw, and the answer. It returns strict JSON (one object, four booleans, a one-line reason per failure). Judge prompt lives beside the harness code and is versioned; changing it invalidates baseline comparisons and requires re-baselining (§5).

**Refusal scoring** is deterministic (not judged), two-tier: for `refusal` questions, pass = the server-side gate declined (no generation call occurred, per `RAG-13`) **OR** the generated response begins with the decline sentinel `The Claude Code documentation doesn't cover this.` (exact-prefix check). Both tiers are deterministic. Calibration (P4.4) showed plausible off-corpus questions score in the answerable band and so pass the gate; the model then declines via the sentinel, and the second tier catches that. The judged `no-fabrication` check remains the backstop for a sentinel miss (a model that answers instead of declining fails there). `boundary` questions score against their per-question expected behavior, same two-tier decline detection. *(Two-tier amendment 2026-07-23 at P4.4 per rule-1 authorization.)*

**Rules**
- `EVAL-07` Judge model is a stronger tier than the generation model under test.
- `EVAL-08` Rubric checks are binary; the judge returns machine-parseable JSON; unparseable judge output is a harness error, never silently scored.
- `EVAL-09` Refusal correctness is asserted deterministically: server metadata (generation call count = 0) OR the exact decline-sentinel prefix on the response. Not judged by an LLM; the judged `no-fabrication` check is the backstop for sentinel misses.

## 4. Noise measurement

Before the first baseline is accepted: run the full judged layer **3 times** against the identical system state. Per-check agreement across runs yields the noise floor. Record: per-check flip rate and the aggregate score's spread (max − min).

The regression margin `M` = the larger of (observed aggregate spread) and 1 judged check. This is measured, not assumed, and it is re-measured whenever the judge prompt or judge model changes.

**Rules**
- `EVAL-10` No judged-metric baseline exists without a recorded noise measurement attached to it.

## 5. Regression policy

- **Retrieval (exact):** any drop in hit@5 or MRR versus baseline is a regression. CI fails the PR. No margin — these numbers are deterministic (`EVAL-05`), so any movement is real.
- **Judged:** aggregate pass-rate drop > `M` versus baseline is a regression; drop ≤ `M` is reported as "within noise." Per-question flips are listed in the report either way.
- **Baselines:** `evals/baseline.json`, updated only by an explicit, reviewed commit ("re-baseline") — never automatically. A re-baseline commit message states why.
- A change that *improves* metrics also updates the baseline via the same explicit mechanism, so improvements are locked in and can't silently erode back.

**Rules**
- `EVAL-11` CI fails on any retrieval-metric drop and on judged drops beyond `M`.
- `EVAL-12` Baseline updates are explicit commits, never automated side effects.

## 6. Run cadence and cost

| Trigger | What runs | Approx cost |
|---|---|---|
| Every PR | Retrieval evals + refusal assertions | < $0.01 |
| PR touching `lib/rag/**`, `lib/config.ts`, prompt templates, or model flags | Full suite (retrieval + judged) | ~20 questions × (generation + judge) ≈ $0.15–0.40 |
| Phase gates (build-checklist) | Full suite, 1 run | as above |
| Baseline / noise measurement | Full suite × 3 | ~3× above |
| Post-sync (corpus changed) | Retrieval evals (validates golds against new corpus) | < $0.01 |

**Rules**
- `EVAL-13` The full judged suite is triggered by path filters in CI config matching the table above.

## 7. Threshold calibration (owned here, consumed by rag-design §6)

Procedure:
1. Run retrieval for all 28 questions; record **top-1 similarity** per question.
2. Plot/tabulate two distributions: answerable questions vs refusal questions (boundary questions annotated individually).
3. Set `T` in the separation gap — specifically: midway between the lowest answerable top-1 and the highest refusal top-1, if a clean gap exists.
4. If the distributions **overlap** (some refusal question scores above some answerable question): resolve by inspection — usually the overlapping answerable question has a bad gold or bad phrasing, or the refusal question is actually partially covered (recategorize to `boundary`). Iterate until the gap is clean or the overlap is understood and documented.
5. Write `T`, `calibrated_at`, and the run ID into `lib/config.ts`. Commit the distribution data into the run output.
6. Recalibrate after: corpus source changes, embedding model changes, or any test-set change touching refusal/boundary questions.

**Rules**
- `EVAL-14` `T` is set by this procedure only; its config entry always carries `calibrated_at` + run ID (mirrors `RAG-15`).
- `EVAL-15` Calibration outputs (both distributions) are committed artifacts, reviewable in the repo.

## 8. Output contract (feeds the /evals page)

Every full run writes `evals/runs/{run_id}.json` and updates `evals/latest.json` (what the /evals page renders — the page reads the committed artifact and cannot drift from CI reality):

```json
{
  "run_id": "2026-08-02T14-11-05Z-a1b2c3",
  "commit": "a1b2c3d",
  "config_snapshot": { "k": 5, "threshold": 0.0, "generation_model": "claude-haiku-4-5", "...": "..." },
  "retrieval": { "hit_at_5": 0.95, "mrr": 0.81, "per_question": [ "..." ] },
  "answers": { "pass_rate": 0.9, "checks": { "grounded": 19, "citations_valid": 18, "complete": 20, "no_fabrication": 20 }, "per_question": [ "..." ], "noise_margin": 0.05 },
  "refusals": { "passed": 5, "total": 5 },
  "boundary": { "per_question": [ "..." ] },
  "baseline_delta": { "retrieval": "+0.00", "answers": "+0.02" }
}
```

(Values above are schema illustration, not targets — targets live in `success-criteria.md`.)

**Rules**
- `EVAL-16` `/evals` renders only committed run artifacts; it performs no live computation.
- `EVAL-17` Every run artifact embeds the config snapshot and commit SHA it ran against.

---

## Decision summary (for architecture.md's log)

| Decision | Chosen | Rejected |
|---|---|---|
| Metric architecture | Split: deterministic retrieval backbone + judged answer layer | Single LLM-judged score (noisy at n≈30, can't isolate retrieval regressions) |
| Judge | Sonnet 4.6, temp 0, stronger tier than generator | Haiku judging Haiku (self-preference risk) |
| Rubric scale | Four binary checks | 1–5 scalar scores (unstable across judge runs) |
| Refusal scoring | Deterministic server-metadata assertion | LLM-judged refusal (nondeterministic where determinism is available) |
| Regression bar | Zero-tolerance on exact metrics; measured noise margin on judged | Fixed universal margin (either too loose or too tight) |
| Baseline updates | Explicit reviewed commits | Auto-update on green (silently ratchets standards down) |
| Threshold source | Calibrated from own score distributions, committed artifacts | Borrowed literature value |
