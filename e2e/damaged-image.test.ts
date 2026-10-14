import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// Damaged image files (2026-10-14). A JPEG cut short ("premature end of JPEG
// image") used to be refused; it is now stored as far as it decodes, flagged
// with a red frame + "damaged" badge, and the lightbox offers "Looks fine" to
// clear the flag. The set + session are created here ("Test Set …", so
// e2e/cleanup-test-data.ts also catches a leftover) and removed afterwards.

// Playwright cannot load the generated Prisma client — plain pg for the fixtures
const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36);
const setId = `e2e-set-${RUN}`;
const sessionId = `e2e-session-${RUN}`;

async function decodeIssueOf(mediaItemId: string): Promise<string | null> {
  const r = await db.query<{ decodeIssue: string | null }>(`SELECT "decodeIssue" FROM "MediaItem" WHERE id = $1`, [mediaItemId]);
  return r.rows[0]?.decodeIssue ?? null;
}

test.beforeAll(async () => {
  await db.connect();
  await db.query(`INSERT INTO "Session" (id, name, "updatedAt") VALUES ($1, $2, now())`, [sessionId, `Test Session damaged ${RUN}`]);
  await db.query(`INSERT INTO "Set" (id, type, title, "updatedAt") VALUES ($1, 'photo', $2, now())`, [setId, `Test Set damaged ${RUN}`]);
  await db.query(`INSERT INTO "SetSession" ("setId", "sessionId", "isPrimary") VALUES ($1, $2, true)`, [setId, sessionId]);
});

test.afterAll(async () => {
  const media = await db.query<{ mediaItemId: string }>(`SELECT "mediaItemId" FROM "SetMediaItem" WHERE "setId" = $1`, [setId]);
  const mediaIds = media.rows.map((m) => m.mediaItemId);
  await db.query(`DELETE FROM "SetMediaItem" WHERE "setId" = $1`, [setId]);
  await db.query(`DELETE FROM "MediaItem" WHERE id = ANY($1::text[])`, [mediaIds]);
  await db.query(`DELETE FROM "SetSession" WHERE "setId" = $1`, [setId]);
  await db.query(`DELETE FROM "Set" WHERE id = $1`, [setId]);
  await db.query(`DELETE FROM "Session" WHERE id = $1`, [sessionId]);
  await db.end();
});

test("a truncated JPEG uploads with a red frame, and Looks fine clears it", async ({ page, request }) => {
  const full = readFileSync(path.join(__dirname, "fixtures/test-photo.jpg"));
  const truncated = full.subarray(0, Math.floor(full.length * 0.6));

  const res = await request.post("/api/media/upload", {
    multipart: {
      file: { name: `damaged-${RUN}.jpg`, mimeType: "image/jpeg", buffer: truncated },
      sessionId,
      setId,
    },
  });
  expect(res.status()).toBe(201);
  const { mediaItem } = await res.json();
  expect(await decodeIssueOf(mediaItem.id)).toMatch(/premature end of JPEG image/);

  await page.goto(`/sets/${setId}`);
  const badge = page.getByLabel(/^Damaged file:/);
  await expect(badge).toBeVisible();

  await page.getByRole("button", { name: "Gallery image" }).first().click();
  const banner = page.getByRole("alert").filter({ hasText: "Damaged file" });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Looks fine" }).click();
  await expect(banner).toBeHidden();
  await expect(badge).toHaveCount(0);

  await expect.poll(() => decodeIssueOf(mediaItem.id)).toBeNull();
});
