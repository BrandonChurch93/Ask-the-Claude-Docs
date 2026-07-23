import { describe, it, expect } from "vitest";
import {
  contentSecurityPolicy,
  securityHeaders,
  securityHeadersConfig,
} from "./security-headers";

// Asserts the exact header set next.config serves (SEC-12/13, ENG-14). This is
// the integration point: next.config imports the same module, so what is tested
// here is what ships on the response. A live-response assertion is added with
// Playwright at P6.1.
describe("security headers", () => {
  const byKey = (key: string) =>
    securityHeaders.find((h) => h.key.toLowerCase() === key.toLowerCase())
      ?.value;

  it("ships the full SEC §5 header set on every route (SEC-12)", () => {
    expect(byKey("Content-Security-Policy")).toBeTruthy();
    expect(byKey("X-Content-Type-Options")).toBe("nosniff");
    expect(byKey("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    const pp = byKey("Permissions-Policy") ?? "";
    expect(pp).toContain("camera=()");
    expect(pp).toContain("microphone=()");
  });

  it("CSP has default-src 'self' and every SEC §5 directive", () => {
    for (const directive of [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ]) {
      expect(contentSecurityPolicy).toContain(directive);
    }
  });

  it("CSP contains no wildcard and no external origins (SEC-13)", () => {
    expect(contentSecurityPolicy).not.toContain("*");
    // No http(s) origins allowed; self-hosting keeps the policy origin-free.
    expect(contentSecurityPolicy).not.toMatch(/https?:\/\//);
  });

  it("applies security headers globally and no-store to the API (ENG-14)", () => {
    const config = securityHeadersConfig();
    const global = config.find((c) => c.source === "/:path*");
    const api = config.find((c) => c.source === "/api/:path*");
    expect(
      global?.headers.some((h) => h.key === "Content-Security-Policy"),
    ).toBe(true);
    expect(api?.headers).toContainEqual({
      key: "Cache-Control",
      value: "no-store",
    });
  });
});
