import "dotenv/config";
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// Color / B&W (ADR-0041): the /sets Tone filter with counts, the card badge,
// the gallery pill, a correction in the viewer, and the tone check listing.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const SESSION = `e2e-session-tone-${RUN}`;
const SET_MIXED = `e2e-set-tone-mixed-${RUN}`;
const SET_MONO = `e2e-set-tone-mono-${RUN}`;
const TITLE = `Tone ${RUN}`;
const m = (k: string) => `${SESSION}-${k}`;

test.describe.configure({ mode: "serial", timeout: 60_000 });

const PHOTOS: [string, string, "COLOR" | "MONO", number][] = [
  [SET_MIXED, "c1", "COLOR", 21],
  [SET_MIXED, "c2", "COLOR", 18],
  [SET_MIXED, "c3", "COLOR", 5.001], // right at the line — first in the tone check
  [SET_MIXED, "b1", "MONO", 0.1],
  [SET_MIXED, "b2", "MONO", 0.2],
  [SET_MONO, "b3", "MONO", 0.1],
  [SET_MONO, "b4", "MONO", 0.3],
];

test.beforeAll(async () => {
  await db.connect();
  await db.query(`INSERT INTO "Session" (id, name, "updatedAt") VALUES ($1, $2, now())`, [SESSION, `Test Session tone ${RUN}`]);
  for (const [id, t] of [[SET_MIXED, "mixed"], [SET_MONO, "mono"]]) {
    await db.query(`INSERT INTO "Set" (id, type, title, "updatedAt") VALUES ($1, 'photo', $2, now())`, [id, `${TITLE} ${t}`]);
    await db.query(`INSERT INTO "SetSession" ("setId", "sessionId", "isPrimary") VALUES ($1, $2, $3)`, [id, SESSION, id === SET_MIXED]);
  }
  let i = 0;
  for (const [setId, k, tone, chroma] of PHOTOS) {
    i += 1;
    await db.query(
      `INSERT INTO "MediaItem" (id, "sessionId", "mediaType", filename, "mimeType", size, "originalWidth", "originalHeight", "fileRef", tone, chroma, "updatedAt")
       VALUES ($1, $2, 'PHOTO', $3, 'image/jpeg', 1, 600, 900, 'e2e/none.jpg', $4::"MediaTone", $5, now())`,
      [m(k), SESSION, `${m(k)}.jpg`, tone, chroma],
    );
    await db.query(`INSERT INTO "SetMediaItem" ("setId", "mediaItemId", "sortOrder") VALUES ($1, $2, $3)`, [setId, m(k), i]);
  }
  await db.query(`UPDATE "Set" SET "coverMediaItemId" = $1 WHERE id = $2`, [m("c1"), SET_MIXED]);
  await db.query(`UPDATE "Set" SET "coverMediaItemId" = $1 WHERE id = $2`, [m("b3"), SET_MONO]);
});

test.afterAll(async () => {
  await db.query(`UPDATE "Set" SET "coverMediaItemId" = NULL WHERE id = ANY($1)`, [[SET_MIXED, SET_MONO]]);
  await db.query(`DELETE FROM "SetMediaItem" WHERE "setId" = ANY($1)`, [[SET_MIXED, SET_MONO]]);
  await db.query(`DELETE FROM "PersonMediaLink" WHERE "mediaItemId" LIKE $1`, [`${SESSION}-%`]);
  await db.query(`DELETE FROM "MediaItem" WHERE "sessionId" = $1`, [SESSION]);
  await db.query(`DELETE FROM "SetSession" WHERE "sessionId" = $1`, [SESSION]);
  await db.query(`DELETE FROM "Set" WHERE id = ANY($1)`, [[SET_MIXED, SET_MONO]]);
  await db.query(`DELETE FROM "Session" WHERE id = $1`, [SESSION]);
  await db.end();
});

const card = (page: import("@playwright/test").Page, setId: string) => page.locator(`a[href="/sets/${setId}"]`).first();

test("/sets: the Tone filter narrows to mixed or B&W sets and counts them", async ({ page }) => {
  await page.goto(`/sets?q=${encodeURIComponent(TITLE)}`);
  const filter = page.getByTestId("swatch-filter-tone");
  await expect(filter).toBeVisible({ timeout: 30_000 });
  await expect(filter.locator('[data-value="mixed"]')).toContainText("1");
  await expect(filter.locator('[data-value="mono"]')).toContainText("1");
  await expect(filter.locator('[data-value="color"]')).toBeDisabled();

  await filter.locator('[data-value="mixed"]').click();
  await expect(page).toHaveURL(/tone=mixed/);
  await expect(card(page, SET_MIXED)).toBeVisible();
  await expect(card(page, SET_MONO)).toHaveCount(0);
  await expect(filter.locator('[data-value="mixed"]')).toHaveAttribute("aria-pressed", "true");
});

test("/sets: the card badge — a pie for mixed, a grey disc for B&W only", async ({ page }) => {
  await page.goto(`/sets?q=${encodeURIComponent(TITLE)}`);
  const mixed = page.locator(`[data-testid="tone-badge"][data-tone="mixed"]`).filter({ has: page.locator("svg") });
  await expect(page.getByRole("img", { name: "2 of 5 B&W" })).toBeVisible({ timeout: 30_000 });
  await expect(mixed.first()).toBeVisible();
  await expect(page.getByRole("img", { name: "All 2 B&W" })).toBeVisible();
});

test("set gallery: the pill filters, a correction in the viewer keeps the photo in view", async ({ page }) => {
  await page.goto(`/sets/${SET_MIXED}`);
  const pill = page.getByTestId("tone-filter");
  await expect(pill).toBeVisible({ timeout: 30_000 });
  await expect(pill.locator('[data-value="all"]')).toContainText("5");
  await expect(pill.locator('[data-value="COLOR"]')).toContainText("3");
  await expect(pill.locator('[data-value="MONO"]')).toContainText("2");

  await pill.locator('[data-value="MONO"]').click();
  await expect(page.locator("[data-media-id]")).toHaveCount(2);
  await expect(page.locator(`[data-media-id="${m("b1")}"]`)).toBeVisible();

  // Correct b1 to color in the viewer: it stays in view, the counts move
  await page.locator(`[data-media-id="${m("b1")}"]`).click();
  const lightbox = page.getByRole("dialog", { name: "Media lightbox" });
  await expect(lightbox).toBeVisible();
  let tone = lightbox.getByTestId("lightbox-tone").locator("visible=true").first();
  if (!(await tone.isVisible())) {
    await page.keyboard.press("i");
    tone = lightbox.getByTestId("lightbox-tone").locator("visible=true").first();
  }
  await tone.locator('[data-value="COLOR"]').click();
  await expect(tone.locator('[data-value="COLOR"]')).toHaveAttribute("aria-checked", "true");
  await expect(tone.getByRole("button", { name: /by hand/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(pill.locator('[data-value="MONO"]')).toContainText("1");
  await expect(page.locator(`[data-media-id="${m("b1")}"]`)).toBeVisible();

  // The view updates at once; the save follows
  await expect
    .poll(async () => (await db.query(`SELECT tone, "toneIsManual" FROM "MediaItem" WHERE id = $1`, [m("b1")])).rows[0])
    .toEqual({ tone: "COLOR", toneIsManual: true });

  // Choosing again lets the corrected photo go where it belongs
  await pill.locator('[data-value="all"]').click();
  await pill.locator('[data-value="MONO"]').click();
  await expect(page.locator("[data-media-id]")).toHaveCount(1);
});

test("a set with one kind only shows no pill", async ({ page }) => {
  await page.goto(`/sets/${SET_MONO}`);
  await expect(page.locator(`[data-media-id="${m("b3")}"]`)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("tone-filter")).toHaveCount(0);
});

test("the tone check lists the photo at the line first (not saved — dev data)", async ({ page }) => {
  await page.goto("/settings/system/tone-check");
  const first = page.getByTestId("tone-check-item").first();
  await expect(first).toHaveAttribute("data-media-id", m("c3"), { timeout: 30_000 });
  await expect(first).toHaveAttribute("data-tone", "COLOR");
  await first.getByRole("button").first().click();
  await expect(first).toHaveAttribute("data-tone", "MONO");
  await expect(page.getByText("1 changed")).toBeVisible();
});
