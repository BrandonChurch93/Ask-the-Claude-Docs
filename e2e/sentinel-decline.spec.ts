import { test, expect } from "@playwright/test";
import { mockAsk, ask } from "./fixtures/sse";

// The youngest state: a model-side decline. Renders as a decline but CARRIES its
// sources module (ruling 1) with a real generation receipt (ruling 3).
test("sentinel decline: decline + sources module + generation receipt", async ({
  page,
}) => {
  await mockAsk(page, "sentinel");
  await page.goto("/");
  await ask(page, "What is the airspeed velocity of an unladen swallow?");

  await expect(
    page.getByText("The Claude Code documentation doesn't cover this.").first(),
  ).toBeVisible({ timeout: 15000 });

  // Ruling 3: the receipt reads "declined" with a real dollar cost (not "embedding
  // only"), and its presence proves the sources module rendered (ruling 1).
  await expect(page.getByText(/declined · \d+ ms · \$/)).toBeVisible();
  await expect(page.getByText(/embedding only/)).toHaveCount(0);
});
