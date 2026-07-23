/**
 * Security response headers (security.md §5; SEC-12/13, ENG-14).
 *
 * Defined here as a single source of truth so next.config applies them and the
 * integration test asserts them against the same values (no drift). Set as
 * static headers in next.config per SEC §5 ("set globally in next.config").
 *
 * CSP note (script-src): Next's prerendered HTML ships a handful of un-nonced
 * inline bootstrap scripts. A nonce would require generating it per-request in
 * middleware on every page route, which conflicts with SEC §5 (CSP lives in
 * next.config) and ENG §6 (middleware is rate-limit-only, /api/ask). So we take
 * SEC §5's sanctioned alternative: the "minimal Next-required inline allowance",
 * i.e. 'unsafe-inline' on script-src. This is not an origin, so SEC-13 (no
 * wildcard/external origins) holds; the XSS vector is closed independently by
 * SEC-06/07 (no dangerouslySetInnerHTML; output rendered only as React text).
 */

// CSP directives (SEC §5). No wildcard and no external origins (SEC-13).
const CSP_DIRECTIVES: Record<string, string> = {
  "default-src": "'self'",
  "script-src": "'self' 'unsafe-inline'", // minimal Next inline allowance (see note)
  "style-src": "'self' 'unsafe-inline'", // CSS Modules inject styles; accepted per SEC §5
  "img-src": "'self' data:",
  "font-src": "'self'", // self-hosted fonts (PERF-04) keep this origin-free
  "connect-src": "'self'", // same-origin SSE to /api/ask
  "frame-ancestors": "'none'",
  "base-uri": "'self'",
  "form-action": "'self'",
};

export const contentSecurityPolicy: string = Object.entries(CSP_DIRECTIVES)
  .map(([directive, value]) => `${directive} ${value}`)
  .join("; ");

/** The header set that ships on every route (SEC-12). */
export const securityHeaders: ReadonlyArray<{ key: string; value: string }> = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), accelerometer=(), gyroscope=(), magnetometer=()",
  },
];

/** Answers must never be cached cross-user by any intermediary (ENG-14). */
export const apiCacheControl: { key: string; value: string } = {
  key: "Cache-Control",
  value: "no-store",
};

/** The Next.js `headers()` configuration: security set globally, no-store on the API. */
export function securityHeadersConfig() {
  return [
    { source: "/:path*", headers: [...securityHeaders] },
    { source: "/api/:path*", headers: [apiCacheControl] },
  ];
}
