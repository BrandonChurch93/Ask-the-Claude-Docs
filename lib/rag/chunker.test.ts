import { describe, it, expect } from "vitest";
import { chunkPage, type ChunkInput } from "./chunker";
import { config } from "../config";

const BASE = {
  source: "claude-code",
  pagePath: "hooks",
  title: "Hooks reference",
  url: "https://code.claude.com/docs/en/hooks.md",
};
const input = (rawMarkdown: string): ChunkInput => ({ ...BASE, rawMarkdown });

// Roughly `n` tokens of prose (one word ~= one cl100k token).
function paragraph(n: number): string {
  const words = [
    "alpha",
    "bravo",
    "charlie",
    "delta",
    "echo",
    "foxtrot",
    "golf",
    "hotel",
  ];
  return Array.from({ length: n }, (_, i) => words[i % words.length]).join(" ");
}

describe("RAG-05: breadcrumb prefix", () => {
  it("every chunk's embedded text begins with its breadcrumb line", () => {
    const md = `# Hooks reference\n\n## PreToolUse\n\n${paragraph(200)}\n\n## PostToolUse\n\n${paragraph(200)}`;
    const chunks = chunkPage(input(md));
    expect(chunks.length).toBeGreaterThan(0);
    for (const c of chunks) {
      expect(
        c.breadcrumb.startsWith("Claude Code docs › Hooks reference"),
      ).toBe(true);
      expect(c.content.startsWith(c.breadcrumb)).toBe(true);
      expect(c.content.startsWith(`${c.breadcrumb}\n\n`)).toBe(true);
    }
  });
});

describe("RAG-08: deterministic structural chunk_id", () => {
  const md = `# Hooks reference\n\n## PreToolUse\n\n${paragraph(200)}\n\n## PostToolUse\n\n### Examples\n\n${paragraph(200)}`;

  it("derives ids from source + page path + heading slug path", () => {
    const ids = chunkPage(input(md)).map((c) => c.chunkId);
    expect(ids).toContain("claude-code/hooks#pretooluse");
    expect(ids).toContain("claude-code/hooks#posttooluse/examples");
    for (const id of ids) expect(id).not.toMatch(/[0-9a-f]{32}/); // no uuid / content-hash identity
  });

  it("is identical across runs", () => {
    const a = chunkPage(input(md)).map((c) => c.chunkId);
    const b = chunkPage(input(md)).map((c) => c.chunkId);
    expect(a).toEqual(b);
  });
});

describe("RAG-06: atomic code fences and tables", () => {
  it("keeps a fenced code block whole and ignores ## inside it", () => {
    const code =
      "```js\n" +
      Array.from(
        { length: 300 },
        (_, i) => `const x${i} = ${i}; // ## not a heading`,
      ).join("\n") +
      "\n```";
    const chunks = chunkPage(input(`# Page\n\n## Section\n\n${code}`));
    const withCode = chunks.filter((c) => c.content.includes("```js"));
    expect(withCode).toHaveLength(1);
    expect(withCode[0]!.content).toContain("const x299");
    // the ## lines inside the fence created no extra sections
    for (const c of chunks)
      expect(c.breadcrumb).toBe("Claude Code docs › Hooks reference › Section");
  });

  it("keeps a table in a single chunk", () => {
    const rows = Array.from(
      { length: 60 },
      (_, i) => `| cell${i}a | cell${i}b |`,
    ).join("\n");
    const chunks = chunkPage(
      input(`# Page\n\n## Data\n\n| A | B |\n| --- | --- |\n${rows}`),
    );
    const withTable = chunks.filter((c) => c.content.includes("| cell0a |"));
    expect(withTable).toHaveLength(1);
    expect(withTable[0]!.content).toContain("| cell59a |");
  });
});

describe("RAG-04: size bounds", () => {
  it("splits an over-max section into numbered parts, each within the max", () => {
    const paras = Array.from({ length: 6 }, () => paragraph(300)).join("\n\n"); // ~1800 tokens
    const chunks = chunkPage(input(`# Page\n\n## Big\n\n${paras}`));
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks)
      expect(c.tokenCount).toBeLessThanOrEqual(config.chunking.maxTokens);
    expect(chunks.map((c) => c.chunkId)).toEqual(
      expect.arrayContaining([
        "claude-code/hooks#big-1",
        "claude-code/hooks#big-2",
      ]),
    );
  });

  it("merges a sub-minimum section so no chunk falls below the min", () => {
    const chunks = chunkPage(
      input(`# Page\n\n## Tiny\n\nshort.\n\n## Normal\n\n${paragraph(200)}`),
    );
    for (const c of chunks)
      expect(c.tokenCount).toBeGreaterThanOrEqual(config.chunking.minTokens);
    // merged chunk records both heading paths (RAG §2)
    expect(
      chunks.some(
        (c) => c.breadcrumb.includes("Tiny") && c.breadcrumb.includes("Normal"),
      ),
    ).toBe(true);
  });
});

describe("RAG §2 oversize-atomic exception", () => {
  it("splits an over-embedding-limit table into self-describing segments", () => {
    const header = "| Name | Description |\n| --- | --- |";
    const rows = Array.from(
      { length: 800 },
      (_, i) => `| VAR_${i} | ${paragraph(10)} value number ${i} |`,
    );
    const chunks = chunkPage(
      input(`# Page\n\n## Env vars\n\n${header}\n${rows.join("\n")}`),
    );
    const segs = chunks.filter((c) => /\/part-\d+$/.test(c.chunkId));

    expect(segs.length).toBeGreaterThan(1); // it actually segmented
    for (const c of segs) {
      // every segment is embeddable and under the segment size
      expect(c.tokenCount).toBeLessThan(config.chunking.embeddingLimitTokens);
      expect(c.tokenCount).toBeLessThanOrEqual(
        config.chunking.oversizeSegmentTokens,
      );
      // every segment re-carries the header row (self-describing)
      expect(c.content).toContain("| Name | Description |");
    }
    // deterministic parent-extending ids: {parent}/part-1, /part-2, ...
    expect(segs.map((c) => c.chunkId)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\/part-1$/),
        expect.stringMatching(/\/part-2$/),
      ]),
    );
    // no row lost: every body row lands in exactly one segment
    const joined = segs.map((c) => c.content).join("\n");
    for (let i = 0; i < 800; i++) expect(joined).toContain(`VAR_${i} `);
  });
});

describe("RAG-07: parameters from config", () => {
  it("splitting behavior is keyed to config sizes, not inlined literals", () => {
    const paras = Array.from({ length: 5 }, () => paragraph(300)).join("\n\n");
    const chunks = chunkPage(input(`# Page\n\n## S\n\n${paras}`));
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks)
      expect(c.tokenCount).toBeLessThanOrEqual(config.chunking.maxTokens);
  });
});
