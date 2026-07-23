# success-criteria.md

The definition of done for Ask the Claude Docs v1. Two halves: the acceptance table (measurable, instrument-verified) and the golden-path walkthroughs (scripted human QA for what instruments cannot see). The build is complete when every row and every walkthrough passes; `build-checklist.md` Phase 8 executes this document.
Audience: the Claude Code session and Brandon. Status: **frozen**.

Criterion IDs use the prefix `AC-`. This document cites thresholds and rules owned elsewhere; it never redefines them.

## 1. Acceptance table

Two-tier quality bars where measurement exists: an **absolute floor** (minimum credible, set now) and the **committed baseline** (the real bar, recorded in `evals/baseline.json` during Phase 4). Passing means clearing both.

| ID | Criterion | Instrument | Bar | Source |
|---|---|---|---|---|
| AC-01 | Retrieval hit@5 | eval harness | ≥ 0.85 floor AND ≥ baseline | EVAL §2, §5 |
| AC-02 | Retrieval MRR | eval harness | ≥ 0.60 floor AND ≥ baseline | EVAL §2 |
| AC-03 | Judged answer pass rate | eval harness, noise-margined | ≥ 0.80 floor AND ≥ (baseline − M) | EVAL §3–5 |
| AC-04 | Refusal questions | server metadata OR decline-sentinel prefix (two-tier, deterministic) | 5/5 correctly declined | EVAL §3, RAG-13 |
| AC-05 | Boundary questions | eval harness | each matches its recorded expectation | EVAL §1 |
| AC-06 | Threshold calibrated | config inspection | `T` carries `calibrated_at` + run ID; distributions committed | EVAL §7, RAG-15 |
| AC-07 | Zero uncited factual claims in judged answers | `citations-valid` + `grounded` checks | zero failures in the acceptance run | EVAL §3 |
| AC-08 | Idempotent sync | fixture test + live re-run | zero embedding calls, zero row changes on unchanged corpus | RAG-09/20 |
| AC-09 | Live staleness handling | manual: real docs change → sync → UI | changed content retrievable; freshness + coverage update | RAG §9, UX-03 |
| AC-10 | Performance budgets | Lighthouse CI, both routes | every PERF §1 metric green | PERF-01 |
| AC-11 | Payload budgets | build-manifest assertion | every PERF §2 number green | PERF-03/04/05 |
| AC-12 | Query-path latency | server timings, observed | PERF §3 segments within budget on 10 live queries | PERF-06/07 |
| AC-13 | Accessibility, automated | axe via Playwright | zero violations, every surface, every state incl. §8 states | A11Y-01 |
| AC-14 | Accessibility, manual | the A11Y §8 pass | all five checks recorded as performed and passing | A11Y-20 |
| AC-15 | Reduced motion | walkthrough W3 variant | identical information and function | A11Y-19, DS-12 |
| AC-16 | Security assertions | CI greps + integration tests | SEC-01/02/06 greps clean; SEC-12 headers verified; SEC-09/10 behaviors tested incl. cap fail-closed | SEC §1–5 |
| AC-17 | No user-question persistence | code + log inspection | SEC-14 verified in code review and live logs | SEC-14 |
| AC-18 | Design conformance | token grep + v10 diff review | only design-system colors present; DS-14 em-dash grep zero; Brandon signs the diff | DS-02/05/14, UX-01 |
| AC-19 | All rule-ID tests exist | test-name audit | every testable rule cited by the checklist has a named test | ENG-18 |
| AC-20 | Deploy healthy | production smoke | / and /evals load; live ask succeeds; refusal succeeds; receipts show real values | UX §5–7 |
| AC-21 | /evals truthfulness | compare page to committed JSON | page matches `evals/latest.json` exactly | EVAL-16, UX-14 |
| AC-22 | Spend defenses live | production test | per-IP 429 reachable; cap counter accumulating real cost | SEC-09/10/11 |
| AC-23 | Required inputs supplied | inspection | `{PORTFOLIO_URL}` real; reference mock present at `.claude/design/layout-mock-v10.html` | UX-13, DS-01 |

## 2. Golden-path walkthroughs

Executed by Brandon (with the build session assisting) against the production deploy in Phase 8, and in local form at the Phase 5 gate. Any failure blocks acceptance. Each ends with one question: did anything surprise you? Surprises are findings.

- **W1 · The cited answer.** Cold load. Read the page top to bottom; nothing unexplained. Ask the hooks suggestion. Watch choreography play, paced to real events. Answer streams; markers land. Hover a marker: its row highlights. Click it: module opens, scrolls, flashes. Expand every card; every "read at code.claude.com ↗" opens a new tab landing on the exact heading. Receipt values are real (cost matches the usage math). Pass = every beat as specified in UX §5–6.
- **W2 · The honest refusal.** Ask the off-corpus suggestion. Decline renders calm: rule, near-misses with scores, coverage chips, receipt showing embedding-only cost, visibly faster than an answer. Click a chip; it asks. Pass = UX §7 exactly, no alarm styling anywhere.
- **W3 · Keyboard only.** Unplug the mouse. Skip link first. Complete an entire session: ask, traverse markers, open sources, follow a link, open history, jump to a turn, toggle the rail, reach the footer. Every focus visible, order sane, nothing trapped. Repeat once with reduced motion enabled (AC-15). Pass = A11Y §3 paths complete.
- **W4 · Screen reader.** VoiceOver, Safari. Ask a question. Announcements match the A11Y §4 script verbatim in interpunct form; the token stream itself is silent; one announcement per terminal state. Traverse an answer: markers read their labels; the receipt reads as prose. Pass = the §4 pattern, no announcement storm.
- **W5 · The bad network.** Ask, then kill the connection mid-stream. Partial answer preserved; interruption copy per UX §8; retry works. Pass = PERF-09 behavior with the specified copy.
- **W6 · The limits.** Hammer requests past the per-IP limit: the 429 state renders with its copy and recovery time. Verify the cap counter moved by the real cost of the session's queries. Pass = SEC §4 as product states, not raw errors.
- **W7 · The scoreboard.** Visit /evals from the header. Numbers match `evals/latest.json` byte-for-byte, refusals shown as "correctly declined", config snapshot present, baseline delta honest. Pass = UX §12.

## 3. Acceptance protocol

1. Phase 8 runs the full eval suite once; its artifact is the acceptance run for AC-01..07 and AC-21.
2. Instrument criteria (AC-10..13, 16, 19) are read from the final green CI run.
3. Manual criteria (AC-08 live half, 09, 14, 15, 17, 18, 20, 22, 23) and W1..W7 are executed and recorded in the checklist's Phase 8 log with date and outcome.
4. Any failure: fix, re-run the affected instruments, re-execute only the affected walkthroughs.
5. When the table and walkthroughs are green, v1 is done and is tagged. Claims about the project defer to `honesty-boundaries.md` from that moment on.
