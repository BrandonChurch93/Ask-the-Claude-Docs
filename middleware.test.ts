import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Upstash so the limiter logic is tested without a network call (ENG-17).
// The single shared limit() mock is consumed in call order: perMinute first,
// then perDay (middleware runs them via Promise.all in that array order).
const { limitMock, slidingWindowMock } = vi.hoisted(() => ({
  limitMock: vi.fn(),
  slidingWindowMock: vi.fn(() => ({})),
}));

vi.mock("@upstash/redis", () => ({ Redis: class {} }));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: Object.assign(
    class {
      limit = limitMock;
    },
    { slidingWindow: slidingWindowMock },
  ),
}));

import { middleware, config as middlewareConfig } from "./middleware";
import { NextRequest } from "next/server";

function req(ip = "1.2.3.4"): NextRequest {
  return new NextRequest("http://localhost/api/ask", {
    headers: { "x-forwarded-for": ip },
  });
}

const ok = { success: true, reset: Date.now() + 60_000 };

beforeEach(() => {
  limitMock.mockReset();
});

describe("per-IP rate limiter middleware (SEC-09/11)", () => {
  it("only guards /api/ask (ENG §6 matcher)", () => {
    expect(middlewareConfig.matcher).toBe("/api/ask");
  });

  it("passes the request through when under both windows", async () => {
    limitMock.mockResolvedValueOnce(ok).mockResolvedValueOnce(ok);
    const res = await middleware(req());
    expect(res.status).not.toBe(429);
    expect(res.headers.get("x-middleware-next")).toBe("1"); // NextResponse.next()
  });

  it("returns a typed 429 with Retry-After when the per-minute window is exceeded", async () => {
    const reset = Date.now() + 30_000;
    limitMock
      .mockResolvedValueOnce({ success: false, reset })
      .mockResolvedValueOnce(ok);
    const res = await middleware(req());
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as { error: { type: string } };
    expect(body.error.type).toBe("rate_limited");
  });

  it("returns 429 when the per-day window is exceeded", async () => {
    limitMock
      .mockResolvedValueOnce(ok)
      .mockResolvedValueOnce({ success: false, reset: Date.now() + 3_600_000 });
    const res = await middleware(req());
    expect(res.status).toBe(429);
  });

  it("fails OPEN when Upstash is unreachable (SEC-09)", async () => {
    limitMock.mockRejectedValue(new Error("upstash unreachable"));
    const res = await middleware(req());
    expect(res.status).not.toBe(429); // request proceeds
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
