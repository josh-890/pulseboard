import "dotenv/config";
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// The cover check (ADR-0040 addendum): a set whose automatic cover is Title-c1
// while Title-c is there is listed, pre-ticked, current cover → cover art.
// Read-only here — Apply would also touch the other sets listed (tested in vitest).

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const SESSION = `e2e-session-cck-${RUN}`;
const SET = `e2e-set-cck-${RUN}`;
const m = (k: string) => `${SESSION}-${k}`;

test.beforeAll(async () => {
  await db.connect();
  await db.query(`INSERT INTO "Session" (id, name, "updatedAt") VALUES ($1, $2, now())`, [SESSION, `Test Session cck ${RUN}`]);
  await db.query(`INSERT INTO "Set" (id, type, title, "updatedAt") VALUES ($1, 'photo', $2, now())`, [SET, `Test Cover Check ${RUN}`]);
  await db.query(`INSERT INTO "SetSession" ("setId", "sessionId", "isPrimary") VALUES ($1, $2, true)`, [SET, SESSION]);
  for (const [k, name] of [["c", `Test ${RUN} - c.jpg`], ["c1", `Test ${RUN} - c1.jpg`]]) {
    await db.query(
      `INSERT INTO "MediaItem" (id, "sessionId", "mediaType", filename, "mimeType", size, "originalWidth", "originalHeight", "fileRef", role, "updatedAt")
       VALUES ($1, $2, 'PHOTO', $3, 'image/jpeg', 1, 600, 900, 'e2e/none.jpg', 'COVER_ART', now())`,
      [m(k), SESSION, name],
    );
    await db.query(`INSERT INTO "SetMediaItem" ("setId", "mediaItemId", "sortOrder") VALUES ($1, $2, 0)`, [SET, m(k)]);
  }
  await db.query(`UPDATE "Set" SET "coverMediaItemId" = $1 WHERE id = $2`, [m("c1"), SET]);
});

test.afterAll(async () => {
  await db.query(`UPDATE "Set" SET "coverMediaItemId" = NULL WHERE id = $1`, [SET]);
  await db.query(`DELETE FROM "SetMediaItem" WHERE "setId" = $1`, [SET]);
  await db.query(`DELETE FROM "MediaItem" WHERE "sessionId" = $1`, [SESSION]);
  await db.query(`DELETE FROM "SetSession" WHERE "sessionId" = $1`, [SESSION]);
  await db.query(`DELETE FROM "Set" WHERE id = $1`, [SET]);
  await db.query(`DELETE FROM "Session" WHERE id = $1`, [SESSION]);
  await db.end();
});

test("a -c1 cover next to -c is listed, pre-ticked", async ({ page }) => {
  await page.goto("/settings/system/cover-check");
  const row = page.locator(`[data-testid="cover-check-row"][data-set-id="${SET}"]`);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("cover-check-group-variant").locator(`[data-set-id="${SET}"]`)).toBeVisible();
  await expect(row.getByRole("checkbox")).toBeChecked();
  await expect(row).toContainText(`Test ${RUN} - c1.jpg`);
  await expect(row).toContainText(`Test ${RUN} - c.jpg`);
  await expect(row).toContainText("becomes the cover");
});
