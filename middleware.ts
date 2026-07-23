import { NextResponse, type NextRequest } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { config as appConfig } from "./lib/config";
import { env } from "./lib/env";

/**
 * Per-IP rate limiter (security.md §4, SEC-09/11). Runs in middleware, before
 * the route handler, on /api/ask only (ENG §6). Two independent sliding windows
 * (per-minute, per-day) from config (RAG-19). Exceeding either returns a typed
 * 429 with the ui-ux-spec §8 copy and a `Retry-After` header. The layer *fails
 * open*: if Upstash is unreachable, the request proceeds (logged) because the
 * global spend cap (lib/spend.ts) still bounds the damage. Availability wins
 * here; the wallet is defended by the fail-closed cap, not this layer.
 */

const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

const perMinute = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(appConfig.rateLimit.perMinute, "1 m"),
  prefix: "rl:min",
});

const perDay = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(appConfig.rateLimit.perDay, "1 d"),
  prefix: "rl:day",
});

/** Best-effort client IP; the first x-forwarded-for hop, or a local fallback. */
function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "127.0.0.1";
}

function tooManyRequests(resetMs: number): NextResponse {
  const retryAfter = Math.max(1, Math.ceil((resetMs - Date.now()) / 1000));
  return new NextResponse(
    JSON.stringify({
      error: {
        type: "rate_limited",
        message:
          "You've hit the request limit for now. It resets within a minute; the daily limit resets at midnight UTC.",
      },
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Retry-After": String(retryAfter),
      },
    },
  );
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const ip = clientIp(req);
  try {
    const [minute, day] = await Promise.all([
      perMinute.limit(ip),
      perDay.limit(ip),
    ]);
    if (!minute.success) return tooManyRequests(minute.reset);
    if (!day.success) return tooManyRequests(day.reset);
  } catch (err) {
    // SEC-09: fail open. Upstash unreachable must not take the endpoint down;
    // the global spend cap still bounds cost. Logged when open.
    console.error(
      "rate limiter unavailable; failing open:",
      err instanceof Error ? err.message : "unknown error",
    );
  }
  return NextResponse.next();
}

// ENG §6: middleware runs on /api/ask only.
export const config = {
  matcher: "/api/ask",
};
