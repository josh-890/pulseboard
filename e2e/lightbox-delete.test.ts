import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// Delete from the viewer by keyboard (2026-10-16): Del opens the confirmation with
// "Delete permanently" focused, so Enter deletes; Esc cancels it without closing
// the viewer. The set + session are created here ("Test Set …", so
// e2e/cleanup-test-data.ts also catches a leftover) and removed afterwards.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36);
const setId = `e2e-set-del-${RUN}`;
const sessionId = `e2e-session-del-${RUN}`;
const media: string[] = [];

const exists = async (id: string) => (await db.query(`SELECT 1 FROM "MediaItem" WHERE id = $1`, [id])).rowCount === 1;

test.beforeAll(async ({ request }) => {
  await db.connect();
  await db.query(`INSERT INTO "Session" (id, name, "updatedAt") VALUES ($1, $2, now())`, [sessionId, `Test Session del ${RUN}`]);
  await db.query(`INSERT INTO "Set" (id, type, title, "updatedAt") VALUES ($1, 'photo', $2, now())`, [setId, `Test Set del ${RUN}`]);
  await db.query(`INSERT INTO "SetSession" ("setId", "sessionId", "isPrimary") VALUES ($1, $2, true)`, [setId, sessionId]);
  const photo = readFileSync(path.join(__dirname, "fixtures/test-photo.jpg"));
  for (let i = 0; i < 2; i++) {
    const buffer = Buffer.concat([photo, Buffer.from(`${RUN}-${i}`)]);
    const res = await request.post("/api/media/upload", {
      multipart: { file: { name: `del-${RUN}-${i}.jpg`, mimeType: "image/jpeg", buffer }, sessionId, setId },
    });
    expect(res.status()).toBe(201);
    media.push((await res.json()).mediaItem.id);
  }
});

test.afterAll(async () => {
  await db.query(`DELETE FROM "SetMediaItem" WHERE "setId" = $1`, [setId]);
  await db.query(`DELETE FROM "MediaItem" WHERE id = ANY($1::text[])`, [media]);
  await db.query(`DELETE FROM "SetSession" WHERE "setId" = $1`, [setId]);
  await db.query(`DELETE FROM "Set" WHERE id = $1`, [setId]);
  await db.query(`DELETE FROM "Session" WHERE id = $1`, [sessionId]);
  await db.end();
});

test("Del asks, Esc cancels, Del + Enter deletes the current photo", async ({ page }) => {
  await page.goto(`/sets/${setId}`);
  await page.getByRole("button", { name: "Gallery image" }).first().click();
  await expect(page.getByText(/^1 \/ 2$/)).toBeVisible();

  // Esc closes only the confirmation; the viewer stays open
  await page.keyboard.press("Delete");
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toBeVisible();
  await expect(confirm.getByRole("button", { name: /Delete permanently/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirm).toHaveCount(0);
  await expect(page.getByText(/^1 \/ 2$/)).toBeVisible();
  expect((await Promise.all(media.map(exists))).every(Boolean)).toBe(true);

  // Del + Enter deletes it; the viewer moves on to the other photo
  await page.keyboard.press("Delete");
  await expect(confirm.getByRole("button", { name: /Delete permanently/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(confirm).toHaveCount(0);
  await expect(page.getByText(/^1 \/ 1$/)).toBeVisible();
  await expect.poll(async () => (await Promise.all(media.map(exists))).filter(Boolean).length).toBe(1);
});
