import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// Cover art (ADR-0040): the publisher's cover sits in the cover slot, outside the
// photos. "This is cover art" moves a photo there, "+ photos" lets art in as
// well, "Not cover art" moves it back; a session lists the art of its sets; the
// cleanup page lists a stand-in next to the photo it copies and deletes it.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const SESSION = `e2e-session-cva-${RUN}`;
const SET_A = `e2e-set-cva-a-${RUN}`;
const SET_B = `e2e-set-cva-b-${RUN}`;
const TITLE_A = `Test Cover Set A ${RUN}`;
const TITLE_B = `Test Cover Set B ${RUN}`;
const m = (k: string) => `${SESSION}-${k}`;

test.describe.configure({ mode: "serial", timeout: 90_000 });

async function media(k: string, setId: string, opts: { filename?: string; role?: string; phash?: string; w?: number; transferred?: boolean; age: number }) {
  await db.query(
    `INSERT INTO "MediaItem" (id, "sessionId", "mediaType", filename, "mimeType", size, "originalWidth", "originalHeight", caption, "fileRef",
       role, phash, "isTransferredCover", "createdAt", "updatedAt")
     VALUES ($1, $2, 'PHOTO', $3, 'image/jpeg', 1, $4, $5, $6, 'e2e/none.jpg', $7::"MediaRole", $8, $9, now() - ($10 || ' minutes')::interval, now())`,
    [m(k), SESSION, opts.filename ?? `${m(k)}.jpg`, opts.w ?? 400, Math.round((opts.w ?? 400) * 1.5), `Test cover photo ${k} ${RUN}`,
      opts.role ?? "PHOTO", opts.phash ?? null, opts.transferred ?? false, String(opts.age)],
  );
  await db.query(`INSERT INTO "SetMediaItem" ("setId", "mediaItemId", "sortOrder") VALUES ($1, $2, $3)`, [setId, m(k), opts.age]);
}

test.beforeAll(async () => {
  await db.connect();
  await db.query(`INSERT INTO "Session" (id, name, "updatedAt") VALUES ($1, $2, now())`, [SESSION, `Test Session cva ${RUN}`]);
  for (const [id, title] of [[SET_A, TITLE_A], [SET_B, TITLE_B]]) {
    await db.query(`INSERT INTO "Set" (id, type, title, "updatedAt") VALUES ($1, 'photo', $2, now())`, [id, title]);
    await db.query(`INSERT INTO "SetSession" ("setId", "sessionId", "isPrimary") VALUES ($1, $2, true)`, [id, SESSION]);
  }
  await media("p1", SET_A, { phash: "00000000000000fe", w: 2000, age: 1 });
  await media("p2", SET_A, { age: 2 });
  await media("p3", SET_A, { age: 3 });
  await media("art", SET_A, { filename: `Test Cover ${RUN}-c.jpg`, role: "COVER_ART", age: 4 });
  // A 512px stand-in of photo 1, left over from before the rule
  await media("standin", SET_A, { filename: "cover.jpg", role: "COVER_ART", phash: "00000000000000ff", w: 512, transferred: true, age: 5 });
  await media("bart", SET_B, { filename: `Test Cover B ${RUN}-c.jpg`, role: "COVER_ART", age: 6 });
  await db.query(`UPDATE "Set" SET "coverMediaItemId" = $1 WHERE id = $2`, [m("art"), SET_A]);
});

test.afterAll(async () => {
  await db.query(`UPDATE "Set" SET "coverMediaItemId" = NULL WHERE id = ANY($1)`, [[SET_A, SET_B]]);
  await db.query(`UPDATE "Session" SET "coverMediaItemId" = NULL WHERE id = $1`, [SESSION]);
  await db.query(`DELETE FROM "SetMediaItem" WHERE "setId" = ANY($1)`, [[SET_A, SET_B]]);
  await db.query(`DELETE FROM "PersonMediaLink" WHERE "mediaItemId" LIKE $1`, [`${SESSION}-%`]);
  await db.query(`DELETE FROM "MediaItem" WHERE "sessionId" = $1`, [SESSION]);
  await db.query(`DELETE FROM "SetSession" WHERE "sessionId" = $1`, [SESSION]);
  await db.query(`DELETE FROM "Set" WHERE id = ANY($1)`, [[SET_A, SET_B]]);
  await db.query(`DELETE FROM "Session" WHERE id = $1`, [SESSION]);
  await db.end();
});

const row = async (k: string) =>
  (await db.query<{ role: string; artInPhotos: boolean }>(`SELECT role, "artInPhotos" FROM "MediaItem" WHERE id = $1`, [m(k)])).rows[0];
const slot = (page: Page) => page.getByTestId("cover-art-slot");
/** The slot lives in a sheet behind the badge on the hero's cover */
async function openSlot(page: Page) {
  if (!(await slot(page).isVisible())) await page.getByTestId("cover-art-button").click();
  await expect(slot(page)).toBeVisible();
}
const gridOpeners = (page: Page) => page.getByRole("button", { name: "Open image" });

test("the set: art in the slot, photos in the grid; This is cover art and back", async ({ page }) => {
  await page.goto(`/sets/${SET_A}`);
  await expect(page.getByTestId("cover-art-button")).toHaveText(/2 cover art/);
  await openSlot(page);
  await expect(slot(page).getByTestId("cover-art-item")).toHaveCount(2);
  await expect(slot(page).locator(`[data-media-id="${m("art")}"]`).getByRole("button", { name: "The cover — click to remove it" })).toHaveAttribute("aria-pressed", "true");
  await expect(gridOpeners(page)).toHaveCount(3);
  await expect(page.getByText("3 media")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(slot(page)).toBeHidden();

  // Photo 3 is really the publisher's cover
  await page.getByRole("button", { name: `Test cover photo p3 ${RUN}` }).hover();
  await gridOpeners(page).nth(2).click();
  const dialog = page.getByRole("dialog", { name: "Media lightbox" });
  await expect(dialog).toBeVisible();
  if (!(await dialog.getByRole("button", { name: "This is cover art" }).first().isVisible())) await page.keyboard.press("i");
  await dialog.getByRole("button", { name: "This is cover art" }).locator("visible=true").first().click();
  await expect.poll(async () => (await row("p3"))?.role).toBe("COVER_ART");
  await page.keyboard.press("Escape");
  await expect(gridOpeners(page)).toHaveCount(2);
  await openSlot(page);
  await expect(slot(page).getByTestId("cover-art-item")).toHaveCount(3);

  // ... and back
  await slot(page).locator(`[data-media-id="${m("p3")}"]`).getByRole("button", { name: "Not cover art — back to the photos" }).click();
  await expect.poll(async () => (await row("p3"))?.role).toBe("PHOTO");
  await expect(gridOpeners(page)).toHaveCount(3);
});

test("+ photos lets cover art into the grid with a badge, and out again", async ({ page }) => {
  await page.goto(`/sets/${SET_A}`);
  await openSlot(page);
  const art = slot(page).locator(`[data-media-id="${m("art")}"]`);
  await art.getByRole("button", { name: "Let into the photos as well" }).click();
  await expect.poll(async () => (await row("art"))?.artInPhotos).toBe(true);
  await expect(gridOpeners(page)).toHaveCount(4);
  await expect(page.getByTestId("cover-art-badge")).toHaveCount(1);
  await art.getByRole("button", { name: "Take out of the photos" }).click();
  await expect.poll(async () => (await row("art"))?.artInPhotos).toBe(false);
  await page.reload();
  await expect(gridOpeners(page)).toHaveCount(3);
});

test("the session groups the art by set; Cover there is the set's cover", async ({ page }) => {
  await page.goto(`/sessions/${SESSION}`);
  await openSlot(page);
  await expect(slot(page).getByTestId("cover-art-item")).toHaveCount(3);
  // The slot follows the gallery's own switch (flat by default): flat, each file names its set
  if ((await page.getByTestId("cover-art-group-toggle").getAttribute("aria-pressed")) === "true") {
    await page.getByTestId("cover-art-group-toggle").click();
  }
  await expect(slot(page).getByTestId("cover-art-flat")).toBeVisible();
  await expect(slot(page).locator(`[data-media-id="${m("bart")}"]`)).toContainText(TITLE_B);
  await page.getByTestId("cover-art-group-toggle").click();
  // ... and the grid underneath groups with it
  await expect(page.getByTitle("Show flat").first()).toBeVisible();
  const groupA = slot(page).locator(`[data-testid="cover-art-group"][data-set-id="${SET_A}"]`);
  const groupB = slot(page).locator(`[data-testid="cover-art-group"][data-set-id="${SET_B}"]`);
  await expect(groupA).toContainText(TITLE_A);
  await expect(groupA.getByTestId("cover-art-item")).toHaveCount(2);
  await expect(groupB).toContainText(TITLE_B);
  await expect(groupB.locator(`[data-media-id="${m("bart")}"]`)).toBeVisible();
  // No pick of its own: the session shows the first set's cover (no release dates: created first)
  await expect(slot(page).getByTestId("session-cover-source")).toContainText(`the cover of ${TITLE_A}`);
  // Set A's cover is lit in its group
  await expect(groupA.getByRole("button", { name: `The cover of ${TITLE_A} — click to remove it` })).toBeVisible();

  // Cover in group B makes it set B's cover
  await groupB.getByRole("button", { name: `Set as cover of ${TITLE_B}` }).click();
  await expect
    .poll(async () => (await db.query(`SELECT "coverMediaItemId" c FROM "Set" WHERE id = $1`, [SET_B])).rows[0]?.c)
    .toBe(m("bart"));
  await expect(groupB.getByRole("button", { name: `The cover of ${TITLE_B} — click to remove it` })).toBeVisible();
  await expect(gridOpeners(page)).toHaveCount(3);
});

test("the cleanup page lists the stand-in beside its photo and deletes only the ticked one", async ({ page }) => {
  await page.goto("/settings/system/cover-duplicates");
  const mine = page.locator(`[data-testid="dup-row"][data-media-id="${m("standin")}"]`);
  await expect(mine).toBeVisible();
  await expect(mine).toContainText("stays · photo");
  // Leave anything else on dev alone: untick every group, tick only the fixture
  for (const btn of await page.getByRole("button", { name: "Select none" }).all()) await btn.click();
  await mine.getByRole("checkbox").check();
  await expect(page.getByText(/^1 of \d+ selected$/)).toBeVisible();
  await page.getByRole("button", { name: "Delete 1 selected" }).click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByText("1 duplicate deleted")).toBeVisible();
  await expect.poll(async () => (await db.query(`SELECT 1 FROM "MediaItem" WHERE id = $1`, [m("standin")])).rowCount).toBe(0);
  await expect(mine).toHaveCount(0);
});
