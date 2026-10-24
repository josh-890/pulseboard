import "dotenv/config";
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// The support role "Appearance" (2026-10-24): the role pill switches Model ↔
// Appearance (asking first when acts would go), the set shows support after the
// models under "Appearing", and a person filter on /sets leaves them out unless
// "incl. appearing" is on.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const SESSION = `e2e-session-sup-${RUN}`;
const SET = { id: `e2e-set-sup-${RUN}`, title: `Test Support set ${RUN}` };
const MODEL = { id: `e2e-person-sup-m-${RUN}`, icg: `E2E-SUPM-${RUN}`.toUpperCase(), name: `Test Model ${RUN}`, c: `${SESSION}-m` };
const GUEST = { id: `e2e-person-sup-g-${RUN}`, icg: `E2E-SUPG-${RUN}`.toUpperCase(), name: `Test Guest ${RUN}`, c: `${SESSION}-g` };
const ACT = { id: `e2e-act-sup-${RUN}`, name: `Test act sup ${RUN}` };

test.describe.configure({ timeout: 90_000 });

async function rebuildCast() {
  await db.query(`DELETE FROM "SetParticipant" WHERE "setId" = $1`, [SET.id]);
  await db.query(
    `INSERT INTO "SetParticipant" ("setId", "personId", "roleDefinitionId")
     SELECT $1, sc."personId", sc."roleDefinitionId" FROM "SessionContribution" sc WHERE sc."sessionId" = $2`,
    [SET.id, SESSION],
  );
}

test.beforeAll(async () => {
  await db.connect();
  for (const p of [MODEL, GUEST]) {
    await db.query(`INSERT INTO "Person" (id, "icgId", "sexAtBirth") VALUES ($1, $2, 'female')`, [p.id, p.icg]);
    await db.query(`INSERT INTO "PersonAlias" (id, "personId", name, "isCommon") VALUES ($1, $2, $3, true)`, [`${p.id}-a`, p.id, p.name]);
  }
  await db.query(`INSERT INTO "Session" (id, name, "updatedAt") VALUES ($1, $2, now())`, [SESSION, `Test Session sup ${RUN}`]);
  await db.query(
    `INSERT INTO "SessionContribution" (id, "sessionId", "personId", "roleDefinitionId") VALUES ($1, $2, $3, 'crd_model'), ($4, $2, $5, 'crd_appearance')`,
    [MODEL.c, SESSION, MODEL.id, GUEST.c, GUEST.id],
  );
  await db.query(`INSERT INTO "Set" (id, type, title, "updatedAt") VALUES ($1, 'photo', $2, now())`, [SET.id, SET.title]);
  await db.query(`INSERT INTO "SetSession" ("setId", "sessionId", "isPrimary") VALUES ($1, $2, true)`, [SET.id, SESSION]);
  await rebuildCast();
  await db.query(`INSERT INTO "IntensityAct" (id, "scenarioId", name, level) VALUES ($1, 'dsit-solo', $2, 2)`, [ACT.id, ACT.name]);
});

test.afterAll(async () => {
  await db.query(`DELETE FROM "SetParticipant" WHERE "setId" = $1`, [SET.id]);
  await db.query(`DELETE FROM "SetSession" WHERE "setId" = $1`, [SET.id]);
  await db.query(`DELETE FROM "Set" WHERE id = $1`, [SET.id]);
  await db.query(`DELETE FROM "SessionContribution" WHERE "sessionId" = $1`, [SESSION]);
  await db.query(`DELETE FROM "IntensityAct" WHERE id = $1`, [ACT.id]);
  await db.query(`DELETE FROM "Session" WHERE id = $1`, [SESSION]);
  await db.query(`DELETE FROM "PersonAlias" WHERE "personId" IN ($1, $2)`, [MODEL.id, GUEST.id]);
  await db.query(`DELETE FROM "Person" WHERE id IN ($1, $2)`, [MODEL.id, GUEST.id]);
  await db.end();
});

const roleOf = async (c: string) =>
  (await db.query<{ r: string }>(`SELECT "roleDefinitionId" AS r FROM "SessionContribution" WHERE id = $1`, [c])).rows[0]?.r;

test("the set shows the guest after the model, under Appearing", async ({ page }) => {
  await page.goto(`/sets/${SET.id}`);
  const model = page.getByRole("link", { name: MODEL.name }).first();
  const guest = page.getByRole("link", { name: `${GUEST.name} (appearing)` });
  await expect(model).toBeVisible();
  await expect(guest).toBeVisible();
  await expect(page.getByText("Appearing", { exact: true }).first()).toBeVisible();
  // After the model in the rail
  const [mBox, gBox] = [await model.boundingBox(), await guest.boundingBox()];
  expect(gBox!.x).toBeGreaterThan(mBox!.x);
});

test("a person filter on /sets: the model by default, the guest only with incl. appearing", async ({ page }) => {
  const card = page.getByRole("heading", { name: SET.title, exact: true });
  await page.goto(`/sets?type=all&personId=${GUEST.id}&personName=${encodeURIComponent(GUEST.name)}`);
  await page.waitForLoadState("networkidle");
  await expect(card).toHaveCount(0);
  await page.goto(`/sets?type=all&personId=${GUEST.id}&personName=${encodeURIComponent(GUEST.name)}&personSupport=true`);
  await expect(card).toBeVisible();
  await page.goto(`/sets?type=all&personId=${MODEL.id}&personName=${encodeURIComponent(MODEL.name)}`);
  await expect(card).toBeVisible();
});

test("switching the model to Appearance asks first when acts would go, then drops them", async ({ page }) => {
  await db.query(`INSERT INTO "ContributionAct" (id, "contributionId", "actId") VALUES ($1, $2, $3)`, [`e2e-ca-sup-${RUN}`, MODEL.c, ACT.id]);
  await page.goto(`/sessions/${SESSION}`);
  await page.getByRole("button", { name: new RegExp(`^Role of ${MODEL.name} \\(${MODEL.icg}\\): Model`) }).click();
  await page.getByRole("menuitem", { name: /Appearance/ }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("will be removed");
  await dialog.getByRole("button", { name: "Switch and remove" }).click();
  await expect.poll(() => roleOf(MODEL.c), { timeout: 15_000 }).toBe("crd_appearance");
  await expect
    .poll(async () => (await db.query(`SELECT 1 FROM "ContributionAct" WHERE "contributionId" = $1`, [MODEL.c])).rowCount)
    .toBe(0);

  // And back — no acts, no question
  await page.getByRole("button", { name: new RegExp(`^Role of ${MODEL.name} \\(${MODEL.icg}\\): Appearance`) }).click();
  await page.getByRole("menuitem", { name: /Model/ }).click();
  await expect.poll(() => roleOf(MODEL.c), { timeout: 15_000 }).toBe("crd_model");
  await rebuildCast();
});
