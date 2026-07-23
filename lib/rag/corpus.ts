import { createHash } from "node:crypto";
import { config } from "../config";
import { isExcludedPage } from "./exclusion";

/**
 * Corpus discovery and fetch (rag-design.md §1). Discovery starts from llms.txt
 * and only fetches URLs found there (RAG-01). Each response is content-sniffed;
 * non-markdown pages are skipped with a reason, never HTML-scraped (RAG-02).
 * Raw markdown is returned for storage before any chunking (RAG-03).
 *
 * The parse and sniff functions are pure so they can be fixture-tested without
 * the network (ENG-18).
 */

export interface PageRef {
  pagePath: string;
  url: string;
  title: string;
}

export interface FetchedPage {
  pagePath: string;
  source: string;
  title: string;
  url: string;
  rawMarkdown: string;
  pageHash: string;
}

export interface SkippedPage {
  pagePath: string;
  url: string;
  reason: string;
}

/**
 * Derive a stable page_path from a docs URL: the path after `/docs/en/` (locale
 * stripped) minus the `.md` extension. Nested pages keep their sub-path so
 * `hooks` and `agent-sdk/hooks` never collide. Matches the RAG §3 example
 * (`.../en/hooks.md` -> `hooks`).
 */
export function derivePagePath(url: string): string {
  const { pathname } = new URL(url);
  return pathname
    .replace(/^\/docs\//, "")
    .replace(/^en\//, "")
    .replace(/\.md$/, "");
}

/**
 * Parse the llms.txt markdown index into page refs (RAG-01). Extracts each
 * `- [Title](https://....md)` link; deduplicates by URL. No hardcoded page list
 * exists anywhere else.
 */
export function parseLlmsTxt(text: string): PageRef[] {
  const linkRe = /^\s*-\s*\[([^\]]+)\]\((https?:\/\/[^)]+\.md)\)/;
  const refs: PageRef[] = [];
  const seen = new Set<string>();
  for (const line of text.split("\n")) {
    const m = linkRe.exec(line);
    if (!m) continue;
    const title = m[1]!.trim();
    const url = m[2]!.trim();
    if (seen.has(url)) continue;
    seen.add(url);
    refs.push({ pagePath: derivePagePath(url), url, title });
  }
  return refs;
}

/**
 * Content sniff (RAG-02): a response counts as markdown only if it is not served
 * as HTML and its body is not an HTML document. text/markdown and text/plain are
 * both accepted (the docs serve markdown; llms.txt itself is text/plain).
 */
export function isMarkdownResponse(
  contentType: string | null,
  body: string,
): boolean {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("text/html")) return false;
  const trimmed = body.trimStart();
  if (trimmed.length === 0) return false;
  const head = trimmed.slice(0, 500).toLowerCase();
  if (head.startsWith("<!doctype html") || head.startsWith("<head"))
    return false;
  if (/^<html[\s>]/.test(head)) return false;
  return true;
}

/** SHA-256 of the raw markdown; the page-level change key (RAG §9). */
export function pageHash(rawMarkdown: string): string {
  return createHash("sha256").update(rawMarkdown).digest("hex");
}

/**
 * Fetch and parse llms.txt into the page list, then apply the corpus-scope
 * exclusion (RAG-01, RAG-23): pages matching `corpus.excludedPagePatterns` are
 * dropped at discovery, so the diff planner sees them as removed and the sync
 * deletes any previously ingested. `zero page refs` is checked before the
 * exclusion so an empty llms.txt still fails loudly.
 */
export async function discoverPages(): Promise<PageRef[]> {
  const res = await fetch(config.corpus.llmsTxtUrl);
  if (!res.ok) throw new Error(`llms.txt fetch failed: HTTP ${res.status}`);
  const refs = parseLlmsTxt(await res.text());
  if (refs.length === 0) throw new Error("llms.txt produced zero page refs");
  return refs.filter((r) => !isExcludedPage(r.pagePath));
}

type FetchOutcome =
  { ok: true; page: FetchedPage } | { ok: false; skip: SkippedPage };

/** Fetch one page's raw markdown and validate it (RAG-02). */
export async function fetchPage(ref: PageRef): Promise<FetchOutcome> {
  const skip = (reason: string): FetchOutcome => ({
    ok: false,
    skip: { pagePath: ref.pagePath, url: ref.url, reason },
  });

  let res: Response;
  try {
    res = await fetch(ref.url);
  } catch (err) {
    return skip(
      `fetch error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok) return skip(`HTTP ${res.status}`);

  const body = await res.text();
  if (!isMarkdownResponse(res.headers.get("content-type"), body)) {
    return skip("non-markdown response (RAG-02)");
  }

  return {
    ok: true,
    page: {
      pagePath: ref.pagePath,
      source: config.corpus.source,
      title: ref.title,
      url: ref.url,
      rawMarkdown: body,
      pageHash: pageHash(body),
    },
  };
}

/**
 * Discover and fetch the whole corpus with a concurrency bound. Returns fetched
 * pages and skipped pages (with reasons) so the caller can store the raw
 * markdown and record skips in the sync log (RAG-02/03).
 */
export async function fetchCorpus(): Promise<{
  fetched: FetchedPage[];
  skipped: SkippedPage[];
}> {
  const refs = await discoverPages();
  const fetched: FetchedPage[] = [];
  const skipped: SkippedPage[] = [];

  let next = 0;
  async function worker() {
    while (next < refs.length) {
      const ref = refs[next++];
      if (!ref) break;
      const outcome = await fetchPage(ref);
      if (outcome.ok) fetched.push(outcome.page);
      else skipped.push(outcome.skip);
    }
  }

  const workers = Math.min(config.corpus.fetchConcurrency, refs.length);
  await Promise.all(Array.from({ length: workers }, worker));
  return { fetched, skipped };
}
