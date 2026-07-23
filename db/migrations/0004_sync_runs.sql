-- 0004: sync log (rag-design.md §9.5, RAG-22). One row per ingestion/re-sync
-- run: what was fetched/skipped (with reasons per RAG-02), what changed, how
-- many embedding calls were made (the ingestion-side spend record), and how
-- long it took. This is the only operational table; the runtime spend cap
-- counter lives in Upstash (security.md §4), and no user data is stored
-- (security.md §6). Coverage chips + freshness derive from documents/sync_runs,
-- never hardcoded (RAG-21).
create table if not exists sync_runs (
  id              bigint generated always as identity primary key,
  started_at      timestamptz not null,
  finished_at     timestamptz,
  duration_ms     integer,
  status          text not null,                       -- 'success' | 'partial' | 'failed'
  pages_fetched   integer not null default 0,
  pages_skipped   jsonb not null default '[]'::jsonb,  -- [{ "page_path": ..., "reason": ... }] (RAG-02)
  chunks_added    integer not null default 0,
  chunks_updated  integer not null default 0,
  chunks_deleted  integer not null default 0,
  embedding_calls integer not null default 0,          -- ingestion-side spend accounting
  error           text
);
