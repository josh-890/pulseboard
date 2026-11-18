import "dotenv/config";
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// A click on the hero's cover shows it big: cover art in the cover slot's viewer
// (closing it leaves no sheet behind), a photo in the gallery's viewer.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const SESSION = `e2e-session-hcv-${RUN}`;
const SET = `e2e-set-hcv-${RUN}`;
const m = (k: string) => `${SESSION}-${k}`;

test.describe.configure({ mode: "serial", timeout: 60_000 });

test.beforeAll(async () => {
  await db.connect();
  await db.query(`INSERT INTO "Session" (id, name, "updatedAt") VALUES ($1, $2, now())`, [SESSION, `Test Session hcv ${RUN}`]);
  await db.query(`INSERT INTO "Set" (id, type, title, "updatedAt") VALUES ($1, 'photo', $2, now())`, [SET, `Test Hero Cover ${RUN}`]);
  await db.query(`INSERT INTO "SetSession" ("setId", "sessionId", "isPrimary") VALUES ($1, $2, true)`, [SET, SESSION]);
  for (const [k, role, i] of [["p1", "PHOTO", 1], ["p2", "PHOTO", 2], ["art", "COVER_ART", 3]] as const) {
    await db.query(
      `INSERT INTO "MediaItem" (id, "sessionId", "mediaType", filename, "mimeType", size, "originalWidth", "originalHeight", caption, "fileRef", role, "updatedAt")
       VALUES ($1, $2, 'PHOTO', $3, 'image/jpeg', 1, 600, 900, $4, 'e2e/none.jpg', $5::"MediaRole", now())`,
      [m(k), SESSION, `${m(k)}.jpg`, `Test hero ${k} ${RUN}`, role],
    );
    await db.query(`INSERT INTO "SetMediaItem" ("setId", "mediaItemId", "sortOrder") VALUES ($1, $2, $3)`, [SET, m(k), i]);
  }
});

test.afterAll(async () => {
  await db.query(`UPDATE "Set" SET "coverMediaItemId" = NULL WHERE id = $1`, [SET]);
  await db.query(`DELETE FROM "SetMediaItem" WHERE "setId" = $1`, [SET]);
  await db.query(`DELETE FROM "PersonMediaLink" WHERE "mediaItemId" LIKE $1`, [`${SESSION}-%`]);
  await db.query(`DELETE FROM "MediaItem" WHERE "sessionId" = $1`, [SESSION]);
  await db.query(`DELETE FROM "SetSession" WHERE "sessionId" = $1`, [SESSION]);
  await db.query(`DELETE FROM "Set" WHERE id = $1`, [SET]);
  await db.query(`DELETE FROM "Session" WHERE id = $1`, [SESSION]);
  await db.end();
});

const lightbox = (page: import("@playwright/test").Page) => page.getByRole("dialog", { name: "Media lightbox" });

for (const where of ["set", "session"] as const) {
  test(`${where}: cover art opens in the cover-art viewer`, async ({ page }) => {
    await db.query(`UPDATE "Set" SET "coverMediaItemId" = $1 WHERE id = $2`, [m("art"), SET]);
    await page.goto(where === "set" ? `/sets/${SET}` : `/sessions/${SESSION}`);
    await page.getByTestId("hero-cover").click();
    await expect(lightbox(page)).toBeVisible();
    // The cover-art viewer offers the way back to the photos
    if (!(await lightbox(page).getByRole("button", { name: "Not cover art" }).first().isVisible())) await page.keyboard.press("i");
    await expect(lightbox(page).getByRole("button", { name: "Not cover art" }).locator("visible=true").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(lightbox(page)).toBeHidden();
    await expect(page.getByTestId("cover-art-slot")).toBeHidden();
  });

  test(`${where}: a cover photo opens in the gallery's viewer`, async ({ page }) => {
    await db.query(`UPDATE "Set" SET "coverMediaItemId" = $1 WHERE id = $2`, [m("p2"), SET]);
    await page.goto(where === "set" ? `/sets/${SET}` : `/sessions/${SESSION}`);
    await page.getByTestId("hero-cover").click();
    await expect(lightbox(page)).toBeVisible();
    if (!(await lightbox(page).getByRole("button", { name: "This is cover art" }).first().isVisible())) await page.keyboard.press("i");
    await expect(lightbox(page).getByRole("button", { name: "This is cover art" }).locator("visible=true").first()).toBeVisible();
    await expect(page.getByTestId("cover-art-slot")).toBeHidden();
  });
}
