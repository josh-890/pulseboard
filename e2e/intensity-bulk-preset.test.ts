import "dotenv/config";
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// A preset in bulk (2026-10-27, slice 4): select sessions on /sessions, pick a
// preset in "Intensity preset…" — the dialog says whom it reaches and whom it
// leaves alone — apply: the models land to review; Undo takes it back.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const NAME = `Test session ibp ${RUN}`;
const ALONE = { id: `e2e-session-ibp-a-${RUN}`, person: `e2e-person-ibp-a-${RUN}`, c: `e2e-session-ibp-a-${RUN}-c` };
const DONE = { id: `e2e-session-ibp-d-${RUN}`, person: `e2e-person-ibp-d-${RUN}`, c: `e2e-session-ibp-d-${RUN}-c` };
const ACT = { id: `e2e-act-ibp-${RUN}`, name: `Test act ibp ${RUN}` };
const PRESET = { id: `e2e-preset-ibp-${RUN}`, name: `Test preset ibp ${RUN}` };

test.describe.configure({ timeout: 90_000 });

test.beforeAll(async () => {
  await db.connect();
  for (const [s, reviewed] of [[ALONE, false], [DONE, true]] as const) {
    await db.query(`INSERT INTO "Person" (id, "icgId", "sexAtBirth") VALUES ($1, $2, 'female')`, [s.person, s.person.toUpperCase()]);
    await db.query(`INSERT INTO "Session" (id, name, "updatedAt") VALUES ($1, $2, now())`, [s.id, NAME]);
    await db.query(
      `INSERT INTO "SessionContribution" (id, "sessionId", "personId", "roleDefinitionId", "intensityReviewedAt") VALUES ($1, $2, $3, 'crd_model', ${reviewed ? "now()" : "NULL"})`,
      [s.c, s.id, s.person],
    );
  }
  await db.query(`INSERT INTO "IntensityAct" (id, "scenarioId", name, level) VALUES ($1, 'dsit-solo', $2, 2)`, [ACT.id, ACT.name]);
  await db.query(`INSERT INTO "IntensityPreset" (id, "scenarioId", name, "sortOrder") VALUES ($1, 'dsit-solo', $2, -1000)`, [PRESET.id, PRESET.name]);
  await db.query(`INSERT INTO "IntensityPresetAct" ("presetId", "actId") VALUES ($1, $2)`, [PRESET.id, ACT.id]);
});

test.afterAll(async () => {
  await db.query(`DELETE FROM "SessionContribution" WHERE "sessionId" IN ($1, $2)`, [ALONE.id, DONE.id]);
  await db.query(`DELETE FROM "Session" WHERE id IN ($1, $2)`, [ALONE.id, DONE.id]);
  await db.query(`DELETE FROM "Person" WHERE id IN ($1, $2)`, [ALONE.person, DONE.person]);
  await db.query(`DELETE FROM "IntensityPreset" WHERE id = $1`, [PRESET.id]);
  await db.query(`DELETE FROM "IntensityAct" WHERE id = $1`, [ACT.id]);
  await db.end();
});

const ticks = async (c: string) =>
  (await db.query<{ act: string; preset: string | null }>(`SELECT "actId" AS act, "presetId" AS preset FROM "ContributionAct" WHERE "contributionId" = $1`, [c])).rows;

test("select sessions, preview whom the preset reaches, apply to review — Undo takes it back", async ({ page }) => {
  await page.goto(`/sessions?q=${encodeURIComponent(NAME)}`);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  const boxes = page.getByRole("button", { name: `Select ${NAME}`, exact: true });
  await expect(boxes).toHaveCount(2);
  // A selected card's box reads "Deselect …", so the first unselected one is always first
  await boxes.first().click();
  await expect(boxes).toHaveCount(1);
  await boxes.first().click();
  await page.getByRole("button", { name: "Intensity preset…" }).click();

  const dialog = page.getByRole("dialog", { name: "Intensity preset for 2 sessions" });
  await dialog.getByRole("radio", { name: PRESET.name }).click();
  await expect(dialog.getByText(/for 1 model in 1 session/)).toBeVisible();
  await expect(dialog.getByText("1 model already confirmed — left alone.")).toBeVisible();
  await dialog.getByRole("button", { name: "Apply to 1 model" }).click();
  await expect(dialog).toBeHidden();

  await expect.poll(() => ticks(ALONE.c)).toEqual([{ act: ACT.id, preset: PRESET.id }]);
  expect(await ticks(DONE.c)).toEqual([]);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => ticks(ALONE.c)).toEqual([]);
});
