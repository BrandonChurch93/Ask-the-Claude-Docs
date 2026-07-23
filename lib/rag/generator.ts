import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";
import { config } from "../config";
import { buildMessages, type PromptSource } from "./prompt";

/**
 * Generation client (rag-design.md §7). Claude Haiku by default, Sonnet behind
 * a server-side config flag; max_tokens from config (PERF-11). The request has
 * no tools and no client-controllable parameters (SEC-08); model, max_tokens,
 * and the prompt are entirely server-owned (SEC-04), and the question occupies
 * only the user turn (SEC-05). server-only keeps the API key off the client.
 */

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

/** Haiku default; Sonnet only when the server config flag is set (RAG §7). */
export function selectedModel(): string {
  return config.generation.useHigherQualityModel
    ? config.generation.higherQualityModel
    : config.generation.model;
}

export interface GenerationRequest {
  model: string;
  max_tokens: number;
  system: string;
  messages: { role: "user"; content: string }[];
}

/**
 * The exact Messages-API request. Deliberately exactly these four fields: no
 * tools, no temperature or other client-tunable knobs (SEC-08). Extracted so
 * the parameters are testable without a paid call.
 */
export function buildGenerationRequest(
  question: string,
  sources: PromptSource[],
): GenerationRequest {
  const { system, messages } = buildMessages(question, sources);
  return {
    model: selectedModel(),
    max_tokens: config.generation.maxOutputTokens,
    system,
    messages,
  };
}

/** Stream the answer from the Messages API (consumed by the SSE route, P3.3). */
export function streamAnswer(question: string, sources: PromptSource[]) {
  return getClient().messages.stream(buildGenerationRequest(question, sources));
}
