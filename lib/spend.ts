import "server-only";

import { Redis } from "@upstash/redis";
import { env } from "./env";
import { config } from "./config";

/**
 * Global daily spend cap (security.md §4, SEC-10/11). A single Upstash counter,
 * keyed by UTC date, accumulates the real computed cost (the same usage-object
 * math as the receipt, RAG-17) of every answered request. The cap is checked
 * *before* the generation call and the layer *fails closed*: if the counter
 * cannot be read or written, no generation happens (a down demo beats an
 * unbounded bill). The per-IP limiter (middleware.ts) is the independent
 * fail-open layer. The cap number lives in config (RAG-19).
 */

let redis: Redis | null = null;
function getRedis(): Redis {
  redis ??= new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  return redis;
}

/** Per-UTC-day key, so the cap "resets at midnight UTC" by construction. */
function spendKey(now: Date): string {
  return `spend:${now.toISOString().slice(0, 10)}`; // spend:YYYY-MM-DD
}

/** Stale day-keys self-expire two days out; the date in the key does the reset. */
const KEY_TTL_SECONDS = 60 * 60 * 48;

/**
 * True when the day's accumulated spend has reached the cap (SEC-10). Uses a
 * single `INCRBYFLOAT key 0`: it returns the current value *and* proves the key
 * is writable in one round-trip, so a throw here means the caller must fail
 * closed. The caller treats any thrown error as "capped" (no generation).
 */
export async function isSpendCapReached(
  now: Date = new Date(),
): Promise<boolean> {
  const current = await getRedis().incrbyfloat(spendKey(now), 0);
  return Number(current) >= config.spend.dailyCapUsd;
}

/**
 * Accumulate one request's real computed cost into the day's counter (SEC-10).
 * Called after a successful generation; a no-op for zero cost (refusals). Writes
 * are best-effort here because the spend already happened, but writability was
 * proven pre-generation by `isSpendCapReached`; a failure is logged loudly.
 */
export async function recordSpend(
  costUsd: number,
  now: Date = new Date(),
): Promise<void> {
  if (costUsd <= 0) return;
  const key = spendKey(now);
  const client = getRedis();
  await client.incrbyfloat(key, costUsd);
  await client.expire(key, KEY_TTL_SECONDS);
}
