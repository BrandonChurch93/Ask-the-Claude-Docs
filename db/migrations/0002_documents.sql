-- 0002: documents table (rag-design.md §4). One row per fetched page; raw
-- markdown stored before chunking so chunking can re-run without re-fetching
-- (RAG-03). Multi-corpus from day one via `source` (RAG §1); v1 uses 'claude-code'.
create table if not exists documents (
  page_path    text primary key,          -- e.g. 'hooks'
  source       text not null,             -- 'claude-code'
  title        text not null,
  url          text not null,             -- live docs URL
  raw_markdown text not null,
  page_hash    text not null,             -- sha256 of raw_markdown
  synced_at    timestamptz not null       -- max(synced_at) feeds the UI freshness indicator
);
