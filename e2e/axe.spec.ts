import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockAsk, ask } from "./fixtures/sse";

// axe per surface per state (A11Y gate): zero violations.
test("axe: landing (first visit)", async ({ page }) => {
  await page.goto("/");
  const r = await new AxeBuilder({ page }).analyze();
  expect(r.violations).toEqual([]);
});

test("axe: answer state", async ({ page }) => {
  await mockAsk(page, "settled");
  await page.goto("/");
  await ask(page, "Can hooks block a tool call before it runs?");
  await expect(page.getByRole("link", { name: /^Source 1:/ })).toBeVisible({
    timeout: 15000,
  });
  const r = await new AxeBuilder({ page }).analyze();
  expect(r.violations).toEqual([]);
});

test("axe: refusal state", async ({ page }) => {
  await mockAsk(page, "refusal");
  await page.goto("/");
  await ask(page, "What is the best recipe for pizza dough?");
  await expect(page.getByText("The corpus does cover")).toBeVisible({
    timeout: 15000,
  });
  const r = await new AxeBuilder({ page }).analyze();
  expect(r.violations).toEqual([]);
});

test("axe: /evals", async ({ page }) => {
  await page.goto("/evals");
  const r = await new AxeBuilder({ page }).analyze();
  expect(r.violations).toEqual([]);
});
