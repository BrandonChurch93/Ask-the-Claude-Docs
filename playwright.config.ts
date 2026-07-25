import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright e2e config (engineering-standards §8). Chromium-only, a deliberate
 * scope (Brandon, P6.1): SSE cross-engine risk is covered by the manual
 * Safari/VoiceOver walkthroughs at P7.4/P8.3. Tests intercept /api/ask with canned
 * SSE (page.route) so the golden paths run against real UI with zero model spend
 * (ENG-17). The webServer runs the production build; locally it reuses a running
 * dev server if one is up.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    video: process.env.CI ? "on-first-retry" : "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
