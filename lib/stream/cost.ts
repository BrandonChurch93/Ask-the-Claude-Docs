import { config } from "../config";

/**
 * Query cost from the generation API usage object (RAG-17), never an estimate.
 * Prices all four token categories at the per-model rates in `config.pricing`
 * (RAG-19). Returns 0 when there is no usage (a refusal makes no generation
 * call) or the model is unpriced (server config guarantees a priced one; the
 * guard is defensive). The embedding portion is not included yet: its rate is
 * to-be-verified at calibration (see `config.pricing`).
 */

/** The Anthropic usage shape; cache fields are absent unless caching is used. */
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

type PricingTable = typeof config.pricing;
type Rate = PricingTable[keyof PricingTable];

function rateFor(model: string): Rate | undefined {
  return (config.pricing as Record<string, Rate>)[model];
}

export function computeCostUsd(
  model: string,
  usage: TokenUsage | null,
): number {
  if (!usage) return 0;
  const rate = rateFor(model);
  if (!rate) return 0;
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  return (
    (input * rate.inputPerMTok +
      output * rate.outputPerMTok +
      cacheWrite * rate.cacheWritePerMTok +
      cacheRead * rate.cacheReadPerMTok) /
    1_000_000
  );
}
