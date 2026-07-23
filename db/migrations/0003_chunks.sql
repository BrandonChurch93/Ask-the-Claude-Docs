-- 0003: chunks table + HNSW index (rag-design.md §4). `chunk_id` is the
-- deterministic identity from §3 (RAG-08); `content_hash` is the separate
-- change-detection key. `embedding_model` guards against mixed-model tables:
-- retrieval filters on it (RAG-10). HNSW params are frozen (RAG §4); do not
-- tune without an eval-run justification.
create table if not exists chunks (
  chunk_id        text primary key,          -- deterministic, §3
  page_path       text not null references documents (page_path) on delete cascade,
  source          text not null,
  breadcrumb      text not null,             -- display form
  heading_anchor  text not null,             -- deep-linking: url + '#' + anchor
  content         text not null,             -- embedded text incl. breadcrumb prefix
  content_hash    text not null,
  token_count     int not null,
  embedding       vector(1536) not null,
  embedding_model text not null,             -- 'text-embedding-3-small'
  updated_at      timestamptz not null
);

create index if not exists chunks_embedding_hnsw on chunks
  using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);
