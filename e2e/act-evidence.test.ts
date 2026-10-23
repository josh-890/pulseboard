import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// Photos as evidence for an act (ADR-0036, slice 3b): a gallery selection
// becomes evidence through "Act…", the viewer shows and changes it (A), the
// act: filter narrows the gallery to it, the panel counts it and opens the
// picker, and the person's Intensity tab shows the act in pictures.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36);
const SESSION = `e2e-session-ae-${RUN}`;
const P = { id: `e2e-person-ae-${RUN}`, icg: `E2E-AE-${RUN}`.toUpperCase(), name: `Test Evi ${RUN}` };
const C = `${SESSION}-c`;
const CA = `${SESSION}-ca`;
const ACT = { id: `e2e-act-ae-${RUN}`, name: `Test evidence act ${RUN}` };
const PHOTOS = [1, 2, 3].map((n) => ({ id: `${SESSION}-m${n}`, caption: `Test photo ${n} ${RUN}` }));
const label = `${P.name} (${P.icg})`;

test.beforeAll(async () => {
  await db.connect();
  await db.query(`INSERT INTO "Person" (id, "icgId", "sexAtBirth") VALUES ($1, $2, 'female')`, [P.id, P.icg]);
  await db.query(`INSERT INTO "PersonAlias" (id, "personId", name, "isCommon") VALUES ($1, $2, $3, true)`, [`${P.id}-a`, P.id, P.name]);
  await db.query(`INSERT INTO "Session" (id, name, date, "datePrecision", "updatedAt") VALUES ($1, $2, '2021-04-01', 'DAY', now())`, [
    SESSION,
    `Test session ${RUN}`,
  ]);
  await db.query(`INSERT INTO "SessionContribution" (id, "sessionId", "personId", "roleDefinitionId") VALUES ($1, $2, $3, 'crd_model')`, [C, SESSION, P.id]);
  await db.query(`INSERT INTO "IntensityAct" (id, "scenarioId", name, level) VALUES ($1, 'dsit-solo', $2, 4)`, [ACT.id, ACT.name]);
  await db.query(`INSERT INTO "ContributionAct" (id, "contributionId", "actId") VALUES ($1, $2, $3)`, [CA, C, ACT.id]);
  for (const [i, m] of PHOTOS.entries()) {
    await db.query(
      `INSERT INTO "MediaItem" (id, "sessionId", "mediaType", filename, "mimeType", size, "originalWidth", "originalHeight", caption, "fileRef", "createdAt", "updatedAt")
       VALUES ($1, $2, 'PHOTO', $3, 'image/jpeg', 1, 400, 600, $4, 'e2e/none.jpg', now() - ($5 || ' minutes')::interval, now())`,
      [m.id, SESSION, `${m.id}.jpg`, m.caption, String(i)],
    );
  }
});

test.beforeEach(async () => {
  await db.query(`DELETE FROM "ContributionActMedia" WHERE "contributionActId" = $1`, [CA]);
});

test.afterAll(async () => {
  await db.query(`DELETE FROM "MediaItem" WHERE "sessionId" = $1`, [SESSION]);
  await db.query(`DELETE FROM "SessionContribution" WHERE "sessionId" = $1`, [SESSION]);
  await db.query(`DELETE FROM "IntensityAct" WHERE id = $1`, [ACT.id]);
  await db.query(`DELETE FROM "Session" WHERE id = $1`, [SESSION]);
  await db.query(`DELETE FROM "PersonAlias" WHERE "personId" = $1`, [P.id]);
  await db.query(`DELETE FROM "Person" WHERE id = $1`, [P.id]);
  await db.end();
});

const linked = async () =>
  (await db.query<{ id: string }>(`SELECT "mediaItemId" AS id FROM "ContributionActMedia" WHERE "contributionActId" = $1 ORDER BY 1`, [CA])).rows.map(
    (r) => r.id,
  );
const link = async (ids: string[]) => {
  for (const id of ids) await db.query(`INSERT INTO "ContributionActMedia" ("contributionActId", "mediaItemId") VALUES ($1, $2)`, [CA, id]);
};

async function openPanel(page: Page) {
  const panel = page.getByRole("region", { name: "Intensity panel" });
  await expect(async () => {
    if (!(await panel.isVisible())) await page.getByRole("button", { name: "Intensity", exact: true }).first().click();
    await expect(panel).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  return panel;
}

test("a selection becomes evidence; the viewer shows and changes it; act: filters the gallery", async ({ page }) => {
  await page.goto(`/sessions/${SESSION}`);
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await page.getByRole("button", { name: "Act…" }).click();
  await page.getByRole("checkbox", { name: `${ACT.name} — ${label}` }).click();
  await expect.poll(linked).toEqual(PHOTOS.map((m) => m.id).sort());
  await expect(page.getByRole("checkbox", { name: `${ACT.name} — ${label}` })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Clear", exact: true }).click();

  // In the viewer: A opens the list; this photo is linked — untick it
  await page.getByRole("button", { name: PHOTOS[0]!.caption }).hover();
  await page.getByRole("button", { name: "Open image" }).first().click();
  await expect(page.getByRole("button", { name: "Evidence for 1 act — change" })).toBeVisible();
  await page.keyboard.press("a");
  const box = page.getByRole("checkbox", { name: `${ACT.name} — ${label}` });
  await expect(box).toHaveAttribute("aria-checked", "true");
  await box.click();
  await expect(box).toHaveAttribute("aria-checked", "false");
  await expect.poll(async () => (await linked()).length).toBe(2);

  // The act: filter keeps the two still linked
  await page.goto(`/sessions/${SESSION}?tags=${encodeURIComponent(`act:"${ACT.name}"`)}`);
  await expect(page.getByText("2 of 3 images")).toBeVisible();
});

test("the panel counts an act's photos and opens the picker; the person tab shows the act in pictures", async ({ page }) => {
  await link([PHOTOS[0]!.id, PHOTOS[2]!.id]);
  await page.goto(`/sessions/${SESSION}`);
  const panel = await openPanel(page);
  const photos = panel.getByRole("button", { name: `Photos of ${ACT.name}: 2 — change` });
  await expect(photos).toBeVisible();
  await photos.click();
  const picker = page.getByRole("dialog", { name: new RegExp(`${ACT.name} — `) });
  await expect(picker).toBeVisible();
  await picker.getByRole("button", { name: "Close" }).first().click();
  await expect(picker).toHaveCount(0);

  await page.goto(`/people/${P.id}?tab=intensity`);
  const row = page.getByRole("listitem", { name: `${ACT.name} in pictures` });
  await expect(row).toContainText("2 photos");
  await expect(row.getByRole("link")).toHaveCount(2);
  await row.getByRole("link").first().click();
  await expect(page).toHaveURL(new RegExp(`/sessions/${SESSION}\\?tags=`));
  await expect(page.getByText("2 of 3 images")).toBeVisible();
});
