import { test, expect, type Page } from "@playwright/test";

// Regression: the archive workspace list used `useWindowVirtualizer`, but the
// app scrolls `<main id="app-scroll">` (the window never scrolls). The
// virtualized window therefore froze at scrollY=0 — scrolling revealed blank
// space and infinite-scroll never advanced. Fixed by binding the virtualizer
// to `#app-scroll` (useVirtualizer + getScrollElement + measured scrollMargin).
//
// This spec drives the real symptom: switch to the flat (paginated) view,
// scroll the container down, and assert rendered rows actually occupy the
// viewport (pre-fix: zero rows visible after scrolling). Skips when the dataset
// has too few archive folders to produce a scrollable list.

type ScrollProbe = {
  scrollHeight: number;
  clientHeight: number;
  renderedRows: number;
  firstRow: string;
  visibleInViewport: number;
};

async function probe(page: Page): Promise<ScrollProbe> {
  return page.evaluate(() => {
    const main = document.getElementById("app-scroll")!;
    const candidates = Array.from(
      main.querySelectorAll<HTMLElement>('div[style*="position: relative"]'),
    );
    const listEl = candidates
      .map((el) => ({ el, h: parseFloat(el.style.height) || 0 }))
      .sort((a, b) => b.h - a.h)[0]?.el;
    const rows = listEl ? Array.from(listEl.children) : [];
    const mainRect = main.getBoundingClientRect();
    const visible = rows.filter((r) => {
      const rr = r.getBoundingClientRect();
      return rr.bottom > mainRect.top && rr.top < mainRect.bottom;
    });
    return {
      scrollHeight: main.scrollHeight,
      clientHeight: main.clientHeight,
      renderedRows: rows.length,
      firstRow: (rows[0]?.textContent || "").trim().slice(0, 40),
      visibleInViewport: visible.length,
    };
  });
}

test.describe("Archive workspace virtualized scroll", () => {
  test("scrolling the container advances the virtualized window (rows stay visible)", async ({
    page,
  }) => {
    await page.goto("/archive");
    await page.waitForLoadState("networkidle");

    // Switch grouping to the flat, paginated view (groupBy = none).
    const groupSelect = page
      .locator("select")
      .filter({ has: page.locator('option[value="none"]') })
      .first();
    if ((await groupSelect.count()) === 0) {
      test.skip(true, "Archive group control not present");
      return;
    }
    await groupSelect.selectOption("none");
    await page.waitForTimeout(600);

    const before = await probe(page);
    // Need a list at least ~2 viewports tall to meaningfully scroll.
    if (before.scrollHeight < before.clientHeight * 2 || before.renderedRows === 0) {
      test.skip(true, "Not enough archive folders to produce a scrollable list");
      return;
    }

    // Scroll the app container well past the first screen.
    const target = Math.min(7000, before.scrollHeight - before.clientHeight - 50);
    await page.evaluate((top) => {
      const main = document.getElementById("app-scroll")!;
      main.scrollTop = top;
      main.dispatchEvent(new Event("scroll", { bubbles: true }));
    }, target);
    await page.waitForTimeout(400);

    const after = await probe(page);

    // The core regression assertion: after scrolling down, rendered rows must
    // still occupy the viewport (pre-fix this was 0 — blank space), and the
    // window must have advanced (top row changed).
    expect(after.visibleInViewport).toBeGreaterThan(0);
    expect(after.firstRow).not.toBe(before.firstRow);
  });
});
