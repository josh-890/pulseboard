import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// "Like last time" and the channel's usual preset (2026-10-27): the menu names
// the model's last confirmed session (same channel first) before copying; the
// copy lands to review with Undo. The preset most confirmed models of the
// channel carry is the first pill and is never applied by itself.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const CHANNEL = { id: `e2e-channel-ilt-${RUN}`, name: `Test channel ilt ${RUN}` };
const A = { id: `e2e-person-ilt-a-${RUN}`, icg: `E2E-ILTA-${RUN}`.toUpperCase(), name: `Test Anna ${RUN}` };
const B = { id: `e2e-person-ilt-b-${RUN}`, icg: `E2E-ILTB-${RUN}`.toUpperCase(), name: `Test Bea ${RUN}` };
const OLD = { id: `e2e-session-ilt-old-${RUN}`, date: "2019-05-01", c: `e2e-session-ilt-old-${RUN}-ca` };
const BEA = { id: `e2e-session-ilt-bea-${RUN}`, date: "2020-01-01", c: `e2e-session-ilt-bea-${RUN}-cb` };
const NOW = { id: `e2e-session-ilt-now-${RUN}`, date: "2024-06-01", c: `e2e-session-ilt-now-${RUN}-ca` };
const ACT = { id: `e2e-act-ilt-${RUN}`, name: `Test act ilt ${RUN}` };
const PRESET = { id: `e2e-preset-ilt-${RUN}`, name: `Test preset ilt ${RUN}` };

test.describe.configure({ timeout: 90_000 });

test.beforeAll(async () => {
  await db.connect();
  for (const p of [A, B]) {
    await db.query(`INSERT INTO "Person" (id, "icgId", "sexAtBirth") VALUES ($1, $2, 'female')`, [p.id, p.icg]);
    await db.query(`INSERT INTO "PersonAlias" (id, "personId", name, "isCommon") VALUES ($1, $2, $3, true)`, [`${p.id}-a`, p.id, p.name]);
  }
  await db.query(`INSERT INTO "Channel" (id, name) VALUES ($1, $2)`, [CHANNEL.id, CHANNEL.name]);
  for (const [s, who, reviewed] of [[OLD, A, true], [BEA, B, true], [NOW, A, false]] as const) {
    await db.query(`INSERT INTO "Session" (id, name, date, "datePrecision", "updatedAt") VALUES ($1, $2, $3, 'DAY', now())`, [s.id, `Test session ilt ${s.date} ${RUN}`, s.date]);
    await db.query(`INSERT INTO "Set" (id, title, type, "channelId", "updatedAt") VALUES ($1, $2, 'photo', $3, now())`, [`${s.id}-set`, `Test set ilt ${s.date} ${RUN}`, CHANNEL.id]);
    await db.query(`INSERT INTO "SetSession" ("setId", "sessionId", "isPrimary") VALUES ($1, $2, true)`, [`${s.id}-set`, s.id]);
    await db.query(
      `INSERT INTO "SessionContribution" (id, "sessionId", "personId", "roleDefinitionId", "intensityReviewedAt") VALUES ($1, $2, $3, 'crd_model', ${reviewed ? "now()" : "NULL"})`,
      [s.c, s.id, who.id],
    );
  }
  await db.query(`INSERT INTO "IntensityAct" (id, "scenarioId", name, level) VALUES ($1, 'dsit-solo', $2, 3)`, [ACT.id, ACT.name]);
  await db.query(`INSERT INTO "IntensityPreset" (id, "scenarioId", name, "sortOrder") VALUES ($1, 'dsit-solo', $2, -1000)`, [PRESET.id, PRESET.name]);
  await db.query(`INSERT INTO "IntensityPresetAct" ("presetId", "actId") VALUES ($1, $2)`, [PRESET.id, ACT.id]);
  // Last time Anna did the act; Bea's confirmed session carries the preset — the channel's usual
  await db.query(`INSERT INTO "ContributionAct" (id, "contributionId", "actId") VALUES ($1, $2, $3)`, [`${OLD.c}-act`, OLD.c, ACT.id]);
  await db.query(`INSERT INTO "ContributionAct" (id, "contributionId", "actId", "presetId") VALUES ($1, $2, $3, $4)`, [`${BEA.c}-act`, BEA.c, ACT.id, PRESET.id]);
});

test.beforeEach(async () => {
  await db.query(`DELETE FROM "ContributionAct" WHERE "contributionId" = $1`, [NOW.c]);
  await db.query(`UPDATE "SessionContribution" SET "intensityReviewedAt" = NULL WHERE id = $1`, [NOW.c]);
});

test.afterAll(async () => {
  const sessions = [OLD.id, BEA.id, NOW.id];
  await db.query(`DELETE FROM "SessionContribution" WHERE "sessionId" = ANY($1)`, [sessions]);
  await db.query(`DELETE FROM "SetSession" WHERE "sessionId" = ANY($1)`, [sessions]);
  await db.query(`DELETE FROM "SetParticipant" WHERE "setId" = ANY($1)`, [sessions.map((s) => `${s}-set`)]);
  await db.query(`DELETE FROM "Set" WHERE id = ANY($1)`, [sessions.map((s) => `${s}-set`)]);
  await db.query(`DELETE FROM "Session" WHERE id = ANY($1)`, [sessions]);
  await db.query(`DELETE FROM "IntensityPreset" WHERE id = $1`, [PRESET.id]);
  await db.query(`DELETE FROM "IntensityAct" WHERE id = $1`, [ACT.id]);
  await db.query(`DELETE FROM "Channel" WHERE id = $1`, [CHANNEL.id]);
  for (const p of [A, B]) {
    await db.query(`DELETE FROM "PersonAlias" WHERE "personId" = $1`, [p.id]);
    await db.query(`DELETE FROM "Person" WHERE id = $1`, [p.id]);
  }
  await db.end();
});

const ticks = async () =>
  (await db.query<{ act: string; preset: string | null }>(`SELECT "actId" AS act, "presetId" AS preset FROM "ContributionAct" WHERE "contributionId" = $1`, [NOW.c])).rows;

async function openPanel(page: Page) {
  await page.goto(`/sessions/${NOW.id}`);
  const panel = page.getByRole("region", { name: "Intensity panel" });
  await expect(async () => {
    if (!(await panel.isVisible())) await page.getByRole("button", { name: "Intensity", exact: true }).first().click();
    await expect(panel).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  return panel;
}

test("Like last time names the session, copies it to review, Undo takes it back", async ({ page }) => {
  const panel = await openPanel(page);
  await panel.getByRole("button", { name: "Like last time…" }).click();
  const item = page.getByRole("menuitem", { name: new RegExp(`${A.name} \\(${A.icg}\\)`) });
  await expect(item).toContainText("May 1, 2019");
  await expect(item).toContainText(CHANNEL.name);
  await item.click();
  await expect.poll(ticks).toEqual([{ act: ACT.id, preset: null }]);
  await expect(panel.getByText("To review — check the ticks against the photos")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(ticks).toEqual([]);
});

test("the channel's usual preset is the first pill and applies only when clicked", async ({ page }) => {
  const panel = await openPanel(page);
  const usual = panel.getByRole("button", { name: `Apply ${PRESET.name}, usual for ${CHANNEL.name}, to ${A.name} (${A.icg})` });
  await expect(usual).toBeVisible();
  expect(await ticks()).toEqual([]);
  await usual.click();
  await expect.poll(ticks).toEqual([{ act: ACT.id, preset: PRESET.id }]);
});
