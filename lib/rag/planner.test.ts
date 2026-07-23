import { describe, it, expect } from "vitest";
import { diffPages, diffChunks } from "./planner";

describe("diffPages (RAG §9 steps 1-2)", () => {
  it("categorizes new / changed / unchanged / removed", () => {
    const diff = diffPages(
      [
        { pagePath: "a", pageHash: "h1" }, // unchanged
        { pagePath: "b", pageHash: "h2new" }, // changed
        { pagePath: "c", pageHash: "h3" }, // new
      ],
      [
        { pagePath: "a", pageHash: "h1" },
        { pagePath: "b", pageHash: "h2old" },
        { pagePath: "d", pageHash: "h4" }, // removed
      ],
    );
    expect(diff.new).toEqual(["c"]);
    expect(diff.changed).toEqual(["b"]);
    expect(diff.unchanged).toEqual(["a"]);
    expect(diff.removed).toEqual(["d"]);
  });
});

describe("diffChunks (RAG §9 step 3)", () => {
  it("embeds new + changed, deletes vanished, skips unchanged", () => {
    const d = diffChunks(
      [
        { chunkId: "p#x", contentHash: "cx" }, // unchanged
        { chunkId: "p#y", contentHash: "cy2" }, // changed
        { chunkId: "p#z", contentHash: "cz" }, // new
      ],
      [
        { chunkId: "p#x", contentHash: "cx" },
        { chunkId: "p#y", contentHash: "cy1" },
        { chunkId: "p#gone", contentHash: "cg" },
      ],
    );
    expect(d.toEmbed).toEqual([
      { chunkId: "p#y", reason: "changed" },
      { chunkId: "p#z", reason: "new" },
    ]);
    expect(d.toDelete).toEqual(["p#gone"]);
    expect(d.unchanged).toBe(1);
  });

  it("unchanged corpus produces nothing to embed (RAG-09/20)", () => {
    const chunks = [
      { chunkId: "p#a", contentHash: "h1" },
      { chunkId: "p#b", contentHash: "h2" },
    ];
    const d = diffChunks(chunks, chunks);
    expect(d.toEmbed).toEqual([]);
    expect(d.toDelete).toEqual([]);
    expect(d.unchanged).toBe(2);
  });
});
