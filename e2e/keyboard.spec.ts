import { test, expect } from "@playwright/test";
import { mockAsk } from "./fixtures/sse";

// W3 (A11Y §3 landing path): skip link first, reaches input + suggestions.
test("W3: keyboard - skip link first, reaches input and a suggestion submits", async ({
  page,
}) => {
  await mockAsk(page, "settled");
  await page.goto("/");

  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to question input" }),
  ).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Ask a question")).toBeFocused();

  const sugg = page
    .getByRole("button", { name: /project instructions/i })
    .first();
  await sugg.focus();
  await sugg.press("Enter");
  await expect(page.getByRole("link", { name: /^Source 1:/ })).toBeVisible({
    timeout: 15000,
  });
});
