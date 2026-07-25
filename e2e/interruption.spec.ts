import { test, expect } from "@playwright/test";
import { mockAsk, ask } from "./fixtures/sse";

// PERF-09: the stream ends without `done` -> partial text preserved + retry.
test("PERF-09: mid-stream kill preserves partial text and offers retry", async ({
  page,
}) => {
  await mockAsk(page, "interrupted");
  await page.goto("/");
  await ask(page, "Can hooks block a tool call before it runs?");

  await expect(page.getByText(/The answer was interrupted/)).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByText(/PreToolUse hook runs before/)).toBeVisible();
});
