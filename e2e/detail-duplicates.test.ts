import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// "Already in this category" (2026-11-12). Assigning the same set photo to the
// same detail category again used to make a silent second copy. Now the D sheet
// says where the photo is already used and asks "Add again anyway"; the lightbox
// info panel lists it; the Details tab shows the duplicate and lets you delete
// one copy (two clicks). Everything is created here (own person, set, category)
// and removed afterwards.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36);
const ids = {
  person: `e2e-person-dup-${RUN}`,
  session: `e2e-session-dup-${RUN}`,
  set: `e2e-set-dup-${RUN}`,
  group: `e2e-catgroup-dup-${RUN}`,
  category: `e2e-cat-dup-${RUN}`,
};
const PERSON = `Dupe Tester ${RUN}`;
const ICG = `E2EDUP${RUN}`.toUpperCase();
const CATEGORY = `Dup Check ${RUN}`;
let photoId = "";

test.beforeAll(async ({ request }) => {
  await db.connect();
  await db.query(`INSERT INTO "Person" (id, "icgId") VALUES ($1, $2)`, [ids.person, ICG]);
  await db.query(`INSERT INTO "PersonAlias" (id, "personId", name, "isCommon") VALUES ($1, $2, $3, true)`, [`${ids.person}-a`, ids.person, PERSON]);
  await db.query(`INSERT INTO "Session" (id, name, "updatedAt") VALUES ($1, $2, now())`, [ids.session, `Test Session dup ${RUN}`]);
  await db.query(`INSERT INTO "Set" (id, type, title, "updatedAt") VALUES ($1, 'photo', $2, now())`, [ids.set, `Test Set dup ${RUN}`]);
  await db.query(`INSERT INTO "SetSession" ("setId", "sessionId", "isPrimary") VALUES ($1, $2, true)`, [ids.set, ids.session]);
  const role = (await db.query<{ id: string }>(
    `SELECT d.id FROM "ContributionRoleDefinition" d JOIN "ContributionRoleGroup" g ON g.id = d."groupId"
     WHERE g.kind = 'ON_CAMERA' AND d.presence = 'LEAD' LIMIT 1`,
  )).rows[0]!.id;
  await db.query(`INSERT INTO "SetParticipant" ("setId", "personId", "roleDefinitionId") VALUES ($1, $2, $3)`, [ids.set, ids.person, role]);
  await db.query(`INSERT INTO "SessionContribution" (id, "sessionId", "personId", "roleDefinitionId") VALUES ($1, $2, $3, $4)`, [`${ids.session}-c`, ids.session, ids.person, role]);
  await db.query(`INSERT INTO "MediaCategoryGroup" (id, name, "sortOrder") VALUES ($1, $2, 999)`, [ids.group, `E2E Dup Group ${RUN}`]);
  await db.query(`INSERT INTO "MediaCategory" (id, "groupId", name, slug) VALUES ($1, $2, $3, $4)`, [ids.category, ids.group, CATEGORY, `e2e_dup_${RUN}`]);

  const photo = readFileSync(path.join(__dirname, "fixtures/test-photo.jpg"));
  const res = await request.post("/api/media/upload", {
    multipart: {
      file: { name: `dup-${RUN}.jpg`, mimeType: "image/jpeg", buffer: Buffer.concat([photo, Buffer.from(`dup-${RUN}`)]) },
      sessionId: ids.session,
      setId: ids.set,
    },
  });
  expect(res.status()).toBe(201);
  photoId = (await res.json()).mediaItem.id;
});

test.afterAll(async () => {
  const ref = (await db.query<{ id: string }>(`SELECT id FROM "Session" WHERE "personId" = $1`, [ids.person])).rows[0]?.id;
  await db.query(`DELETE FROM "PersonMediaLink" WHERE "personId" = $1`, [ids.person]);
  if (ref) {
    await db.query(`UPDATE "MediaItem" SET "copiedFromMediaItemId" = NULL WHERE "sessionId" = $1`, [ref]);
    await db.query(`DELETE FROM "MediaItem" WHERE "sessionId" = $1`, [ref]);
    await db.query(`DELETE FROM "Session" WHERE id = $1`, [ref]);
  }
  await db.query(`DELETE FROM "SetMediaItem" WHERE "setId" = $1`, [ids.set]);
  await db.query(`DELETE FROM "MediaItem" WHERE id = $1`, [photoId]);
  await db.query(`DELETE FROM "SetParticipant" WHERE "setId" = $1`, [ids.set]);
  await db.query(`DELETE FROM "SessionContribution" WHERE "sessionId" = $1`, [ids.session]);
  await db.query(`DELETE FROM "SetSession" WHERE "setId" = $1`, [ids.set]);
  await db.query(`DELETE FROM "Set" WHERE id = $1`, [ids.set]);
  await db.query(`DELETE FROM "Session" WHERE id = $1`, [ids.session]);
  await db.query(`DELETE FROM "MediaCategory" WHERE id = $1`, [ids.category]);
  await db.query(`DELETE FROM "MediaCategoryGroup" WHERE id = $1`, [ids.group]);
  await db.query(`DELETE FROM "PersonAlias" WHERE "personId" = $1`, [ids.person]);
  await db.query(`DELETE FROM "Person" WHERE id = $1`, [ids.person]);
  await db.end();
});

async function openAssignSheet(page: import("@playwright/test").Page) {
  await page.goto(`/sets/${ids.set}?photo=${photoId}`);
  await expect(page.getByRole("dialog", { name: "Media lightbox" })).toBeVisible();
  await page.keyboard.press("d");
  const sheet = page.getByRole("dialog", { name: "Assign to detail category" });
  await expect(sheet).toBeVisible();
  return sheet;
}

test("a repeat into the same detail category is flagged, can be forced, and the duplicate can be deleted", async ({ page }) => {
  test.setTimeout(90_000); // four page loads + two copies through MinIO
  // 1. First assign — no warning.
  let sheet = await openAssignSheet(page);
  await sheet.getByRole("button", { name: CATEGORY }).click();
  await expect(sheet.getByTestId("detail-already-here")).toHaveCount(0);
  await sheet.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page.getByText(`added to ${CATEGORY}`, { exact: false })).toBeVisible();

  // 2. Again: the sheet says where it is used and asks "Add again anyway".
  sheet = await openAssignSheet(page);
  await expect(sheet.getByTestId("detail-uses-summary")).toContainText(CATEGORY);
  await sheet.getByRole("button", { name: CATEGORY }).click();
  await expect(sheet.getByTestId("detail-already-here")).toContainText(`already in ${CATEGORY}`);
  await sheet.getByRole("button", { name: "Add again anyway" }).click();
  await expect(page.getByText(`added to ${CATEGORY}`, { exact: false }).last()).toBeVisible();

  // 3. The info panel lists the use, named Name (ICG-ID).
  await page.goto(`/sets/${ids.set}?photo=${photoId}`);
  await page.getByRole("toolbar", { name: "Photo tools" }).getByRole("button", { name: "Info panel" }).click();
  // (the panel is mounted twice — desktop side panel + phone sheet; one is visible)
  const uses = page.getByTestId("lightbox-detail-uses").locator("visible=true");
  await expect(uses).toContainText(`${PERSON} (${ICG})`);
  await expect(uses).toContainText(CATEGORY);

  // 4. Details tab: "1 duplicate" → delete one copy (two clicks) → gone.
  await page.goto(`/people/${ids.person}?tab=details`);
  const pill = page.getByTestId("detail-duplicates-pill");
  await expect(pill).toHaveText("1 duplicate");
  await pill.click();
  const dlg = page.getByTestId("detail-duplicates-dialog");
  await expect(dlg.getByRole("button", { name: "Delete copy" })).toHaveCount(2);
  await dlg.getByRole("button", { name: "Delete copy" }).first().click();
  await dlg.getByRole("button", { name: "Confirm delete" }).click();
  await expect(dlg.getByText("No duplicates left.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("detail-duplicates-pill")).toHaveCount(0);

  const links = await db.query(`SELECT 1 FROM "PersonMediaLink" WHERE "personId" = $1 AND "categoryId" = $2`, [ids.person, ids.category]);
  expect(links.rowCount).toBe(1);
});
