import { createHash } from "node:crypto";
import { getEncoding, type Tiktoken } from "js-tiktoken";
import { config } from "../config";

/**
 * Heading-aware structural chunker (rag-design.md §2-3). Splits at the config
 * heading levels, keeps fenced code and tables atomic (RAG-06), merges
 * sub-minimum sections and splits oversize ones at block boundaries (RAG-04),
 * prefixes every chunk with a breadcrumb (RAG-05), and derives a deterministic
 * chunk_id from document structure (RAG-08). All sizes come from config
 * (RAG-07). Token counts use the tokenizer matching the embedding model
 * (cl100k_base for text-embedding-3-small), never a character approximation.
 *
 * Pure and I/O-free so the whole rule set is fixture-testable (ENG-18).
 */

export interface ChunkInput {
  source: string;
  pagePath: string;
  title: string;
  url: string;
  rawMarkdown: string;
}

export interface Chunk {
  chunkId: string;
  pagePath: string;
  source: string;
  breadcrumb: string;
  headingAnchor: string;
  /** Embedded text: breadcrumb line, blank line, then the section text (RAG-05). */
  content: string;
  contentHash: string;
  tokenCount: number;
}

// --- Tokenizer (cl100k_base), loaded once. ---
let encoder: Tiktoken | null = null;
export function countTokens(text: string): number {
  encoder ??= getEncoding("cl100k_base");
  return encoder.encode(text).length;
}

// --- Block parsing. Fenced code and tables are atomic units (RAG-06). ---
type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "prose"; text: string }
  | { kind: "code"; text: string }
  | { kind: "table"; text: string };

const HEADING = /^(#{1,6})\s+(.*)$/;
const FENCE = /^\s*(`{3,}|~{3,})/;
const TABLE_SEP = /^\s*\|?[\s:|-]+\|?\s*$/;

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let prose: string[] = [];

  const flushProse = () => {
    const text = prose.join("\n").trim();
    if (text.length > 0) blocks.push({ kind: "prose", text });
    prose = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;

    const fence = FENCE.exec(line);
    if (fence) {
      flushProse();
      const marker = fence[1]![0]!; // ` or ~
      const closeRe = new RegExp(`^\\s*[${marker}]{3,}\\s*$`);
      const buf = [line];
      i++;
      while (i < lines.length) {
        buf.push(lines[i]!);
        const closed = closeRe.test(lines[i]!);
        i++;
        if (closed) break;
      }
      blocks.push({ kind: "code", text: buf.join("\n") });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushProse();
      blocks.push({
        kind: "heading",
        level: heading[1]!.length,
        text: heading[2]!.trim(),
      });
      i++;
      continue;
    }

    const nextLine = lines[i + 1];
    if (
      line.includes("|") &&
      nextLine !== undefined &&
      nextLine.includes("-") &&
      TABLE_SEP.test(nextLine)
    ) {
      flushProse();
      const buf = [line];
      i++;
      while (
        i < lines.length &&
        lines[i]!.trim().length > 0 &&
        lines[i]!.includes("|")
      ) {
        buf.push(lines[i]!);
        i++;
      }
      blocks.push({ kind: "table", text: buf.join("\n") });
      continue;
    }

    if (line.trim().length === 0) {
      flushProse();
      i++;
      continue;
    }

    prose.push(line);
    i++;
  }
  flushProse();
  return blocks;
}

function renderBlock(block: Block): string {
  if (block.kind === "heading")
    return `${"#".repeat(block.level)} ${block.text}`;
  return block.text;
}

function renderBlocks(blocks: Block[]): string {
  return blocks.map(renderBlock).join("\n\n").trim();
}

// Per-block token counts, computed once (blocks are reused across merge/split).
const blockTokenCache = new WeakMap<Block, number>();
function blockTokens(block: Block): number {
  let t = blockTokenCache.get(block);
  if (t === undefined) {
    t = countTokens(renderBlock(block));
    blockTokenCache.set(block, t);
  }
  return t;
}
function breadcrumbTokens(title: string, headingPaths: string[][]): number {
  return countTokens(`${breadcrumbOf(title, headingPaths)}\n\n`);
}

// --- Grouping into sections by heading (split at config levels). ---
interface Section {
  headingPath: string[]; // ## and ### ancestry, in order
  blocks: Block[];
}

function groupIntoSections(
  blocks: Block[],
  splitLevels: readonly number[],
): Section[] {
  const sections: Section[] = [];
  let path: string[] = [];
  let current: Block[] = [];
  let h2: string | null = null;
  let h3: string | null = null;

  const flush = () => {
    if (renderBlocks(current).trim().length > 0) {
      sections.push({ headingPath: [...path], blocks: current });
    }
    current = [];
  };

  for (const block of blocks) {
    if (block.kind === "heading") {
      if (block.level === 1) continue; // page title is metadata, not a split point
      if (splitLevels.includes(block.level)) {
        flush();
        if (block.level === 2) {
          h2 = block.text;
          h3 = null;
        } else if (block.level === 3) {
          h3 = block.text;
        }
        path = [h2, h3].filter((x): x is string => x !== null);
        continue;
      }
      // #### and deeper stay inside the parent chunk as content.
      current.push(block);
      continue;
    }
    current.push(block);
  }
  flush();
  return sections;
}

// --- Units: sections after small-section merging (RAG-04 min rule). ---
interface Unit {
  headingPaths: string[][]; // one, or several when merged
  blocks: Block[];
}

function breadcrumbOf(title: string, headingPaths: string[][]): string {
  const rendered = headingPaths
    .map((p) => p.join(" › "))
    .filter((s) => s.length > 0);
  const tail = rendered.join(" + ");
  return tail
    ? `Claude Code docs › ${title} › ${tail}`
    : `Claude Code docs › ${title}`;
}

// Estimated embedded-text token count = breadcrumb + sum of per-block counts.
// Close to an exact encode (block boundaries are clean newlines) but O(1) given
// the block cache, so the whole corpus is encoded only once.
function estimateTokens(
  title: string,
  headingPaths: string[][],
  blocks: Block[],
): number {
  return (
    breadcrumbTokens(title, headingPaths) +
    blocks.reduce((sum, b) => sum + blockTokens(b), 0)
  );
}

function mergeSmallSections(
  sections: Section[],
  title: string,
  minTokens: number,
): Unit[] {
  const units: Unit[] = sections.map((s) => ({
    headingPaths: [s.headingPath],
    blocks: s.blocks,
  }));
  const tokensOf = (u: Unit) =>
    breadcrumbTokens(title, u.headingPaths) +
    u.blocks.reduce((sum, b) => sum + blockTokens(b), 0);
  const merge = (a: Unit, b: Unit): Unit => ({
    headingPaths: [...a.headingPaths, ...b.headingPaths],
    blocks: [...a.blocks, ...b.blocks],
  });

  let i = 0;
  while (i < units.length && units.length > 1) {
    if (tokensOf(units[i]!) < minTokens) {
      if (i < units.length - 1) {
        units[i] = merge(units[i]!, units[i + 1]!); // merge with the following sibling
        units.splice(i + 1, 1);
      } else {
        units[i - 1] = merge(units[i - 1]!, units[i]!); // last section: merge with preceding
        units.splice(i, 1);
        break;
      }
    } else {
      i++;
    }
  }
  return units;
}

// A prose block (paragraph or list) that alone exceeds the budget is sub-split
// at line boundaries: for lists this is item boundaries, for line-oriented prose
// it is line boundaries; a single line that is still oversize stays whole. Code
// and tables are never touched here (they stay atomic, RAG-06).
function splitProseByLines(text: string, budget: number): Block[] {
  const out: Block[] = [];
  let current: string[] = [];
  let currentTokens = 0;
  for (const line of text.split("\n")) {
    const lineTokens = countTokens(line) + 1; // +1 approximates the newline join
    if (current.length > 0 && currentTokens + lineTokens > budget) {
      out.push({ kind: "prose", text: current.join("\n") });
      current = [];
      currentTokens = 0;
    }
    current.push(line);
    currentTokens += lineTokens;
  }
  if (current.length > 0) out.push({ kind: "prose", text: current.join("\n") });
  return out;
}

// --- Splitting oversize units at block boundaries (never mid-block, RAG-06). ---
function splitIntoParts(
  title: string,
  unit: Unit,
  targetTokens: number,
): Block[][] {
  const budget = Math.max(
    1,
    targetTokens - breadcrumbTokens(title, unit.headingPaths),
  );
  // Expand oversize prose/list blocks so a huge list or block does not become a
  // single over-max chunk (RAG-04). Code and tables are left atomic.
  const blocks = unit.blocks.flatMap((b) =>
    b.kind === "prose" && blockTokens(b) > budget
      ? splitProseByLines(b.text, budget)
      : [b],
  );
  const parts: Block[][] = [];
  let current: Block[] = [];
  let currentTokens = 0;

  for (const block of blocks) {
    const bt = blockTokens(block);
    if (current.length > 0 && currentTokens + bt > budget) {
      parts.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(block);
    currentTokens += bt;
    if (current.length === 1 && bt > budget) {
      // A single oversize block (a large code fence or table) stays whole in its
      // own part: the documented atomicity exception to the max (RAG §2).
      parts.push(current);
      current = [];
      currentTokens = 0;
    }
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

// --- Oversize-atomic exception (RAG §2). When an atomic unit alone exceeds the
// embedding input limit it is un-embeddable, so it is split at natural
// boundaries into self-describing segments under the segment size: tables at row
// boundaries (each segment re-carries the header row), code fences at blank-line
// logical blocks (each segment re-wrapped in the fence). The breadcrumb prefix
// is added per segment by makeChunk. `budget` is the room left for segment
// content after the breadcrumb. ---
function segmentTable(tableText: string, budget: number): string[] {
  const rows = tableText.split("\n").filter((l) => l.trim().length > 0);
  if (rows.length < 3) return [tableText]; // header + separator + at least one body row
  const headerBlock = `${rows[0]!}\n${rows[1]!}`;
  const bodyBudget = Math.max(1, budget - countTokens(`${headerBlock}\n`));
  const segments: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;
  for (const row of rows.slice(2)) {
    const rowTokens = countTokens(row) + 1;
    if (current.length > 0 && currentTokens + rowTokens > bodyBudget) {
      segments.push(`${headerBlock}\n${current.join("\n")}`);
      current = [];
      currentTokens = 0;
    }
    current.push(row);
    currentTokens += rowTokens;
  }
  if (current.length > 0)
    segments.push(`${headerBlock}\n${current.join("\n")}`);
  return segments;
}

function segmentCode(codeText: string, budget: number): string[] {
  const lines = codeText.split("\n");
  const open = lines[0] ?? "```";
  const close = lines[lines.length - 1] ?? "```";
  const bodyBudget = Math.max(1, budget - countTokens(`${open}\n${close}\n`));

  // Logical blocks = blank-line-separated groups; a group over budget falls back
  // to line packing so no line is split.
  const segments: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;
  const flush = () => {
    if (current.length > 0) {
      segments.push(`${open}\n${current.join("\n")}\n${close}`);
      current = [];
      currentTokens = 0;
    }
  };
  const add = (line: string) => {
    const lineTokens = countTokens(line) + 1;
    if (current.length > 0 && currentTokens + lineTokens > bodyBudget) flush();
    current.push(line);
    currentTokens += lineTokens;
  };

  let group: string[] = [];
  const packGroup = () => {
    if (group.length === 0) return;
    const groupText = group.join("\n");
    if (countTokens(groupText) + 1 > bodyBudget) {
      for (const line of group) add(line);
    } else {
      if (
        current.length > 0 &&
        currentTokens + countTokens(groupText) + 1 > bodyBudget
      )
        flush();
      for (const line of group) {
        current.push(line);
        currentTokens += countTokens(line) + 1;
      }
    }
    group = [];
  };
  for (const line of lines.slice(1, -1)) {
    if (line.trim().length === 0) packGroup();
    else group.push(line);
  }
  packGroup();
  flush();
  return segments.length > 0 ? segments : [codeText];
}

function segmentAtomic(block: Block, budget: number): string[] {
  if (block.kind === "table") return segmentTable(block.text, budget);
  if (block.kind === "code") return segmentCode(block.text, budget);
  return [renderBlock(block)];
}

// --- Identity + hashing. ---
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeForHash(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function makeChunk(
  input: ChunkInput,
  unit: Unit,
  content: string,
  part: { n: number; count: number } | null,
  seen: Map<string, number>,
  tokenCount: number,
  segment: number | null = null,
): Chunk {
  const breadcrumb = breadcrumbOf(input.title, unit.headingPaths);
  const embedded = `${breadcrumb}\n\n${content}`;
  const primary = unit.headingPaths[0] ?? [];
  const headingSlugPath = primary.map(slugify).join("/");
  const idBase = headingSlugPath
    ? `${input.source}/${input.pagePath}#${headingSlugPath}`
    : `${input.source}/${input.pagePath}`;
  let chunkId = part ? `${idBase}-${part.n}` : idBase;
  // Oversize-atomic segment ids extend the parent deterministically (RAG §2).
  if (segment !== null) chunkId = `${chunkId}/part-${segment}`;
  // Safety net for the rare page with two identically-titled sections: keep the
  // id deterministic by document order rather than colliding on the PK.
  const dupCount = seen.get(chunkId) ?? 0;
  seen.set(chunkId, dupCount + 1);
  if (dupCount > 0) chunkId = `${chunkId}~${dupCount + 1}`;

  const lastHeading = primary[primary.length - 1];
  const headingAnchor = lastHeading
    ? `${input.url}#${slugify(lastHeading)}`
    : input.url;

  return {
    chunkId,
    pagePath: input.pagePath,
    source: input.source,
    breadcrumb,
    headingAnchor,
    content: embedded,
    contentHash: sha256(normalizeForHash(embedded)),
    tokenCount,
  };
}

export function chunkPage(input: ChunkInput): Chunk[] {
  const {
    splitHeadingLevels,
    targetTokens,
    maxTokens,
    minTokens,
    embeddingLimitTokens,
    oversizeSegmentTokens,
  } = config.chunking;
  const blocks = parseBlocks(input.rawMarkdown);
  const sections = groupIntoSections(blocks, splitHeadingLevels);
  const units = mergeSmallSections(sections, input.title, minTokens);

  const chunks: Chunk[] = [];
  const seen = new Map<string, number>();
  for (const unit of units) {
    const unitTokens = estimateTokens(
      input.title,
      unit.headingPaths,
      unit.blocks,
    );
    if (unitTokens <= maxTokens) {
      chunks.push(
        makeChunk(
          input,
          unit,
          renderBlocks(unit.blocks),
          null,
          seen,
          unitTokens,
        ),
      );
    } else {
      const parts = splitIntoParts(input.title, unit, targetTokens);
      parts.forEach((partBlocks, idx) => {
        const partInfo = { n: idx + 1, count: parts.length };
        const partTokens = estimateTokens(
          input.title,
          unit.headingPaths,
          partBlocks,
        );
        const first = partBlocks[0];

        // Oversize-atomic exception (RAG §2): a single atomic block over the
        // embedding limit is split into self-describing segments.
        if (
          partTokens > embeddingLimitTokens &&
          partBlocks.length === 1 &&
          first &&
          (first.kind === "table" || first.kind === "code")
        ) {
          const bcTokens = breadcrumbTokens(input.title, unit.headingPaths);
          const segments = segmentAtomic(
            first,
            oversizeSegmentTokens - bcTokens,
          );
          segments.forEach((segContent, sIdx) => {
            chunks.push(
              makeChunk(
                input,
                unit,
                segContent,
                partInfo,
                seen,
                bcTokens + countTokens(segContent),
                sIdx + 1,
              ),
            );
          });
          return;
        }

        chunks.push(
          makeChunk(
            input,
            unit,
            renderBlocks(partBlocks),
            partInfo,
            seen,
            partTokens,
          ),
        );
      });
    }
  }
  return chunks;
}
