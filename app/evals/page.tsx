import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";

import { getSyncSummary } from "../../lib/db/queries";
import { formatRelativeTime } from "../../lib/time";
import { env } from "../../lib/env";
import { Eyebrow } from "../ui/Eyebrow";
import chrome from "../ui/Ask.module.css";
import skip from "../skip-link.module.css";
import styles from "./evals.module.css";

/**
 * /evals - the scoreboard (ui-ux-spec §12, EVAL-16/UX-14). Renders evals/latest.json
 * verbatim, including regressions; nothing is computed at request time. Same chrome
 * as the app minus the history/retrieval controls. Dynamic only for the eyebrow's
 * freshness; the scores come straight off the committed artifact.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Eval scores" };

interface Verdict {
  grounded: boolean;
  citations_valid: boolean;
  complete: boolean;
  no_fabrication: boolean;
}
interface Artifact {
  run_id: string;
  commit: string;
  config_snapshot: {
    k: number;
    threshold: { value: number | null; calibratedAt?: string };
    embedding_model: string;
    generation_model: string;
    judge_model?: string;
  };
  retrieval: {
    hit_at_5: number;
    mrr: number;
    per_question: { id: string; category: string; question: string }[];
  };
  answers?: {
    pass_rate: number;
    noise_margin: number;
    checks: Record<string, number>;
    count: number;
    per_question: {
      id: string;
      passed: boolean;
      server_refused: boolean;
      verdict: Verdict | null;
    }[];
  };
  refusals?: {
    passed: number;
    total: number;
    per_question: { id: string; passed: boolean; via: string }[];
  };
  boundary?: {
    per_question: { id: string; expected?: string; passed: boolean }[];
  };
  baseline_delta?: {
    retrieval_hit_at_5: number;
    retrieval_mrr: number;
    answers_pass_rate: number | null;
  };
}

function loadLatest(): Artifact {
  return JSON.parse(
    readFileSync(path.join(process.cwd(), "evals", "latest.json"), "utf8"),
  ) as Artifact;
}

const signed = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(4)}`;
const CHECKS = [
  "grounded",
  "citations_valid",
  "complete",
  "no_fabrication",
] as const;

export default async function EvalsPage() {
  const a = loadLatest();
  const summary = await getSyncSummary();
  const relative = summary.syncedAt
    ? formatRelativeTime(summary.syncedAt)
    : "not yet synced";
  const date = a.run_id.slice(0, 10);
  const qById = new Map(
    a.retrieval.per_question.map((q) => [q.id, q.question]),
  );

  return (
    <>
      <a href="#evals-main" className={skip.skipLink}>
        Skip to eval scores
      </a>
      <header className={chrome.top}>
        <div className={chrome.topInner}>
          <Link
            href="/"
            className={chrome.wordmark}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            Ask the Claude Docs
          </Link>
          <nav className={chrome.nav} aria-label="Site">
            <span className={styles.here}>eval scores</span>
            <a
              href="https://github.com/BrandonChurch93/Ask-the-Claude-Docs"
              target="_blank"
              rel="noopener"
              className={chrome.navLink}
            >
              GitHub
            </a>
          </nav>
        </div>
      </header>

      <div className={chrome.shell}>
        <main className={chrome.trail} id="evals-main" tabIndex={-1}>
          <Eyebrow
            summary={{
              relative,
              pages: summary.pages,
              chunks: summary.chunks,
              updated: summary.updated,
            }}
          />

          <h1 className={styles.title}>Eval scores</h1>
          <p className={styles.meta}>
            run {a.run_id} · commit {a.commit.slice(0, 7)} · {date}
          </p>

          <div className={styles.figures}>
            <Figure
              label="retrieval hit@5"
              value={a.retrieval.hit_at_5.toFixed(2)}
            />
            <Figure label="MRR" value={a.retrieval.mrr.toFixed(4)} />
            {a.answers && (
              <Figure
                label="answer pass rate"
                value={a.answers.pass_rate.toFixed(2)}
                note={`± ${a.answers.noise_margin.toFixed(2)}, measured`}
              />
            )}
            {a.refusals && (
              <Figure
                label="refusals"
                value={`${a.refusals.passed}/${a.refusals.total}`}
                note="correctly declined"
              />
            )}
          </div>

          {a.answers && (
            <section className={styles.section}>
              <h2 className={styles.h2}>Answerable</h2>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">question</th>
                    <th scope="col">grounded</th>
                    <th scope="col">cited</th>
                    <th scope="col">complete</th>
                    <th scope="col">no fab</th>
                  </tr>
                </thead>
                <tbody>
                  {a.answers.per_question.map((q) => (
                    <tr key={q.id}>
                      <td className={styles.q}>{qById.get(q.id) ?? q.id}</td>
                      {CHECKS.map((c) => (
                        <td
                          key={c}
                          className={
                            q.verdict?.[c] ? styles.markPass : styles.markFail
                          }
                        >
                          {q.verdict?.[c] ? "✓" : "✗"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {a.refusals && (
            <section className={styles.section}>
              <h2 className={styles.h2}>Refusals</h2>
              <ul className={styles.list}>
                {a.refusals.per_question.map((r) => (
                  <li key={r.id} className={styles.row}>
                    <span>{r.id}</span>
                    <span className={styles.pass}>
                      {r.passed ? "correctly declined" : "did not decline"} ·{" "}
                      {r.via}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {a.boundary && (
            <section className={styles.section}>
              <h2 className={styles.h2}>Boundary</h2>
              <ul className={styles.list}>
                {a.boundary.per_question.map((b) => (
                  <li key={b.id} className={styles.row}>
                    <span className={styles.q}>{qById.get(b.id) ?? b.id}</span>
                    <span className={styles.pass}>
                      expected {b.expected} · {b.passed ? "ok" : "FAIL"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={styles.section}>
            <h2 className={styles.h2}>Config</h2>
            <p className={styles.config}>
              k {a.config_snapshot.k} · threshold{" "}
              {a.config_snapshot.threshold.value}
              {a.config_snapshot.threshold.calibratedAt
                ? ` (calibrated ${a.config_snapshot.threshold.calibratedAt})`
                : ""}{" "}
              · {a.config_snapshot.generation_model}
              {a.config_snapshot.judge_model
                ? ` · judge ${a.config_snapshot.judge_model}`
                : ""}{" "}
              · {a.config_snapshot.embedding_model}
            </p>
          </section>

          {a.baseline_delta && (
            <p className={styles.delta}>
              vs baseline: retrieval hit@5{" "}
              {signed(a.baseline_delta.retrieval_hit_at_5)}, MRR{" "}
              {signed(a.baseline_delta.retrieval_mrr)}
              {a.baseline_delta.answers_pass_rate !== null
                ? `, answers ${signed(a.baseline_delta.answers_pass_rate)}`
                : ""}
            </p>
          )}

          <footer className={chrome.foot}>
            <span>
              Built by{" "}
              <a href={env.PORTFOLIO_URL} target="_blank" rel="noopener">
                Brandon Church
              </a>{" "}
              · AI Product Engineer
            </span>
          </footer>
        </main>
      </div>
    </>
  );
}

function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className={styles.figure}>
      <div className={styles.figValue}>{value}</div>
      <div className={styles.figLabel}>{label}</div>
      {note && <div className={styles.figNote}>{note}</div>}
    </div>
  );
}
