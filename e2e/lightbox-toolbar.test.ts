import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// The viewer's top bar in three zones (2026-10-17): the mark ladder reads
// Outtake ▸ ★ ▸ Iconic, Copy / Edit / Delete sit in ⋯, `?` shows the keys, X
// toggles the compare tray, ★ stays put between galleries and Close fits a
// phone. The set + session are created here ("Test Set …", so
// e2e/cleanup-test-data.ts also catches a leftover) and removed afterwards.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36);
const setId = `e2e-set-tb-${RUN}`;
const sessionId = `e2e-session-tb-${RUN}`;
const media: string[] = [];

test.beforeAll(async ({ request }) => {
  await db.connect();
  await db.query(`INSERT INTO "Session" (id, name, "updatedAt") VALUES ($1, $2, now())`, [sessionId, `Test Session tb ${RUN}`]);
  await db.query(`INSERT INTO "Set" (id, type, title, "updatedAt") VALUES ($1, 'photo', $2, now())`, [setId, `Test Set tb ${RUN}`]);
  await db.query(`INSERT INTO "SetSession" ("setId", "sessionId", "isPrimary") VALUES ($1, $2, true)`, [setId, sessionId]);
  const photo = readFileSync(path.join(__dirname, "fixtures/test-photo.jpg"));
  for (let i = 0; i < 2; i++) {
    const buffer = Buffer.concat([photo, Buffer.from(`${RUN}-${i}`)]);
    const res = await request.post("/api/media/upload", {
      multipart: { file: { name: `tb-${RUN}-${i}.jpg`, mimeType: "image/jpeg", buffer }, sessionId, setId },
    });
    expect(res.status()).toBe(201);
    media.push((await res.json()).mediaItem.id);
  }
});

test.afterAll(async () => {
  await db.query(`DELETE FROM media_item_tag WHERE "mediaItemId" = ANY($1::text[])`, [media]);
  await db.query(`DELETE FROM "SetMediaItem" WHERE "setId" = $1`, [setId]);
  await db.query(`DELETE FROM "MediaItem" WHERE id = ANY($1::text[])`, [media]);
  await db.query(`DELETE FROM "SetSession" WHERE "setId" = $1`, [setId]);
  await db.query(`DELETE FROM "Set" WHERE id = $1`, [setId]);
  await db.query(`DELETE FROM "Session" WHERE id = $1`, [sessionId]);
  await db.end();
});

async function openViewer(page: Page) {
  await page.goto(`/sets/${setId}`);
  await page.getByRole("button", { name: "Gallery image" }).first().click();
  const bar = page.getByRole("toolbar", { name: "Photo tools" });
  await expect(bar).toBeVisible();
  return bar;
}

test("the mark ladder reads Outtake ▸ ★ ▸ Iconic, and Iconic fills it", async ({ page }) => {
  const bar = await openViewer(page);
  const ladder = bar.getByRole("group", { name: "Marks" });
  const buttons = ladder.getByRole("button");
  await expect(buttons).toHaveCount(3);
  expect(await buttons.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).toEqual(["Outtake", "Favorite", "Iconic"]);

  const iconic = ladder.getByRole("button", { name: "Iconic" });
  await expect(iconic).not.toHaveAttribute("aria-disabled", "true"); // the mark tags have loaded
  await iconic.click();
  for (const b of await buttons.all()) await expect(b).toHaveAttribute("aria-pressed", "true");
  await ladder.getByRole("button", { name: "Outtake" }).click();
  for (const b of await buttons.all()) await expect(b).toHaveAttribute("aria-pressed", "false");
});

test("⋯ holds Copy, Edit and Delete; Delete asks; Esc closes only the menu", async ({ page }) => {
  const bar = await openViewer(page);
  const more = bar.getByRole("button", { name: "More photo actions" });
  await more.click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: /Copy to reference session/ })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Edit/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(bar).toBeVisible();

  await more.click();
  await page.getByRole("menuitem", { name: /Delete/ }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(confirm).toHaveCount(0);
  await expect(bar).toBeVisible();
});

test("? opens the shortcuts; Esc closes them, not the viewer; X toggles the compare tray", async ({ page }) => {
  const bar = await openViewer(page);
  await page.keyboard.press("?");
  const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Compare tray — add / remove")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(bar).toBeVisible();

  const compare = bar.getByRole("button", { name: "Compare tray", exact: true });
  await expect(compare).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("x");
  await expect(compare).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("x");
  await expect(compare).toHaveAttribute("aria-pressed", "false");
});

test("★ sits in the same place in a set and in Favorites", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await db.query(`UPDATE "MediaItem" SET "isFavorite" = true WHERE id = $1`, [media[0]]);
  try {
    const setBar = await openViewer(page);
    const inSet = await setBar.getByRole("group", { name: "Marks" }).getByRole("button", { name: "Favorite" }).boundingBox();

    await page.goto("/favorites");
    // Any favorite will do — ours is one, so the gallery isn't empty
    await page.locator("main").getByRole("button").filter({ has: page.locator("img") }).first().click();
    const favBar = page.getByRole("toolbar", { name: "Photo tools" });
    await expect(favBar).toBeVisible();
    const inFavorites = await favBar.getByRole("group", { name: "Marks" }).getByRole("button", { name: "Favorite" }).boundingBox();
    expect(inFavorites).toEqual(inSet);
    // Delete doesn't apply in Favorites: still listed, disabled
    await favBar.getByRole("button", { name: "More photo actions" }).click();
    await expect(page.getByRole("menuitem", { name: /Delete/ })).toHaveAttribute("aria-disabled", "true");
  } finally {
    await db.query(`UPDATE "MediaItem" SET "isFavorite" = false WHERE id = $1`, [media[0]]);
  }
});

test("on a phone the bar fits and Close is on screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const bar = await openViewer(page);
  const close = bar.getByRole("button", { name: "Close" });
  const box = await close.boundingBox();
  expect(box && box.x + box.width).toBeLessThanOrEqual(390);
  expect(await bar.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await close.click();
  await expect(bar).toHaveCount(0);
});
