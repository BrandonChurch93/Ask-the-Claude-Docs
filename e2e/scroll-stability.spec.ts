import { test, expect } from "@playwright/test";
import { mockAsk, ask } from "./fixtures/sse";

// PERF-14: streaming never shifts previously painted content. Reduced motion makes
// the turn-arrival scroll instant, so the question heading settles immediately and
// must not move as the answer grows below it.
test("PERF-14: content above the stream point does not shift", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockAsk(page, "settled");
  await page.goto("/");
  await ask(page, "Can hooks block a tool call before it runs?");

  const heading = page.getByRole("heading", { name: /Can hooks block/ });
  await expect(heading).toBeVisible({ timeout: 15000 });
  const y1 = (await heading.boundingBox())?.y ?? -1;

  await expect(page.getByRole("link", { name: /^Source 1:/ })).toBeVisible();
  const y2 = (await heading.boundingBox())?.y ?? -2;

  expect(Math.abs(y1 - y2)).toBeLessThan(2);
});
