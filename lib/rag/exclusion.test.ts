import { describe, it, expect } from "vitest";
import { isExcludedPage } from "./exclusion";

/**
 * The corpus-scope exclusion (RAG-01, RAG-23) must match the intended pages
 * exactly: `changelog` (exact) and `whats-new/%` (prefix). Pure, no DB.
 */
describe("isExcludedPage (RAG-23)", () => {
  it("excludes the changelog page (exact)", () => {
    expect(isExcludedPage("changelog")).toBe(true);
  });

  it("excludes every whats-new page (prefix)", () => {
    expect(isExcludedPage("whats-new/index")).toBe(true);
    expect(isExcludedPage("whats-new/2026-w13")).toBe(true);
  });

  it("keeps normal pages and does not over-match on substring", () => {
    expect(isExcludedPage("checkpointing")).toBe(false);
    expect(isExcludedPage("memory")).toBe(false);
    expect(isExcludedPage("changelog-viewer")).toBe(false);
    expect(isExcludedPage("my-whats-new")).toBe(false);
  });
});
