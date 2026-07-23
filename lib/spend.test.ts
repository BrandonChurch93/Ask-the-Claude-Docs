import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Upstash Redis client so the spend logic is tested without a network
// call (ENG-17). incrbyfloat/expire are controllable per test.
const { incrbyfloatMock, expireMock } = vi.hoisted(() => ({
  incrbyfloatMock: vi.fn(),
  expireMock: vi.fn(),
}));

vi.mock("@upstash/redis", () => ({
  Redis: class {
    incrbyfloat = incrbyfloatMock;
    expire = expireMock;
  },
}));

import { isSpendCapReached, recordSpend } from "./spend";
import { config } from "./config";

const NOW = new Date("2026-07-23T12:00:00.000Z");
const KEY = "spend:2026-07-23";

beforeEach(() => {
  incrbyfloatMock.mockReset();
  expireMock.mockReset();
  expireMock.mockResolvedValue(1);
});

describe("isSpendCapReached (SEC-10)", () => {
  it("reads via INCRBYFLOAT 0 (read + writability proof) on the UTC-day key", async () => {
    incrbyfloatMock.mockResolvedValue(0);
    await isSpendCapReached(NOW);
    expect(incrbyfloatMock).toHaveBeenCalledWith(KEY, 0);
  });

  it("is false below the cap, true at or above it", async () => {
    incrbyfloatMock.mockResolvedValue(config.spend.dailyCapUsd - 0.01);
    expect(await isSpendCapReached(NOW)).toBe(false);

    incrbyfloatMock.mockResolvedValue(config.spend.dailyCapUsd);
    expect(await isSpendCapReached(NOW)).toBe(true);

    incrbyfloatMock.mockResolvedValue(config.spend.dailyCapUsd + 1.23);
    expect(await isSpendCapReached(NOW)).toBe(true);
  });

  it("propagates a counter read error so the caller can fail closed", async () => {
    incrbyfloatMock.mockRejectedValue(new Error("upstash down"));
    await expect(isSpendCapReached(NOW)).rejects.toThrow("upstash down");
  });
});

describe("recordSpend (SEC-10)", () => {
  it("accumulates the real cost and sets a TTL on the day key", async () => {
    incrbyfloatMock.mockResolvedValue(0.003);
    await recordSpend(0.003, NOW);
    expect(incrbyfloatMock).toHaveBeenCalledWith(KEY, 0.003);
    expect(expireMock).toHaveBeenCalledWith(KEY, 60 * 60 * 48);
  });

  it("is a no-op for zero cost (refusals record nothing)", async () => {
    await recordSpend(0, NOW);
    expect(incrbyfloatMock).not.toHaveBeenCalled();
    expect(expireMock).not.toHaveBeenCalled();
  });
});
