import { describe, it, expect } from "vitest";
import { tokenizeAnswer, tokenizeInline } from "./tokenize";

describe("tokenizeInline (SEC-07)", () => {
  it("extracts [n] markers as references, keeping surrounding text", () => {
    expect(
      tokenizeInline("Yes, a hook blocks it [1] before the call."),
    ).toEqual([
      { type: "text", value: "Yes, a hook blocks it " },
      { type: "marker", n: 1 },
      { type: "text", value: " before the call." },
    ]);
  });

  it("parses inline code spans without any HTML", () => {
    expect(tokenizeInline("Run `claude mcp add` to add it.")).toEqual([
      { type: "text", value: "Run " },
      { type: "code", value: "claude mcp add" },
      { type: "text", value: " to add it." },
    ]);
  });

  it("leaves an incomplete trailing marker or code as literal text (streaming)", () => {
    expect(tokenizeInline("partial [1")).toEqual([
      { type: "text", value: "partial [1" },
    ]);
    expect(tokenizeInline("code `unclosed")).toEqual([
      { type: "text", value: "code `unclosed" },
    ]);
  });

  it("does not treat HTML-looking text as markup (renders literally)", () => {
    // No parsing of <b> etc.; it is plain text, so React escapes it downstream.
    expect(tokenizeInline("<b>ignore me</b> [2]")).toEqual([
      { type: "text", value: "<b>ignore me</b> " },
      { type: "marker", n: 2 },
    ]);
  });

  it("handles adjacent markers", () => {
    expect(tokenizeInline("both [1][2] apply")).toEqual([
      { type: "text", value: "both " },
      { type: "marker", n: 1 },
      { type: "marker", n: 2 },
      { type: "text", value: " apply" },
    ]);
  });
});

describe("tokenizeAnswer (SEC-07)", () => {
  it("splits paragraphs on blank lines and parses each", () => {
    const paras = tokenizeAnswer("First para [1].\n\nSecond with `code`.");
    expect(paras).toHaveLength(2);
    expect(paras[0]!.inlines.some((i) => i.type === "marker")).toBe(true);
    expect(paras[1]!.inlines.some((i) => i.type === "code")).toBe(true);
  });

  it("drops empty blocks", () => {
    expect(tokenizeAnswer("\n\n  \n\nonly one")).toEqual([
      { type: "paragraph", inlines: [{ type: "text", value: "only one" }] },
    ]);
  });
});
