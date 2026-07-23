import { describe, it, expect } from "vitest";
import { buildGenerationRequest, selectedModel } from "./generator";
import { config } from "../config";

describe("buildGenerationRequest (SEC-04/08, PERF-11)", () => {
  const req = buildGenerationRequest("a question", [{ content: "a source" }]);

  it("uses only server config; no tools or client-tunable parameters (SEC-08)", () => {
    expect(req.model).toBe(config.generation.model);
    expect(req.max_tokens).toBe(config.generation.maxOutputTokens);
    // Exactly these four fields: no tools, temperature, top_p, etc.
    expect(Object.keys(req).sort()).toEqual([
      "max_tokens",
      "messages",
      "model",
      "system",
    ]);
  });

  it("carries the max_tokens cap from config (PERF-11)", () => {
    expect(req.max_tokens).toBe(1024);
  });
});

describe("selectedModel (RAG §7)", () => {
  it("is Haiku by default, Sonnet only behind the server flag", () => {
    expect(config.generation.useHigherQualityModel).toBe(false);
    expect(selectedModel()).toBe("claude-haiku-4-5");
    expect(selectedModel()).toBe(config.generation.model);
  });
});
