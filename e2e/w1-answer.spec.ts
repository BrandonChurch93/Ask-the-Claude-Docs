import { test, expect } from "@playwright/test";
import { mockAsk, ask } from "./fixtures/sse";

// W1 (success-criteria §2): ask -> cited answer -> click a citation -> the source.
test("W1: ask, cited answer, citation opens + focuses its source", async ({
  page,
}) => {
  await mockAsk(page, "settled");
  await page.goto("/");
  await ask(page, "Can hooks block a tool call before it runs?");

  const marker = page.getByRole("link", { name: /^Source 1:/ });
  await expect(marker).toBeVisible({ timeout: 15000 });

  await marker.click();
  const head = page.getByRole("button", { name: /sources retrieved/i });
  await expect(head).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("read at code.claude.com").first()).toBeVisible();
});
