import { getSyncSummary } from "../lib/db/queries";
import { formatRelativeTime } from "../lib/time";
import { env } from "../lib/env";
import { Header } from "./ui/Header";
import { Ask } from "./ui/Ask";

/**
 * The landing (ui-ux-spec §2-4, §10). Server component: it reads the sync summary
 * (RAG-21, never hardcoded) and passes the corpus numbers + freshness down. Dynamic
 * so the eyebrow reflects the latest sync and the build never touches the DB.
 */
export const dynamic = "force-dynamic";

export default async function Home() {
  const s = await getSyncSummary();
  const relative = s.syncedAt
    ? formatRelativeTime(s.syncedAt)
    : "not yet synced";
  return (
    <>
      <Header />
      <Ask
        summary={{
          relative,
          pages: s.pages,
          chunks: s.chunks,
          updated: s.updated,
        }}
        corpus={{ pages: s.pages, chunks: s.chunks }}
        portfolioUrl={env.PORTFOLIO_URL}
      />
    </>
  );
}
