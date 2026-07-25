import { getSyncSummary, getCoverage } from "../lib/db/queries";
import { pickCoverageChips } from "../lib/coverage";
import { env } from "../lib/env";
import { Ask } from "./ui/Ask";

/**
 * The landing (ui-ux-spec §2-4, §10). Server component: it reads the sync summary
 * (RAG-21, never hardcoded) and passes the corpus numbers + the sync timestamp
 * down. Statically rendered with ISR (PERF-02): revalidate=900 keeps the corpus
 * numbers fresh within 15 min (the sync is daily, so that staleness is invisible),
 * while the eyebrow's "synced Nh ago" is computed client-side from `syncedAt` so it
 * stays accurate against the live clock independent of revalidation.
 */
export const revalidate = 900;

export default async function Home() {
  const [s, coverage] = await Promise.all([getSyncSummary(), getCoverage()]);
  const chips = pickCoverageChips(coverage.map((c) => c.title));
  return (
    <>
      <Ask
        summary={{
          syncedAt: s.syncedAt ? s.syncedAt.getTime() : null,
          pages: s.pages,
          chunks: s.chunks,
          updated: s.updated,
        }}
        corpus={{ pages: s.pages, chunks: s.chunks }}
        chips={chips}
        portfolioUrl={env.PORTFOLIO_URL}
      />
    </>
  );
}
