import "dotenv/config";
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// Session merge (2026-10-18): two sessions with the same unhelpful name, one set
// each, the same person and label. Started from the newer one, the dialog
// suggests the older without typing (with the reasons), finds it by set title
// too, and merges into the older one — where the page then lands.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36);
const NAME = `Test Session Set 1 ${RUN}`; // the same on both
const ids = {
  label: `e2e-label-sm-${RUN}`,
  channel: `e2e-channel-sm-${RUN}`,
  person: `e2e-person-sm-${RUN}`,
  older: `e2e-session-sm-old-${RUN}`,
  newer: `e2e-session-sm-new-${RUN}`,
  setOld: `e2e-set-sm-old-${RUN}`,
  setNew: `e2e-set-sm-new-${RUN}`,
};
const ICG = `E2E-SM-${RUN}`.toUpperCase();
const titleOld = `Test Set merge spring ${RUN}`;
const titleNew = `Test Set merge autumn ${RUN}`;

test.beforeAll(async () => {
  await db.connect();
  await db.query(`INSERT INTO "Label" (id, name) VALUES ($1, $2)`, [ids.label, `Test Label merge ${RUN}`]);
  await db.query(`INSERT INTO "Channel" (id, name, "labelId") VALUES ($1, $2, $3)`, [ids.channel, `Test Channel merge ${RUN}`, ids.label]);
  await db.query(`INSERT INTO "Person" (id, "icgId") VALUES ($1, $2)`, [ids.person, ICG]);
  await db.query(`INSERT INTO "PersonAlias" (id, "personId", name, "isCommon") VALUES ($1, $2, $3, true)`, [`${ids.person}-a`, ids.person, `Merge Model ${RUN}`]);
  const role = (await db.query<{ id: string }>(
    `SELECT d.id FROM "ContributionRoleDefinition" d JOIN "ContributionRoleGroup" g ON g.id = d."groupId" WHERE g.name <> 'Behind Camera' LIMIT 1`,
  )).rows[0]!.id;
  for (const [session, set, title, date] of [
    [ids.older, ids.setOld, titleOld, "2004-03-01"],
    [ids.newer, ids.setNew, titleNew, "2004-09-01"],
  ] as const) {
    await db.query(`INSERT INTO "Session" (id, name, date, "datePrecision", "updatedAt") VALUES ($1, $2, $3, 'DAY', now())`, [session, NAME, date]);
    await db.query(`INSERT INTO "Set" (id, type, title, "channelId", "releaseDate", "releaseDatePrecision", "updatedAt") VALUES ($1, 'photo', $2, $3, $4, 'DAY', now())`, [set, title, ids.channel, date]);
    await db.query(`INSERT INTO "SetSession" ("setId", "sessionId", "isPrimary") VALUES ($1, $2, true)`, [set, session]);
    await db.query(`INSERT INTO "SessionContribution" (id, "sessionId", "personId", "roleDefinitionId") VALUES ($1, $2, $3, $4)`, [`${session}-c`, session, ids.person, role]);
  }
});

test.afterAll(async () => {
  const sessions = [ids.older, ids.newer];
  const sets = [ids.setOld, ids.setNew];
  await db.query(`DELETE FROM "SetSession" WHERE "sessionId" = ANY($1::text[]) OR "setId" = ANY($2::text[])`, [sessions, sets]);
  await db.query(`DELETE FROM "SessionContribution" WHERE "sessionId" = ANY($1::text[])`, [sessions]);
  await db.query(`DELETE FROM "SetParticipant" WHERE "setId" = ANY($1::text[])`, [sets]);
  await db.query(`DELETE FROM "Set" WHERE id = ANY($1::text[])`, [sets]);
  await db.query(`DELETE FROM "Session" WHERE id = ANY($1::text[])`, [sessions]);
  await db.query(`DELETE FROM "Channel" WHERE id = $1`, [ids.channel]);
  await db.query(`DELETE FROM "Label" WHERE id = $1`, [ids.label]);
  await db.query(`DELETE FROM "PersonAlias" WHERE "personId" = $1`, [ids.person]);
  await db.query(`DELETE FROM "Person" WHERE id = $1`, [ids.person]);
  await db.end();
});

test("started from the newer session, the older one is suggested and stays", async ({ page }) => {
  await page.goto(`/sessions/${ids.newer}`);
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: /Merge with/ }).click();
  const dialog = page.getByRole("dialog");

  // Suggested without typing, with why
  const suggestion = dialog.getByRole("option").filter({ hasText: titleOld });
  await expect(suggestion).toBeVisible({ timeout: 20_000 });
  await expect(suggestion.getByText(`Same person: Merge Model ${RUN} (${ICG})`)).toBeVisible();
  await expect(suggestion.getByText(`Same label: Test Label merge ${RUN}`)).toBeVisible();

  // Found by its set title as well
  await dialog.getByRole("combobox", { name: "Search sessions" }).fill(`spring ${RUN}`);
  await expect(dialog.getByText("Matches")).toBeVisible();
  const match = dialog.getByRole("option").filter({ hasText: titleOld });
  await expect(match).toHaveCount(1);
  await match.click();

  // The older one stays, whichever side it was started from
  await expect(dialog.locator('[data-merge-role="survivor"]')).toContainText(titleOld);
  await expect(dialog.locator('[data-merge-role="absorbed"]')).toContainText(titleNew);
  await expect(dialog.getByText("This session is the newer one")).toBeVisible();
  await expect(dialog.getByText("Afterwards: 0 photos · 1 person · 2 sets")).toBeVisible();

  await dialog.getByRole("button", { name: "Merge sessions" }).click();
  await expect(page).toHaveURL(new RegExp(`/sessions/${ids.older}$`), { timeout: 20_000 });
  expect((await db.query(`SELECT 1 FROM "Session" WHERE id = $1`, [ids.newer])).rowCount).toBe(0);
  const links = await db.query<{ setId: string }>(`SELECT "setId" FROM "SetSession" WHERE "sessionId" = $1 ORDER BY "setId"`, [ids.older]);
  expect(links.rows.map((r) => r.setId).sort()).toEqual([ids.setNew, ids.setOld].sort());
});
