import { describe, it, expect } from "vitest";
import { formatRelativeTime } from "./time";

const base = new Date("2026-07-24T16:00:00Z");
const ago = (ms: number) => new Date(base.getTime() - ms);

describe("formatRelativeTime (§3 eyebrow)", () => {
  it("buckets into just now / minutes / hours / days / weeks", () => {
    expect(formatRelativeTime(ago(30_000), base)).toBe("just now");
    expect(formatRelativeTime(ago(5 * 60_000), base)).toBe("5m ago");
    expect(formatRelativeTime(ago(14 * 3600_000), base)).toBe("14h ago");
    expect(formatRelativeTime(ago(3 * 86_400_000), base)).toBe("3d ago");
    expect(formatRelativeTime(ago(10 * 86_400_000), base)).toBe("1w ago");
  });
  it("treats a future or equal timestamp as just now", () => {
    expect(formatRelativeTime(new Date(base.getTime() + 5000), base)).toBe(
      "just now",
    );
    expect(formatRelativeTime(base, base)).toBe("just now");
  });
});
