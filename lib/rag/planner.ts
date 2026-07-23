/**
 * Hash-diff sync planner (rag-design.md §9). Pure functions so the whole diff
 * is fixture-testable, including the idempotency invariant (RAG-09/20:
 * unchanged input produces nothing to embed).
 *
 * Page identity is page_path + page_hash (raw-markdown SHA-256); chunk identity
 * is the deterministic chunk_id, with content_hash detecting word changes.
 */

export interface PageState {
  pagePath: string;
  pageHash: string;
}

export interface ChunkState {
  chunkId: string;
  contentHash: string;
}

export interface PageDiff {
  new: string[];
  changed: string[];
  unchanged: string[];
  removed: string[];
}

/** Diff the freshly fetched page list against the DB (RAG §9 steps 1-2). */
export function diffPages(fetched: PageState[], db: PageState[]): PageDiff {
  const dbHash = new Map(db.map((p) => [p.pagePath, p.pageHash]));
  const fetchedPaths = new Set(fetched.map((p) => p.pagePath));
  const diff: PageDiff = { new: [], changed: [], unchanged: [], removed: [] };

  for (const page of fetched) {
    const prior = dbHash.get(page.pagePath);
    if (prior === undefined) diff.new.push(page.pagePath);
    else if (prior !== page.pageHash) diff.changed.push(page.pagePath);
    else diff.unchanged.push(page.pagePath);
  }
  for (const page of db) {
    if (!fetchedPaths.has(page.pagePath)) diff.removed.push(page.pagePath);
  }
  return diff;
}

export interface ChunkDiff {
  toEmbed: { chunkId: string; reason: "new" | "changed" }[];
  toDelete: string[];
  unchanged: number;
}

/**
 * Diff a page's freshly computed chunks against its DB chunks (RAG §9 step 3):
 * new id -> embed+insert; existing id, changed hash -> embed+update; existing
 * id, same hash -> touch nothing (no embedding call); DB id absent from the
 * re-chunk -> delete.
 */
export function diffChunks(current: ChunkState[], db: ChunkState[]): ChunkDiff {
  const dbHash = new Map(db.map((c) => [c.chunkId, c.contentHash]));
  const currentIds = new Set(current.map((c) => c.chunkId));
  const toEmbed: { chunkId: string; reason: "new" | "changed" }[] = [];
  let unchanged = 0;

  for (const chunk of current) {
    const prior = dbHash.get(chunk.chunkId);
    if (prior === undefined)
      toEmbed.push({ chunkId: chunk.chunkId, reason: "new" });
    else if (prior !== chunk.contentHash)
      toEmbed.push({ chunkId: chunk.chunkId, reason: "changed" });
    else unchanged++;
  }
  const toDelete = db
    .filter((c) => !currentIds.has(c.chunkId))
    .map((c) => c.chunkId);
  return { toEmbed, toDelete, unchanged };
}
