import { describe, it, expect } from "vitest";
import { computeCostUsd } from "./cost";
import { config } from "../config";

describe("computeCostUsd (RAG-17)", () => {
  it("prices Haiku input + output from the usage object at config rates", () => {
    // 1M input @ $1 + 1M output @ $5 = $6.00 exactly.
    const cost = computeCostUsd("claude-haiku-4-5", {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(6.0, 10);
  });

  it("prices all four token categories, including cache tokens", () => {
    const cost = computeCostUsd("claude-haiku-4-5", {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_creation_input_tokens: 1_000_000, // @ $1.25
      cache_read_input_tokens: 1_000_000, // @ $0.10
    });
    expect(cost).toBeCloseTo(1 + 5 + 1.25 + 0.1, 10);
  });

  it("uses the config rate for the selected model, not a hardcoded one", () => {
    const cost = computeCostUsd("claude-sonnet-4-6", {
      input_tokens: 1_000_000,
      output_tokens: 0,
    });
    expect(cost).toBeCloseTo(
      config.pricing["claude-sonnet-4-6"].inputPerMTok,
      10,
    );
  });

  it("returns 0 with no usage (a refusal makes no generation call)", () => {
    expect(computeCostUsd("claude-haiku-4-5", null)).toBe(0);
  });

  it("returns 0 for an unpriced model rather than throwing", () => {
    expect(
      computeCostUsd("nonexistent-model", {
        input_tokens: 100,
        output_tokens: 5,
      }),
    ).toBe(0);
  });
});
