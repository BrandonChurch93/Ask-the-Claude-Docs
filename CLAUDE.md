# CLAUDE.md — Operating contract for Ask the Claude Docs

You are building "Ask the Claude Docs": a RAG chatbot over the Claude Code documentation with cited answers, honest server-side refusals, and a CI eval harness. The complete specification lives in `.claude/docs/` — eleven reference documents plus `build-checklist.md`, which you execute step by step. The specs are frozen; your job is faithful execution, not re-design.

## The documentation pack

All paths are exact; `reads:` lines in the checklist cite them.

| Doc | Governs |
|---|---|
| `.claude/docs/architecture.md` | System design + the complete decision log (the "why") |
| `.claude/docs/rag-design.md` | Ingestion, chunking, identity, schema, retrieval, threshold/refusal, SSE protocol, re-sync (RAG-rules) |
| `.claude/docs/eval-harness.md` | Test set, metrics, judge, noise margins, regression policy, calibration, /evals contract (EVAL-rules) |
| `.claude/docs/engineering-standards.md` | Stack, dependency policy, structure, TS/Next/React conventions, testing, CI (ENG-rules) |
| `.claude/docs/performance.md` | Numeric budgets + instruments, streaming architecture, motion perf (PERF-rules) |
| `.claude/docs/accessibility.md` | WCAG 2.2 AA hard rules incl. the streaming announcement pattern (A11Y-rules) |
| `.claude/docs/security.md` | Secrets, validation, injection posture, rate limit + spend cap, headers (SEC-rules) |
| `.claude/docs/design-system.md` | Tokens, type, spacing, motion — the approved design as values |
| `.claude/docs/ui-ux-spec.md` | Every surface, every state, choreography, copy strings |
| `.claude/docs/honesty-boundaries.md` | Portfolio-vs-production limits; constrains claims in README/UI copy |
| `.claude/docs/success-criteria.md` | Acceptance table + golden-path walkthroughs; the definition of done |
| `.claude/docs/build-checklist.md` | The master execution document |

## Decision authority — three tiers

**Tier 1 — decide silently.** Implementation details the docs already govern: naming, file placement, internal structure per `engineering-standards.md`. No ceremony.

**Tier 2 — decide and log.** Minor choices the docs neither dictate nor conflict with. Record in the step's handoff block: the choice, one line of rationale. Brandon can veto at review.

**Tier 3 — stop and ask Brandon.** Required for: anything touching a decision in `architecture.md`'s log · database schema changes · any new dependency (`ENG-02`) · any API/SSE contract change · any design token or visual deviation from `design-system.md` / `ui-ux-spec.md` · scope changes in either direction · relaxing/skipping any rule ID or test · adding tools or client-controllable parameters to the generation call (`SEC-08`) · and any case where the docs are silent or contradictory on something that matters.

**The governing sentence: a missing decision is a documentation gap, not an invitation to improvise — stop, name the gap, propose options if useful, and wait.** The docs get amended by Brandon; then the build resumes. This is how the docs stay the single source of truth.

## Always-rules (survive any session length)

1. Never modify anything in `.claude/docs/` or this file unless Brandon explicitly instructs it, with one standing exception: in `build-checklist.md` you MUST update step status markers and append build-log lines as steps complete. Status and log only; never edit a step's content, reads, audits, or ordering.
2. Never mark a checklist step complete with a failing check, skipped audit, or red CI. Never use `continue-on-error`.
3. Execute every step's `reads:` list before implementing — even if the docs feel fresh in context. Re-reading is the mechanism, not a formality.
4. Every step ends with the self-audit against its cited rule IDs; remediate until green **before** presenting to Brandon.
5. Handoff format, every step: **Done:** what was implemented · **Decisions (Tier 2):** any, with rationale · **Review:** exactly what Brandon should look at · **Link/path:** URL or file path(s) · **Checks:** audit results, test/eval output.
6. Commits reference their step ID (`ENG-20`). Small, per-step commits.
7. All pipeline/product parameters come from `lib/config.ts` (`RAG-19`); if you're about to inline a number, stop.
8. Tests never call paid APIs; the eval harness is the only sanctioned spender (`ENG-17`).
9. Secrets never in code, logs, client bundle, or chat output (`SEC-01/02`).
10. When any instruction here conflicts with something you'd prefer, this file wins; when this file conflicts with Brandon's live instruction, Brandon wins.

## Workflow reminders

- The checklist is ordered; do not reorder, parallelize across phases, or look ahead past the current phase gate without instruction.
- Phase gates run instruments (full test suite, Lighthouse CI, axe, eval suite) — treat a gate as a step whose audit is entirely mechanical.
- Any eval-metric regression beyond policy (`EVAL-11`) is an automatic audit failure for the step that caused it.
- If a session starts mid-build: read this file, then `build-checklist.md` to locate current position (last completed step per git history), then the current step's `reads:` list. Do not re-do completed steps.
