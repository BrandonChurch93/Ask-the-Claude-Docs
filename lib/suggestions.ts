/**
 * Landing suggestions (ui-ux-spec §4, UX-04): three answerable questions drawn
 * from the eval set's strongest performers, then the off-corpus demonstration
 * last, labeled. These are curated build-time strings (not corpus facts), taken
 * verbatim from evals/testset.json so the landing showcases exactly what the
 * harness proves the system answers - and one it correctly declines.
 */
export interface Suggestion {
  question: string;
  /** True for the final off-corpus entry (a testset `refusal`); tagged in the UI. */
  offCorpus?: boolean;
}

export const SUGGESTIONS: readonly Suggestion[] = [
  {
    question:
      "How do I give Claude a set of project instructions it picks up automatically every session?",
  },
  {
    question:
      "How can I make my code formatter run automatically every time Claude edits a file?",
  },
  {
    question:
      "How do I set up my own custom subagent for a specific kind of task?",
  },
  {
    question:
      "Can I fine-tune Claude on my own codebase so it understands my code better?",
    offCorpus: true,
  },
];
