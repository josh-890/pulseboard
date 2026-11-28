import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// Rating an act where it is seen (2026-11-28): in the set's viewer, A opens the
// picker — the people on the photo, the column it suggests (two women → G-G),
// a search across every column — and a pick ticks the act for the chosen
// people and links the photo in one step; Undo takes it back; ← → page while
// the picker stays open.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36);
const SESSION = `e2e-session-pin-${RUN}`;
const SET = `e2e-set-pin-${RUN}`;
const A = { id: `e2e-person-pina-${RUN}`, icg: `E2E-PINA-${RUN}`.toUpperCase(), name: `Test Ada ${RUN}`, c: `${SESSION}-ca` };
const B = { id: `e2e-person-pinb-${RUN}`, icg: `E2E-PINB-${RUN}`.toUpperCase(), name: `Test Bel ${RUN}`, c: `${SESSION}-cb` };
const SOLO_ACT = { id: `e2e-act-pins-${RUN}`, name: `Test solo act ${RUN}` };
const GG_ACT = { id: `e2e-act-ping-${RUN}`, name: `Test gg act ${RUN}` };
const PHOTOS = [1, 2, 3].map((n) => ({ id: `${SESSION}-m${n}`, caption: `Test pin photo ${n} ${RUN}` }));

test.describe.configure({ timeout: 90_000 });

test.beforeAll(async () => {
  await db.connect();
  for (const p of [A, B]) {
    await db.query(`INSERT INTO "Person" (id, "icgId", "sexAtBirth") VALUES ($1, $2, 'female')`, [p.id, p.icg]);
    await db.query(`INSERT INTO "PersonAlias" (id, "personId", name, "isCommon") VALUES ($1, $2, $3, true)`, [`${p.id}-a`, p.id, p.name]);
  }
  await db.query(`INSERT INTO "Session" (id, name, "updatedAt") VALUES ($1, $2, now())`, [SESSION, `Test session pin ${RUN}`]);
  await db.query(`INSERT INTO "Set" (id, title, type, "updatedAt") VALUES ($1, $2, 'photo', now())`, [SET, `Test set pin ${RUN}`]);
  await db.query(`INSERT INTO "SetSession" ("setId", "sessionId", "isPrimary") VALUES ($1, $2, true)`, [SET, SESSION]);
  for (const p of [A, B]) {
    await db.query(`INSERT INTO "SessionContribution" (id, "sessionId", "personId", "roleDefinitionId") VALUES ($1, $2, $3, 'crd_model')`, [p.c, SESSION, p.id]);
  }
  await db.query(`INSERT INTO "IntensityAct" (id, "scenarioId", name, level) VALUES ($1, 'dsit-solo', $2, 2), ($3, 'dsit-gg', $4, 5)`, [
    SOLO_ACT.id,
    SOLO_ACT.name,
    GG_ACT.id,
    GG_ACT.name,
  ]);
  for (const [i, m] of PHOTOS.entries()) {
    await db.query(
      `INSERT INTO "MediaItem" (id, "sessionId", "mediaType", filename, "mimeType", size, "originalWidth", "originalHeight", caption, "fileRef", "createdAt", "updatedAt")
       VALUES ($1, $2, 'PHOTO', $3, 'image/jpeg', 1, 400, 600, $4, 'e2e/none.jpg', now() - ($5 || ' minutes')::interval, now())`,
      [m.id, SESSION, `${m.id}.jpg`, m.caption, String(i)],
    );
    await db.query(`INSERT INTO "SetMediaItem" ("setId", "mediaItemId", "sortOrder") VALUES ($1, $2, $3)`, [SET, m.id, i]);
  }
});

test.beforeEach(async () => {
  await db.query(`DELETE FROM "ContributionAct" WHERE "contributionId" IN ($1, $2)`, [A.c, B.c]);
});

test.afterAll(async () => {
  await db.query(`DELETE FROM "SetMediaItem" WHERE "setId" = $1`, [SET]);
  await db.query(`DELETE FROM "SetSession" WHERE "setId" = $1`, [SET]);
  await db.query(`DELETE FROM "SetParticipant" WHERE "setId" = $1`, [SET]);
  await db.query(`DELETE FROM "Set" WHERE id = $1`, [SET]);
  await db.query(`DELETE FROM "MediaItem" WHERE "sessionId" = $1`, [SESSION]);
  await db.query(`DELETE FROM "SessionContribution" WHERE "sessionId" = $1`, [SESSION]);
  await db.query(`DELETE FROM "IntensityAct" WHERE id IN ($1, $2)`, [SOLO_ACT.id, GG_ACT.id]);
  await db.query(`DELETE FROM "Session" WHERE id = $1`, [SESSION]);
  for (const p of [A, B]) {
    await db.query(`DELETE FROM "PersonAlias" WHERE "personId" = $1`, [p.id]);
    await db.query(`DELETE FROM "Person" WHERE id = $1`, [p.id]);
  }
  await db.end();
});

/** Per lead: the act ticked, with the photos linked to it */
const state = async (c: string, actId: string) => {
  const rows = await db.query<{ id: string; m: string | null }>(
    `SELECT ca.id, cam."mediaItemId" AS m FROM "ContributionAct" ca LEFT JOIN "ContributionActMedia" cam ON cam."contributionActId" = ca.id
     WHERE ca."contributionId" = $1 AND ca."actId" = $2 ORDER BY 2`,
    [c, actId],
  );
  return rows.rows.length === 0 ? null : rows.rows.flatMap((r) => (r.m ? [r.m] : []));
};

async function openViewer(page: Page, photo: number) {
  await page.goto(`/sets/${SET}`);
  await page.getByRole("button", { name: PHOTOS[photo]!.caption }).hover();
  await page.getByRole("button", { name: "Open image" }).first().click();
  await expect(page.getByRole("button", { name: "Rate an act on this photo" })).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("a");
  const picker = page.getByTestId("photo-act-picker");
  await expect(picker).toBeVisible();
  return picker;
}

test("A: the photo's people and column; a pick ticks and links in one step; Undo takes it back", async ({ page }) => {
  const picker = await openViewer(page, 0);
  // Both women on the photo: G-G is suggested; the first is chosen
  await expect(picker.getByRole("tab", { name: "G-G" })).toHaveAttribute("aria-selected", "true");
  await expect(picker.getByRole("button", { name: `${A.name} (${A.icg})` })).toHaveAttribute("aria-pressed", "true");
  await expect(picker.getByRole("button", { name: `${B.name} (${B.icg})` })).toHaveAttribute("aria-pressed", "false");
  // The column's act is offered; the search finds the Solo one too
  await expect(picker.getByRole("button", { name: GG_ACT.name })).toBeVisible();
  await picker.getByLabel("Find an act").fill(GG_ACT.name);
  await page.keyboard.press("Enter");
  await expect.poll(() => state(A.c, GG_ACT.id)).toEqual([PHOTOS[0]!.id]);
  expect(await state(B.c, GG_ACT.id)).toBeNull();
  await expect(picker.getByRole("button", { name: `${GG_ACT.name}, ticked, this photo linked` })).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => state(A.c, GG_ACT.id)).toBeNull();
});

test("the picker stays open: → pages on, the same act links the next photo; both people at once", async ({ page }) => {
  const picker = await openViewer(page, 0);
  await picker.getByRole("button", { name: `${B.name} (${B.icg})` }).click();
  await picker.getByLabel("Find an act").fill(SOLO_ACT.name);
  await page.keyboard.press("Enter");
  await expect.poll(() => state(A.c, SOLO_ACT.id)).toEqual([PHOTOS[0]!.id]);
  await expect.poll(() => state(B.c, SOLO_ACT.id)).toEqual([PHOTOS[0]!.id]);

  // Clear the search: ← → page the viewer, the picker and the people stay
  await picker.getByLabel("Find an act").fill("");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText(`2 / ${PHOTOS.length}`)).toBeVisible();
  await expect(picker).toBeVisible();
  await picker.getByLabel("Find an act").fill(SOLO_ACT.name);
  await expect(picker.getByRole("button", { name: `${SOLO_ACT.name}, ticked` })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect.poll(() => state(A.c, SOLO_ACT.id)).toEqual([PHOTOS[0]!.id, PHOTOS[1]!.id].sort());
  await expect.poll(() => state(B.c, SOLO_ACT.id)).toEqual([PHOTOS[0]!.id, PHOTOS[1]!.id].sort());

  // Picking it again takes this photo back — the tick stays
  await page.keyboard.press("Enter");
  await expect.poll(() => state(A.c, SOLO_ACT.id)).toEqual([PHOTOS[0]!.id]);
  // Esc closes the picker only, not the viewer
  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);
  await expect(page.getByText(`2 / ${PHOTOS.length}`)).toBeVisible();
});
