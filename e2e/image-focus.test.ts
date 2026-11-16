import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// Per-image focus (ADR-0039): on a photo a shown person is the focus or only in
// the shot ("bg"). The lightbox chips set it, N toggles it, bulk sets it across a
// selection, the thumbnail badge hints at it, the people filter can ask for
// "focus only", and the person's showcase leaves the in-the-shot photos out.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const SESSION = `e2e-session-foc-${RUN}`;
const person = (k: string) => ({ id: `e2e-person-foc-${k}-${RUN}`, icg: `E2E-FOC${k}-${RUN}`.toUpperCase(), name: `Test Foc${k} ${RUN}` });
const A = person("a");
const B = person("b");
const C = person("c"); // appearing (support)
const PHOTOS = [1, 2, 3, 4].map((n) => ({ id: `${SESSION}-m${n}`, caption: `Test focus photo ${n} ${RUN}` }));

test.describe.configure({ timeout: 90_000 });

test.beforeAll(async () => {
  await db.connect();
  for (const p of [A, B, C]) {
    await db.query(`INSERT INTO "Person" (id, "icgId", "sexAtBirth") VALUES ($1, $2, 'female')`, [p.id, p.icg]);
    await db.query(`INSERT INTO "PersonAlias" (id, "personId", name, "isCommon") VALUES ($1, $2, $3, true)`, [`${p.id}-a`, p.id, p.name]);
  }
  await db.query(`INSERT INTO "Session" (id, name, "updatedAt") VALUES ($1, $2, now())`, [SESSION, `Test Session foc ${RUN}`]);
  await db.query(
    `INSERT INTO "SessionContribution" (id, "sessionId", "personId", "roleDefinitionId")
     VALUES ($1, $2, $3, 'crd_model'), ($4, $2, $5, 'crd_model'), ($6, $2, $7, 'crd_appearance')`,
    [`${SESSION}-ca`, SESSION, A.id, `${SESSION}-cb`, B.id, `${SESSION}-cc`, C.id],
  );
  for (const [i, m] of PHOTOS.entries()) {
    await db.query(
      `INSERT INTO "MediaItem" (id, "sessionId", "mediaType", filename, "mimeType", size, "originalWidth", "originalHeight", caption, "fileRef", "createdAt", "updatedAt")
       VALUES ($1, $2, 'PHOTO', $3, 'image/jpeg', 1, 400, 600, $4, 'e2e/none.jpg', now() - ($5 || ' minutes')::interval, now())`,
      [m.id, SESSION, `${m.id}.jpg`, m.caption, String(i)],
    );
  }
});

test.beforeEach(async () => {
  const ids = PHOTOS.map((m) => m.id);
  await db.query(`DELETE FROM media_item_background_person WHERE "mediaItemId" = ANY($1)`, [ids]);
  await db.query(`DELETE FROM media_item_shown_person WHERE "mediaItemId" = ANY($1)`, [ids]);
  await db.query(`DELETE FROM media_item_hidden_person WHERE "mediaItemId" = ANY($1)`, [ids]);
});

test.afterAll(async () => {
  const ids = PHOTOS.map((m) => m.id);
  await db.query(`DELETE FROM media_item_hidden_person WHERE "mediaItemId" = ANY($1)`, [ids]);
  await db.query(`DELETE FROM "MediaItem" WHERE "sessionId" = $1`, [SESSION]); // shown/background rows cascade
  await db.query(`DELETE FROM "SessionContribution" WHERE "sessionId" = $1`, [SESSION]);
  await db.query(`DELETE FROM "Session" WHERE id = $1`, [SESSION]);
  const persons = [A.id, B.id, C.id];
  await db.query(`DELETE FROM "PersonAlias" WHERE "personId" = ANY($1)`, [persons]);
  await db.query(`DELETE FROM "Person" WHERE id = ANY($1)`, [persons]);
  await db.end();
});

const background = async (mediaId: string) =>
  (await db.query<{ p: string }>(`SELECT "personId" AS p FROM media_item_background_person WHERE "mediaItemId" = $1 ORDER BY 1`, [mediaId])).rows.map((r) => r.p);
const support = async (mediaId: string) =>
  (await db.query<{ p: string; focus: boolean }>(`SELECT "personId" AS p, focus FROM media_item_shown_person WHERE "mediaItemId" = $1`, [mediaId])).rows;

async function openPhoto(page: Page, n: number) {
  await page.getByRole("button", { name: PHOTOS[n]!.caption }).hover();
  await page.getByRole("button", { name: "Open image" }).nth(n).click();
  const dialog = page.getByRole("dialog", { name: "Media lightbox" });
  await expect(dialog).toBeVisible();
  // The info panel exists twice (side panel, mobile sheet): the visible one
  const chips = dialog.locator('[data-testid="people-shown-leads"]:visible');
  if (!(await chips.isVisible())) await page.keyboard.press("i");
  await expect(chips).toBeVisible();
  return dialog;
}

const chip = (page: Page, id: string) => page.getByRole("dialog", { name: "Media lightbox" }).locator(`[data-person-id="${id}"]:visible`);

test("bg on a chip: in the shot, kept after a reload, left out of the showcase, still shown", async ({ page }) => {
  await page.goto(`/sessions/${SESSION}`);
  await openPhoto(page, 0);
  await expect(chip(page, A.id)).toHaveAttribute("data-state", "focus");
  await chip(page, A.id).getByRole("button", { name: `${A.name}: in the shot, not the focus` }).click();
  await expect(chip(page, A.id)).toHaveAttribute("data-state", "background");
  await expect.poll(() => background(PHOTOS[0]!.id)).toEqual([A.id]);

  // Still shown: the count stays 2 of 3, the thumbnail gets the bg hint
  await expect(page.getByRole("button", { name: /^People shown \(2\/3\)/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("people-badge").first()).toContainText("bg");

  await page.reload();
  await openPhoto(page, 0);
  await expect(chip(page, A.id)).toHaveAttribute("data-state", "background");

  // The showcase of A: 3 of the 4 photos; B keeps all 4
  const total = async (p: { id: string }) => {
    await page.goto(`/people/${p.id}`);
    const tile = page.locator('section[aria-labelledby="showcase-title"] button[aria-label^="Open photo"]').first();
    await expect(tile).toBeVisible();
    return Number((await tile.getAttribute("aria-label"))?.match(/of (\d+)/)?.[1]);
  };
  expect(await total(A)).toBe(3);
  expect(await total(B)).toBe(4);
});

test("support: bg on a not-shown guest shows them in the shot; bg again makes them the focus", async ({ page }) => {
  await page.goto(`/sessions/${SESSION}`);
  await openPhoto(page, 1);
  const guest = chip(page, C.id);
  await expect(guest).toHaveAttribute("data-state", "hidden");
  await guest.getByRole("button", { name: `${C.name}: in the shot, not the focus` }).click();
  await expect(guest).toHaveAttribute("data-state", "background");
  await expect.poll(() => support(PHOTOS[1]!.id)).toEqual([{ p: C.id, focus: false }]);
  await guest.getByRole("button", { name: `${C.name}: in the shot, not the focus` }).click();
  await expect(guest).toHaveAttribute("data-state", "focus");
  await expect.poll(() => support(PHOTOS[1]!.id)).toEqual([{ p: C.id, focus: true }]);

  await page.goto(`/people/${C.id}`);
  await expect(page.locator('section[aria-labelledby="showcase-title"] button[aria-label="Open photo 1 of 1"]')).toBeVisible();
});

test("N toggles the filtered person; with several people it points at the chips", async ({ page }) => {
  await page.goto(`/sessions/${SESSION}`);
  await openPhoto(page, 2);
  await page.keyboard.press("n");
  await expect(page.getByText("Several people here — pick who with bg on their chip")).toBeVisible();
  await page.keyboard.press("Escape");

  // Filter to B (must show): N now toggles B
  await page.getByRole("button", { name: `${B.name}: any` }).click();
  await openPhoto(page, 2);
  await page.keyboard.press("n");
  await expect(chip(page, B.id)).toHaveAttribute("data-state", "background");
  await expect.poll(() => background(PHOTOS[2]!.id)).toEqual([B.id]);
  await page.keyboard.press("n");
  await expect(chip(page, B.id)).toHaveAttribute("data-state", "focus");
  await expect.poll(() => background(PHOTOS[2]!.id)).toEqual([]);
});

test("bulk bg / Focus across a selection, and the focus-only filter", async ({ page }) => {
  await page.goto(`/sessions/${SESSION}`);
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await page.getByRole("button", { name: "People shown" }).click();
  await page.getByRole("button", { name: `${A.name}: in the shot, not the focus, in selected images` }).click();
  await expect.poll(async () => (await Promise.all(PHOTOS.map((m) => background(m.id)))).flat().length).toBe(4);
  await expect(page.getByTestId("people-badge")).toHaveCount(4);

  // Back to the focus on one photo: the focus-only filter for A lets just that one through
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await db.query(`DELETE FROM media_item_background_person WHERE "mediaItemId" = $1`, [PHOTOS[3]!.id]);
  await page.reload();
  const chipA = page.getByRole("button", { name: new RegExp(`^${A.name}: `) });
  await chipA.click(); // must show
  await expect(page.getByRole("button", { name: "Open image" })).toHaveCount(4);
  await chipA.click(); // must be the focus
  await expect(page.getByRole("button", { name: `${A.name}: must be the focus` })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open image" })).toHaveCount(1);

  // Bulk Focus undoes the marks
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await page.getByRole("button", { name: "People shown" }).click();
  await page.getByRole("button", { name: `${A.name}: the focus in selected images` }).click();
  await expect.poll(async () => (await Promise.all(PHOTOS.map((m) => background(m.id)))).flat().length).toBe(0);
});
