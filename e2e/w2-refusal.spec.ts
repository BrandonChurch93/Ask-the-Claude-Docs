import { test, expect } from "@playwright/test";
import { mockAsk, ask } from "./fixtures/sse";

// W2 (success-criteria §2): off-corpus -> refusal anatomy -> a chip asks its topic.
test("W2: refusal anatomy + a coverage chip submits its topic", async ({
  page,
}) => {
  await mockAsk(page, "refusal");
  await page.goto("/");
  await ask(page, "What is the best recipe for pizza dough?");

  await expect(
    page.getByText("The Claude Code documentation doesn't cover this.").first(),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/embedding only/)).toBeVisible();
  await expect(page.getByText("The corpus does cover")).toBeVisible();

  const chip = page
    .locator('p:has-text("The corpus does cover") ~ button')
    .first();
  await chip.click();
  await expect(
    page.getByRole("heading", { name: /^Tell me about / }),
  ).toBeVisible();
});
