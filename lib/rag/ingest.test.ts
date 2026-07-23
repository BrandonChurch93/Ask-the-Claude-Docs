import { describe, it, expect, vi } from "vitest";
import { runIngest, type IngestDeps } from "./ingest";
import { chunkPage } from "./chunker";
import { pageHash, type FetchedPage } from "./corpus";
import type { SyncRunRecord } from "../db/queries";

const SRC = "claude-code";

function page(pagePath: string, title: string, body: string): FetchedPage {
  const rawMarkdown = `# ${title}\n\n## Section\n\n${body}`;
  return {
    pagePath,
    source: SRC,
    title,
    url: `https://code.claude.com/docs/en/${pagePath}.md`,
    rawMarkdown,
    pageHash: pageHash(rawMarkdown),
  };
}

function dbStateFor(pages: FetchedPage[]) {
  const dbPages = pages.map((p) => ({
    pagePath: p.pagePath,
    pageHash: p.pageHash,
  }));
  const dbChunks = pages.flatMap((p) =>
    chunkPage({
      source: SRC,
      pagePath: p.pagePath,
      title: p.title,
      url: p.url,
      rawMarkdown: p.rawMarkdown,
    }).map((c) => ({
      chunkId: c.chunkId,
      contentHash: c.contentHash,
      pagePath: p.pagePath,
    })),
  );
  return { dbPages, dbChunks };
}

function makeDeps(state: {
  fetched: FetchedPage[];
  dbPages: { pagePath: string; pageHash: string }[];
  dbChunks: { chunkId: string; contentHash: string; pagePath: string }[];
}) {
  const mocks = {
    embed: vi.fn(async (texts: string[]) => texts.map(() => [0.1])),
    upsertDocument: vi.fn(async () => {}),
    upsertChunk: vi.fn(async () => {}),
    deleteChunks: vi.fn(async () => {}),
    deletePages: vi.fn(async () => {}),
    insertSyncRun: vi.fn(async (_run: SyncRunRecord) => {}),
  };
  const deps: IngestDeps = {
    fetchCorpus: async () => ({ fetched: state.fetched, skipped: [] }),
    getPageStates: async () => state.dbPages,
    getChunkStates: async () => state.dbChunks,
    ...mocks,
  };
  return { deps, mocks };
}

describe("runIngest (RAG §9)", () => {
  it("unchanged corpus makes zero embedding calls (RAG-20)", async () => {
    const pages = [
      page("a", "A", "First body about hooks."),
      page("b", "B", "Second body about tools."),
    ];
    const { dbPages, dbChunks } = dbStateFor(pages);
    const { deps, mocks } = makeDeps({ fetched: pages, dbPages, dbChunks });

    const r = await runIngest(deps, { dryRun: false, startedAt: new Date(0) });

    expect(mocks.embed).not.toHaveBeenCalled();
    expect(r.chunksToEmbed).toEqual([]);
    expect(r.embeddingCalls).toBe(0);
    expect(mocks.insertSyncRun).toHaveBeenCalledOnce(); // still logs the run (RAG-22)
  });

  it("plans new / changed / unchanged / deleted from a doctored fixture", async () => {
    const keep = page("keep", "Keep", "This page is unchanged.");
    const modOld = page("mod", "Mod", "Original text of the mod page.");
    const gone = page("gone", "Gone", "This page was removed upstream.");
    // DB reflects the previous sync.
    const { dbPages, dbChunks } = dbStateFor([keep, modOld, gone]);
    // This sync: keep unchanged, mod changed, gone removed, added is new.
    const modNew = page(
      "mod",
      "Mod",
      "Rewritten text of the mod page, different words.",
    );
    const added = page("added", "Added", "A brand new page.");
    const { deps } = makeDeps({
      fetched: [keep, modNew, added],
      dbPages,
      dbChunks,
    });

    const r = await runIngest(deps, { dryRun: true, startedAt: new Date(0) });

    expect(r.pagesNew).toBe(1);
    expect(r.pagesChanged).toBe(1);
    expect(r.pagesUnchanged).toBe(1);
    expect(r.pagesRemoved).toBe(1);
    // "added" (new) and "mod" (changed) contribute chunks to embed; "keep" does not.
    expect(r.chunksToEmbed.length).toBeGreaterThan(0);
    expect(
      r.chunksToEmbed.every((c) => !c.chunkId.startsWith("claude-code/keep")),
    ).toBe(true);
    expect(
      r.chunksToEmbed.some(
        (c) => c.chunkId.startsWith("claude-code/added") && c.reason === "new",
      ),
    ).toBe(true);
    expect(
      r.chunksToEmbed.some(
        (c) =>
          c.chunkId.startsWith("claude-code/mod") && c.reason === "changed",
      ),
    ).toBe(true);
  });

  it("dry-run writes nothing and calls no embedding", async () => {
    const pages = [page("a", "A", "New page body.")];
    const { deps, mocks } = makeDeps({
      fetched: pages,
      dbPages: [],
      dbChunks: [],
    });

    const r = await runIngest(deps, { dryRun: true, startedAt: new Date(0) });

    expect(r.dryRun).toBe(true);
    expect(r.chunksToEmbed.length).toBeGreaterThan(0); // it WOULD embed
    expect(mocks.embed).not.toHaveBeenCalled();
    expect(mocks.upsertChunk).not.toHaveBeenCalled();
    expect(mocks.insertSyncRun).not.toHaveBeenCalled();
  });

  it("records a failed run and rethrows on error (RAG-22 loud failure)", async () => {
    const pages = [page("a", "A", "New page body.")];
    const { deps, mocks } = makeDeps({
      fetched: pages,
      dbPages: [],
      dbChunks: [],
    });
    mocks.embed.mockImplementation(async () => {
      throw new Error("boom");
    });

    await expect(
      runIngest(deps, { dryRun: false, startedAt: new Date(0) }),
    ).rejects.toThrow("boom");

    expect(mocks.insertSyncRun).toHaveBeenCalledOnce();
    const logged = mocks.insertSyncRun.mock.calls[0]?.[0];
    expect(logged?.status).toBe("failed");
    expect(logged?.error).toContain("boom");
  });
});
