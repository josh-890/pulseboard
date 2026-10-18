import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// Photo marks (2026-10-16): iconic, ★ and outtake toggled from a tile on hover,
// as tiers since 2026-10-17 (iconic > ★ > outtake),
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
  await db.query(`UPDATE "Set" SET "coverMediaItemId" = NULL WHERE id = $1`, [setId]);
  await db.query(`DELETE FROM media_item_tag WHERE "mediaItemId" = ANY($1::text[])`, [media]);
  await db.query(`DELETE FROM "SetMediaItem" WHERE "setId" = $1`, [setId]);
  await db.query(`DELETE FROM "MediaItem" WHERE id = ANY($1::text[])`, [media]);
  await db.query(`DELETE FROM "SetSession" WHERE "setId" = $1`, [setId]);
  await db.query(`DELETE FROM "Set" WHERE id = $1`, [setId]);
  await db.query(`DELETE FROM "Session" WHERE id = $1`, [sessionId]);
  await db.end();
});

// Each test starts from unmarked photos
async function resetMarks() {
  await db.query(
    `DELETE FROM media_item_tag t USING tag_definition d
     WHERE d.id = t."tagDefinitionId" AND d.slug IN ('iconic', 'outtake') AND t."mediaItemId" = ANY($1::text[])`,
    [media],
  );
  await db.query(`UPDATE "MediaItem" SET "isFavorite" = false WHERE id = ANY($1::text[])`, [media]);
}

const all = (on: boolean) => ({ tags: on ? ["iconic", "outtake"] : [], favorite: on });

test.describe.serial("Photo marks", () => {
  test.beforeEach(resetMarks);

  test("a tile marks on hover without opening the photo; iconic brings ★ and outtake along", async ({ page }) => {
    await page.goto(`/sets/${setId}`);
    const tile = page.getByRole("button", { name: "Gallery image" }).first();
    await tile.hover();
    await tile.getByRole("button", { name: "Iconic (not set)" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(tile.getByRole("button", { name: "Favorite (set)" })).toBeVisible();
    await expect(tile.getByRole("button", { name: "Outtake (set)" })).toBeVisible();
    await expect.poll(async () => [await marksOf(media[0]), await marksOf(media[1])].filter((m) => m.favorite).length).toBe(1);

    await page.reload();
    await expect(page.getByRole("button", { name: "Iconic (set)" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Outtake (set)" })).toHaveCount(1);
  });

  test("the lightbox keys , . - follow the tiers", async ({ page }) => {
    await page.goto(`/sets/${setId}`);
    await page.getByRole("button", { name: "Gallery image" }).nth(1).click();
    const ladder = page.getByRole("toolbar", { name: "Photo tools" }).getByRole("group", { name: "Marks" });
    const iconic = ladder.getByRole("button", { name: "Iconic" });
    const favorite = ladder.getByRole("button", { name: "Favorite" });
    const outtake = ladder.getByRole("button", { name: "Outtake" });
    const pressed = async () =>
      [await iconic.getAttribute("aria-pressed"), await favorite.getAttribute("aria-pressed"), await outtake.getAttribute("aria-pressed")].join();
    await expect.poll(pressed).toBe("false,false,false");

    // Iconic (-) sets everything below it
    await page.keyboard.press("-");
    await expect.poll(pressed).toBe("true,true,true");
    // Un-★ clears iconic too, outtake stays
    await page.keyboard.press(".");
    await expect.poll(pressed).toBe("false,false,true");
    // ★ again: outtake already there, iconic stays off
    await page.keyboard.press(".");
    await expect.poll(pressed).toBe("false,true,true");
    // Un-outtake clears everything above it — by click this time
    await outtake.click();
    await expect.poll(pressed).toBe("false,false,false");
    // Outtake (,) is the lowest key, on the left — on and off again
    await page.keyboard.press(",");
    await expect.poll(pressed).toBe("false,false,true");
    await page.keyboard.press(",");
    await expect.poll(pressed).toBe("false,false,false");

    const shown = page.getByText(/^\d+ \/ 2$/);
    const id = (await shown.textContent())?.startsWith("1") ? media[0] : media[1];
    await expect.poll(() => marksOf(id)).toEqual(all(false));
  });

  test("a selection is marked at once from the bulk bar, with the tiers", async ({ page }) => {
    await page.goto(`/sets/${setId}`);
    const select = page.getByRole("button", { name: "Select", exact: true });
    await select.nth(0).click();
    await select.nth(0).click(); // the first is now "Deselect"; the next "Select" is the second tile
    const bulkIconic = page.getByRole("button", { name: "Iconic", exact: true });
    const bulkOuttake = page.getByRole("button", { name: "Outtake", exact: true });

    await bulkOuttake.click();
    await expect(bulkOuttake).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => [await marksOf(media[0]), await marksOf(media[1])]).toEqual([
      { tags: ["outtake"], favorite: false },
      { tags: ["outtake"], favorite: false },
    ]);

    await bulkIconic.click();
    await expect(bulkIconic).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => [await marksOf(media[0]), await marksOf(media[1])]).toEqual([all(true), all(true)]);
    // While selecting, the tile marks are badges, not buttons
    const favBadges = page.locator('span[aria-label="Favorite"]');
    await expect(favBadges).toHaveCount(2);

    // Outtake off for the selection clears ★ and iconic as well
    await bulkOuttake.click();
    await expect.poll(async () => [await marksOf(media[0]), await marksOf(media[1])]).toEqual([all(false), all(false)]);
    await expect(favBadges).toHaveCount(0);
  });
});

// # sets the current photo as the cover (2026-10-18) — set-only: pressed on the
// cover again it says so and keeps it.
test("# in the viewer sets the cover, and only sets it", async ({ page }) => {
  await db.query(`UPDATE "Set" SET "coverMediaItemId" = NULL WHERE id = $1`, [setId]);
  const coverOf = async () =>
    (await db.query<{ c: string | null }>(`SELECT "coverMediaItemId" AS c FROM "Set" WHERE id = $1`, [setId])).rows[0]?.c ?? null;

  await page.goto(`/sets/${setId}`);
  await page.getByRole("button", { name: "Gallery image" }).first().click();
  await expect(page.getByText(/^1 \/ 2$/)).toBeVisible();

  // The photo on screen becomes the cover
  await page.keyboard.press("#");
  await expect(page.getByText("Cover set")).toBeVisible();
  await expect.poll(coverOf).not.toBeNull();
  const first = await coverOf();
  expect(media).toContain(first);

  // The next photo takes it over
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText(/^2 \/ 2$/)).toBeVisible();
  await page.keyboard.press("#");
  await expect.poll(coverOf).toBe(media.find((m) => m !== first));

  // Pressed on the cover again: it says so and keeps it
  await page.keyboard.press("#");
  await expect(page.getByText("Already the cover")).toBeVisible();
  await expect.poll(coverOf).toBe(media.find((m) => m !== first));
});
