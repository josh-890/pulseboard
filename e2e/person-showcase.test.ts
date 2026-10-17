import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

const BASE = "http://localhost:3000";

// The Overview showcase (2026-10-16): a mosaic of the person's best photos that
// opens the lightbox and a full-screen slideshow, and "Known for" set posters.
// The person is discovered from the staging API (people with work); the specs
// skip when none of them has photos.

async function candidatePeople(request: APIRequestContext): Promise<string[]> {
  const res = await request.get(`${BASE}/api/staging-sets?limit=100`);
  if (!res.ok()) return [];
  const items = (await res.json()).items as Array<{ subjectPersonId: string | null }>;
  return [...new Set(items.map((i) => i.subjectPersonId).filter((x): x is string => !!x))].slice(0, 8);
}

// The first candidate whose Overview has a showcase
async function openShowcase(page: Page, request: APIRequestContext): Promise<boolean> {
  for (const id of await candidatePeople(request)) {
    await page.goto(`/people/${id}`);
    if (await page.locator("#showcase-title").count()) return true;
  }
  return false;
}

test.describe("Person showcase", () => {
  test("a tile opens the lightbox; the slideshow plays, pauses, steps and closes", async ({ page, request }) => {
    test.skip(!(await openShowcase(page, request)), "No person with photos in the dataset");

    const tiles = page.locator('section[aria-labelledby="showcase-title"] button[aria-label^="Open photo"]');
    await expect(tiles.first()).toBeVisible();
    const total = Number((await tiles.first().getAttribute("aria-label"))?.match(/of (\d+)/)?.[1]);

    // A tile → the lightbox over the whole pool
    await tiles.first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // ▶ → full screen; Space pauses, → steps, Esc closes and focus goes back
    const play = page.getByRole("button", { name: "Slideshow" });
    await play.click();
    const show = page.getByRole("dialog", { name: /^Slideshow/ });
    await expect(show).toBeVisible();
    await expect(show.getByText(`1 / ${total}`)).toBeVisible();
    await page.keyboard.press("Space");
    await expect(show.getByRole("button", { name: /^Play/ })).toBeVisible();
    if (total > 1) {
      await page.keyboard.press("ArrowRight");
      await expect(show.getByText(`2 / ${total}`)).toBeVisible();
    }
    await page.keyboard.press("Escape");
    await expect(show).toHaveCount(0);
    await expect(play).toBeFocused();
  });

  test("opens in Random; Shuffle deals again; Best loads on demand; Random comes back as left; nothing shifts", async ({ page, request }) => {
    test.skip(!(await openShowcase(page, request)), "No person with photos in the dataset");
    const imgs = page.locator('section[aria-labelledby="showcase-title"] button[aria-label^="Open photo"] img');
    const order = async () => (await imgs.evaluateAll((els) => els.map((e) => e.getAttribute("src")))).join("|");
    const total = Number((await page.locator('section[aria-labelledby="showcase-title"] button[aria-label^="Open photo"]').first().getAttribute("aria-label"))?.match(/of (\d+)/)?.[1]);
    test.skip(total < 10, "Too few photos for a visible shuffle");

    const random = page.getByRole("radio", { name: "Random" });
    const best = page.getByRole("radio", { name: "Best" });
    await expect(random).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText(/^Random from \d+ sets?/)).toBeVisible();
    const first = await order();

    await page.getByRole("button", { name: "Shuffle" }).click();
    await expect.poll(order).not.toBe(first);
    const second = await order();

    // The switch doesn't move: Shuffle stays put in Best
    const shuffleBox = await page.getByRole("button", { name: "Shuffle" }).boundingBox();
    await best.click();
    await expect(best).toHaveAttribute("aria-checked", "true");
    await expect.poll(order).not.toBe(second);
    expect(await page.getByRole("button", { name: "Shuffle" }).boundingBox()).toEqual(shuffleBox);

    await random.click();
    await expect.poll(order).toBe(second);

    // Shuffle from Best goes to Random with a fresh deal
    await best.click();
    await expect.poll(order).not.toBe(second);
    await page.getByRole("button", { name: "Shuffle" }).click();
    await expect(random).toHaveAttribute("aria-checked", "true");
    await expect.poll(order).not.toBe(second);
  });

  test("Known for links to a set", async ({ page, request }) => {
    test.skip(!(await openShowcase(page, request)), "No person with photos in the dataset");
    const poster = page.locator('section[aria-labelledby="known-for-title"] a').first();
    test.skip(!(await poster.count()), "This person has no sets");
    const href = await poster.getAttribute("href");
    expect(href).toMatch(/^\/sets\/.+/);
    await poster.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  });
});
