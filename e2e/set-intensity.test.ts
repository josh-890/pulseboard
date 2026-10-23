import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// Intensity on a set (2026-10-24): the session's panel opens on the set and
// saves on the session; the set shows its session's acts — and, for a session
// split into two sets, can leave an act out ("not in set"), hinted at when the
// act's evidence photos are all in the other set. The set card carries a heat pill.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const SESSION = `e2e-session-sti-${RUN}`;
const P = { id: `e2e-person-sti-${RUN}`, icg: `E2E-STI-${RUN}`.toUpperCase(), name: `Test Set Model ${RUN}`, c: `${SESSION}-c` };
const TAME = { id: `e2e-set-sti-tame-${RUN}`, title: `Test Set tame ${RUN}` };
const FULL = { id: `e2e-set-sti-full-${RUN}`, title: `Test Set full ${RUN}` };
const LOW = { id: `e2e-act-sti-low-${RUN}`, name: `Test act low ${RUN}` };
const HIGH = { id: `e2e-act-sti-high-${RUN}`, name: `Test act high ${RUN}` };
const PHOTO = `e2e-media-sti-${RUN}`;

test.describe.configure({ timeout: 90_000 });

test.beforeAll(async () => {
  await db.connect();
  await db.query(`INSERT INTO "Person" (id, "icgId", "sexAtBirth") VALUES ($1, $2, 'female')`, [P.id, P.icg]);
  await db.query(`INSERT INTO "PersonAlias" (id, "personId", name, "isCommon") VALUES ($1, $2, $3, true)`, [`${P.id}-a`, P.id, P.name]);
  await db.query(`INSERT INTO "Session" (id, name, "updatedAt") VALUES ($1, $2, now())`, [SESSION, `Test Session sti ${RUN}`]);
  await db.query(`INSERT INTO "SessionContribution" (id, "sessionId", "personId", "roleDefinitionId") VALUES ($1, $2, $3, 'crd_model')`, [P.c, SESSION, P.id]);
  await db.query(`INSERT INTO "IntensityAct" (id, "scenarioId", name, level) VALUES ($1, 'dsit-solo', $2, 2), ($3, 'dsit-solo', $4, 6)`, [
    LOW.id,
    LOW.name,
    HIGH.id,
    HIGH.name,
  ]);
  for (const s of [TAME, FULL]) {
    await db.query(`INSERT INTO "Set" (id, type, title, "updatedAt") VALUES ($1, 'photo', $2, now())`, [s.id, s.title]);
    await db.query(`INSERT INTO "SetSession" ("setId", "sessionId") VALUES ($1, $2)`, [s.id, SESSION]);
  }
  // The explicit photo is only in the full set
  await db.query(
    `INSERT INTO "MediaItem" (id, "sessionId", "mediaType", filename, "mimeType", size, "originalWidth", "originalHeight", "updatedAt")
     VALUES ($1, $2, 'PHOTO', $3, 'image/jpeg', 1, 1, 1, now())`,
    [PHOTO, SESSION, `${RUN}-sti.jpg`],
  );
  await db.query(`INSERT INTO "SetMediaItem" ("setId", "mediaItemId") VALUES ($1, $2)`, [FULL.id, PHOTO]);
});

test.beforeEach(async () => {
  await db.query(`DELETE FROM "SetActExclusion" WHERE "setId" IN ($1, $2)`, [TAME.id, FULL.id]);
  await db.query(`DELETE FROM "ContributionAct" WHERE "contributionId" = $1`, [P.c]);
});

test.afterAll(async () => {
  await db.query(`DELETE FROM "SetActExclusion" WHERE "setId" IN ($1, $2)`, [TAME.id, FULL.id]);
  await db.query(`DELETE FROM "SetMediaItem" WHERE "setId" IN ($1, $2)`, [TAME.id, FULL.id]);
  await db.query(`DELETE FROM "SetSession" WHERE "setId" IN ($1, $2)`, [TAME.id, FULL.id]);
  await db.query(`DELETE FROM "Set" WHERE id IN ($1, $2)`, [TAME.id, FULL.id]);
  await db.query(`DELETE FROM "SessionContribution" WHERE "sessionId" = $1`, [SESSION]);
  await db.query(`DELETE FROM "MediaItem" WHERE id = $1`, [PHOTO]);
  await db.query(`DELETE FROM "IntensityAct" WHERE id IN ($1, $2)`, [LOW.id, HIGH.id]);
  await db.query(`DELETE FROM "Session" WHERE id = $1`, [SESSION]);
  await db.query(`DELETE FROM "PersonAlias" WHERE "personId" = $1`, [P.id]);
  await db.query(`DELETE FROM "Person" WHERE id = $1`, [P.id]);
  await db.end();
});

async function openPanel(page: Page, setId: string) {
  await page.goto(`/sets/${setId}`);
  const panel = page.getByRole("region", { name: "Intensity panel" });
  await expect(async () => {
    if (!(await panel.isVisible())) await page.getByRole("button", { name: "Intensity", exact: true }).first().click();
    await expect(panel).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
  return panel;
}
const ticked = async () =>
  (await db.query<{ actId: string }>(`SELECT "actId" FROM "ContributionAct" WHERE "contributionId" = $1 ORDER BY 1`, [P.c])).rows.map(
    (r) => r.actId,
  );

test("ticking on the set saves on the session; the session shows it", async ({ page }) => {
  const panel = await openPanel(page, TAME.id);
  await panel.getByRole("checkbox", { name: LOW.name }).check();
  await expect.poll(ticked).toEqual([LOW.id]);
  await page.goto(`/sessions/${SESSION}`);
  await expect(page.getByText(P.name).first()).toBeVisible();
  await expect.poll(ticked).toEqual([LOW.id]);
});

test("a split session: leave an act out of one set — hinted when its photo is elsewhere; values and the card follow", async ({ page }) => {
  await db.query(`INSERT INTO "ContributionAct" (id, "contributionId", "actId") VALUES ($1, $2, $3), ($4, $2, $5)`, [
    `e2e-ca-sti-low-${RUN}`,
    P.c,
    LOW.id,
    `e2e-ca-sti-high-${RUN}`,
    HIGH.id,
  ]);
  await db.query(`INSERT INTO "ContributionActMedia" ("contributionActId", "mediaItemId") VALUES ($1, $2)`, [`e2e-ca-sti-high-${RUN}`, PHOTO]);

  const panel = await openPanel(page, TAME.id);
  const chip = panel.getByRole("button", { name: new RegExp(P.name) }).first();
  await expect(chip).toContainText("6");
  // The high act's photo is only in the other set — the hint, then leave it out here
  await expect(panel.getByText("no photo here")).toBeVisible();
  await panel.getByRole("button", { name: `Leave ${HIGH.name} out of this set` }).click();
  await expect
    .poll(async () => (await db.query(`SELECT "contributionActId" FROM "SetActExclusion" WHERE "setId" = $1`, [TAME.id])).rows)
    .toEqual([{ contributionActId: `e2e-ca-sti-high-${RUN}` }]);
  await expect(chip).toContainText("2");
  await expect(panel.getByRole("button", { name: `Show ${HIGH.name} in this set` })).toBeVisible();

  // The cards: tame 2, full 6
  await page.goto(`/sets?type=all&q=${encodeURIComponent(RUN)}`);
  // The pill of the card whose heading is the set's title
  const pill = (t: string) =>
    page
      .getByRole("heading", { name: t, exact: true })
      .locator('xpath=ancestor::*[.//span[@title="Intensity of this set"]][1]')
      .getByTitle("Intensity of this set");
  await expect(pill(TAME.title)).toHaveText("2");
  await expect(pill(FULL.title)).toHaveText("6");
});
