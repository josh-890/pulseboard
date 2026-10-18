import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// Back to the source (2026-10-18): a photo viewed in Favorites shows the set it
// comes from; the link — or O — opens that set with the viewer on the same
// photo, and closing it leaves the photo in view. The set + session are created
// here ("Test Set …", so e2e/cleanup-test-data.ts also catches a leftover).

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36);
const setId = `e2e-set-origin-${RUN}`;
const sessionId = `e2e-session-origin-${RUN}`;
const setTitle = `Test Set origin ${RUN}`;
const media: { id: string; filename: string }[] = [];

test.beforeAll(async ({ request }) => {
  await db.connect();
  await db.query(`INSERT INTO "Session" (id, name, "updatedAt") VALUES ($1, $2, now())`, [sessionId, `Test Session origin ${RUN}`]);
  await db.query(`INSERT INTO "Set" (id, type, title, "updatedAt") VALUES ($1, 'photo', $2, now())`, [setId, setTitle]);
  await db.query(`INSERT INTO "SetSession" ("setId", "sessionId", "isPrimary") VALUES ($1, $2, true)`, [setId, sessionId]);
  const photo = readFileSync(path.join(__dirname, "fixtures/test-photo.jpg"));
  for (let i = 0; i < 3; i++) {
    const filename = `origin-${RUN}-${i}.jpg`;
    const res = await request.post("/api/media/upload", {
      multipart: { file: { name: filename, mimeType: "image/jpeg", buffer: Buffer.concat([photo, Buffer.from(`${RUN}-${i}`)]) }, sessionId, setId },
    });
    expect(res.status()).toBe(201);
    media.push({ id: (await res.json()).mediaItem.id, filename });
  }
  // The middle one is the favorite we come back from
  await db.query(`UPDATE "MediaItem" SET "isFavorite" = true WHERE id = $1`, [media[1].id]);
});

test.afterAll(async () => {
  const ids = media.map((m) => m.id);
  await db.query(`DELETE FROM "SetMediaItem" WHERE "setId" = $1`, [setId]);
  await db.query(`DELETE FROM "MediaItem" WHERE id = ANY($1::text[])`, [ids]);
  await db.query(`DELETE FROM "SetSession" WHERE "setId" = $1`, [setId]);
  await db.query(`DELETE FROM "Set" WHERE id = $1`, [setId]);
  await db.query(`DELETE FROM "Session" WHERE id = $1`, [sessionId]);
  await db.end();
});

test("a favorite leads back to its set, opened on the same photo", async ({ page, request }) => {
  const fav = media[1];
  const origin = await (await request.get(`/api/media/${fav.id}/origin`)).json();
  expect(origin.sets).toEqual([{ id: setId, title: setTitle, type: "photo" }]);

  await page.goto("/favorites");
  await page.locator(`[data-media-id="${fav.id}"]`).click();
  const bar = page.getByRole("toolbar", { name: "Photo tools" });
  const back = bar.getByRole("link", { name: `Open in set: ${setTitle}` });
  await expect(back).toHaveAttribute("href", `/sets/${setId}?photo=${fav.id}`);

  // The info panel lists it too
  await bar.getByRole("button", { name: "Info panel" }).click();
  await expect(page.getByRole("dialog").getByRole("link", { name: setTitle, exact: true })).toBeVisible();

  await page.keyboard.press("o");
  await expect(page).toHaveURL(new RegExp(`/sets/${setId}\\?photo=${fav.id}$`));
  await expect(page.getByRole("toolbar", { name: "Photo tools" }).getByTitle(fav.filename)).toBeVisible();
  // In its own set there is no way "back" to show
  await expect(page.getByRole("toolbar", { name: "Photo tools" }).getByRole("link", { name: /^Open in set/ })).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Media lightbox" })).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/sets/${setId}$`));
  await expect(page.locator(`[data-media-id="${fav.id}"]`)).toBeFocused();
});
