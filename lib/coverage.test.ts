import { describe, it, expect } from "vitest";
import { pickCoverageChips } from "./coverage";

describe("pickCoverageChips (§7, RAG-21)", () => {
  const titles = [
    "Hooks reference",
    "Model Context Protocol (MCP)",
    "Subagents",
    "Skills",
    "Permissions",
    "Slash commands",
    "Settings",
    "Some obscure page",
  ];

  it("prefers well-known covered areas, capped", () => {
    const chips = pickCoverageChips(titles, 4);
    expect(chips).toEqual([
      "Hooks reference",
      "Model Context Protocol (MCP)",
      "Subagents",
      "Skills",
    ]);
  });

  it("falls back to filling from the front when preferred are scarce", () => {
    const chips = pickCoverageChips(["Alpha", "Beta", "Gamma"], 2);
    expect(chips).toEqual(["Alpha", "Beta"]);
  });

  it("never repeats and never exceeds max", () => {
    const chips = pickCoverageChips(titles, 6);
    expect(new Set(chips).size).toBe(chips.length);
    expect(chips.length).toBe(6);
  });
});
