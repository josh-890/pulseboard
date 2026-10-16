import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// Photo marks (2026-10-16): iconic, ★ and outtake toggled from a tile on hover,
// from the lightbox (buttons and the keys , . -) and for a grid selection. The
// set + session are created here ("Test Set …", so e2e/cleanup-test-data.ts
// also catches a leftover) and removed afterwards.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36);
const setId = `e2e-set-marks-${RUN}`;
const sessionId = `e2e-session-marks-${RUN}`;
const media: string[] = [];

async function marksOf(mediaItemId: string) {
  const r = await db.query<{ slug: string }>(
    `SELECT d.slug FROM media_item_tag t JOIN tag_definition d ON d.id = t."tagDefinitionId"
     WHERE t."mediaItemId" = $1 AND d.slug IN ('iconic', 'outtake') ORDER BY d.slug`,
    [mediaItemId],
  );
  const fav = await db.query<{ isFavorite: boolean }>(`SELECT "isFavorite" FROM "MediaItem" WHERE id = $1`, [mediaItemId]);
  return { tags: r.rows.map((x) => x.slug), favorite: fav.rows[0]?.isFavorite ?? false };
}

test.beforeAll(async ({ request }) => {
  await db.connect();
  await db.query(`INSERT INTO "Session" (id, name, "updatedAt") VALUES ($1, $2, now())`, [sessionId, `Test Session marks ${RUN}`]);
  await db.query(`INSERT INTO "Set" (id, type, title, "updatedAt") VALUES ($1, 'photo', $2, now())`, [setId, `Test Set marks ${RUN}`]);
  await db.query(`INSERT INTO "SetSession" ("setId", "sessionId", "isPrimary") VALUES ($1, $2, true)`, [setId, sessionId]);
  const photo = readFileSync(path.join(__dirname, "fixtures/test-photo.jpg"));
  for (let i = 0; i < 2; i++) {
    // Different bytes per upload, so the duplicate check lets both in
    const buffer = Buffer.concat([photo, Buffer.from(`${RUN}-${i}`)]);
    const res = await request.post("/api/media/upload", {
      multipart: { file: { name: `marks-${RUN}-${i}.jpg`, mimeType: "image/jpeg", buffer }, sessionId, setId },
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

test.describe.serial("Photo marks", () => {
  test("a tile marks on hover without opening the photo, and the mark stays", async ({ page }) => {
    await page.goto(`/sets/${setId}`);
    const tile = page.getByRole("button", { name: "Gallery image" }).first();
    await tile.hover();
    await tile.getByRole("button", { name: "Iconic (not set)" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(async () => (await marksOf(media[0])).tags.length + (await marksOf(media[1])).tags.length).toBe(1);

    await page.reload();
    await expect(page.getByRole("button", { name: "Iconic (set)" })).toHaveCount(1);
  });

  test("the lightbox toggles with , . - and its buttons", async ({ page }) => {
    await page.goto(`/sets/${setId}`);
    await page.getByRole("button", { name: "Gallery image" }).nth(1).click();
    const iconic = page.getByRole("button", { name: /^Iconic/ }).and(page.locator('[title="Iconic (,)"]'));
    const outtake = page.locator('button[title="Outtake (-)"]');
    const favorite = page.locator('button[title="Favorite (.)"]');
    await expect(outtake).toHaveAttribute("aria-pressed", "false");

    await page.keyboard.press("-");
    await expect(outtake).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press(".");
    await expect(favorite).toHaveAttribute("aria-pressed", "true");
    const before = await iconic.getAttribute("aria-pressed");
    await page.keyboard.press(",");
    await expect(iconic).not.toHaveAttribute("aria-pressed", before ?? "");

    // And off again with a click
    await outtake.click();
    await expect(outtake).toHaveAttribute("aria-pressed", "false");
    await favorite.click();
    await expect(favorite).toHaveAttribute("aria-pressed", "false");
  });

  test("a selection is marked at once from the bulk bar", async ({ page }) => {
    await page.goto(`/sets/${setId}`);
    const select = page.getByRole("button", { name: "Select", exact: true });
    await select.nth(0).click();
    await select.nth(0).click(); // the first is now "Deselect"; the next "Select" is the second tile
    const bulkOuttake = page.getByRole("button", { name: "Outtake", exact: true });
    await expect(bulkOuttake).toHaveAttribute("aria-pressed", "false");
    await bulkOuttake.click();
    await expect(bulkOuttake).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => [(await marksOf(media[0])).tags, (await marksOf(media[1])).tags].every((t) => t.includes("outtake"))).toBe(true);
  });
});
