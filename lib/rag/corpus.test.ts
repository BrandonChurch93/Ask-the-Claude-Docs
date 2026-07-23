import { describe, it, expect } from "vitest";
import { parseLlmsTxt, derivePagePath, isMarkdownResponse } from "./corpus";

const LLMS_FIXTURE = `# Claude Code Docs

> Some description.

## Docs

- [Use a screen reader](https://code.claude.com/docs/en/accessibility.md): desc.
- [Hooks reference](https://code.claude.com/docs/en/hooks.md): desc.
- [SDK hooks](https://code.claude.com/docs/en/agent-sdk/hooks.md): desc.
- [Duplicate hooks](https://code.claude.com/docs/en/hooks.md): should dedupe.

Not a link line, ignored.
`;

describe("parseLlmsTxt (RAG-01)", () => {
  const refs = parseLlmsTxt(LLMS_FIXTURE);

  it("extracts only the .md links from llms.txt, deduplicated", () => {
    expect(refs.map((r) => r.url)).toEqual([
      "https://code.claude.com/docs/en/accessibility.md",
      "https://code.claude.com/docs/en/hooks.md",
      "https://code.claude.com/docs/en/agent-sdk/hooks.md",
    ]);
  });

  it("derives collision-free page paths and keeps titles", () => {
    expect(refs.map((r) => r.pagePath)).toEqual([
      "accessibility",
      "hooks",
      "agent-sdk/hooks",
    ]);
    expect(refs[0]!.title).toBe("Use a screen reader");
  });
});

describe("derivePagePath", () => {
  it("strips /docs/en/ and .md, preserving sub-paths", () => {
    expect(derivePagePath("https://code.claude.com/docs/en/hooks.md")).toBe(
      "hooks",
    );
    expect(
      derivePagePath("https://code.claude.com/docs/en/agent-sdk/overview.md"),
    ).toBe("agent-sdk/overview");
  });
});

describe("isMarkdownResponse (RAG-02)", () => {
  it("accepts markdown/plain bodies", () => {
    expect(
      isMarkdownResponse("text/markdown; charset=utf-8", "# Title\n\ntext"),
    ).toBe(true);
    expect(isMarkdownResponse("text/plain; charset=utf-8", "- a\n- b")).toBe(
      true,
    );
  });

  it("skips HTML documents by content-type or body sniff", () => {
    // The changelog case: a page that redirects to rendered HTML.
    expect(
      isMarkdownResponse(
        "text/html; charset=utf-8",
        "<!doctype html><html>...",
      ),
    ).toBe(false);
    expect(
      isMarkdownResponse(
        "text/markdown",
        "<!DOCTYPE html>\n<html><head></head>",
      ),
    ).toBe(false);
    expect(isMarkdownResponse("text/markdown", '<html lang="en">')).toBe(false);
  });

  it("skips empty bodies", () => {
    expect(isMarkdownResponse("text/markdown", "   \n  ")).toBe(false);
  });
});
