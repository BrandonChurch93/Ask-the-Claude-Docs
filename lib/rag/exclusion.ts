import { config } from "../config";

/**
 * Corpus-scope exclusion (RAG-01, RAG-23). One config-driven list
 * (`corpus.excludedPagePatterns`) applied at discovery so excluded pages are
 * never ingested; the daily sync deletes any that were ingested before. Because
 * the corpus is clean, retrieval and coverage need no per-query filtering. Pure
 * (config only), so it is shared by discovery, the coverage query, and the eval
 * regression checks without a database dependency.
 */

/** SQL/glob `LIKE` -> RegExp (`%` -> any run, `_` -> any single char). */
function likeToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/%/g, ".*").replace(/_/g, ".")}$`);
}

const excludedMatchers = config.corpus.excludedPagePatterns.map(likeToRegExp);

/** True when a page path is excluded from the corpus. */
export function isExcludedPage(pagePath: string): boolean {
  return excludedMatchers.some((re) => re.test(pagePath));
}
