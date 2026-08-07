import { test, expect, type Page } from "@playwright/test";
import { mockAsk, ask } from "./fixtures/sse";

/**
 * ui-ux-spec §14 / accessibility reflow: nothing horizontal-scrolls at a
 * 320px-equivalent viewport, in any state.
 *
 * Regression guard for the P7.0 finding: the header laid the wordmark and all
 * five nav controls in one unwrapped flex row, overflowing the document by
 * 57px at 320px and 17px at 360px.
 */
async function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const offenders: string[] = [];
    for (const el of document.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > doc.clientWidth + 1) {
        offenders.push(
          `${el.tagName}.${String(el.className).slice(0, 40)} right=${Math.round(r.right)}`,
        );
      }
    }
    return { overflow: doc.scrollWidth - doc.clientWidth, offenders };
  });
}

test.use({ viewport: { width: 320, height: 720 } });

test("§14: landing does not horizontal-scroll at 320px", async ({ page }) => {
  await page.goto("/");
  const r = await horizontalOverflow(page);
  expect(r.offenders).toEqual([]);
  expect(r.overflow).toBe(0);
});

const STATES = [
  {
    state: "settled" as const,
    question: "Can hooks block a tool call before it runs?",
    settledMarker: /sources/i,
  },
  {
    state: "refusal" as const,
    question: "What is the best recipe for pizza dough?",
    settledMarker: null,
  },
];

for (const { state, question, settledMarker } of STATES) {
  test(`§14: ${state} state does not horizontal-scroll at 320px`, async ({
    page,
  }) => {
    await mockAsk(page, state);
    await page.goto("/");
    await ask(page, question);
    if (settledMarker) {
      await expect(
        page.getByRole("button", { name: settledMarker }),
      ).toBeVisible({ timeout: 15000 });
    } else {
      await expect(page.getByText(/embedding only/)).toBeVisible({
        timeout: 15000,
      });
    }
    const r = await horizontalOverflow(page);
    expect(r.offenders).toEqual([]);
    expect(r.overflow).toBe(0);
  });
}

test("UX-11: the retrieval toggle is absent below 1120px, present above", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1119, height: 800 });
  await page.goto("/");
  const toggle = page.getByRole("button", { name: /retrieval details/i });
  await expect(toggle).toBeHidden();

  await page.setViewportSize({ width: 1121, height: 800 });
  await expect(toggle).toBeVisible();
});

test("A11Y-10: header pointer targets are at least 24px", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const targets = page.locator("header nav a, header nav button");
  const n = await targets.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const box = await targets.nth(i).boundingBox();
    if (!box) continue;
    expect(box.height).toBeGreaterThanOrEqual(24);
  }
});
