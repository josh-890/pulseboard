import "dotenv/config";
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// Intensity filters (ADR-0036, slice 4): the Intensity facet on the session
// browser, the person browser's peak, and intensity:scenario>=N in the query.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36);
const P = { id: `e2e-person-if-${RUN}`, icg: `E2E-IF-${RUN}`.toUpperCase(), name: `Test Inta ${RUN}` };
const HIGH = { id: `e2e-session-if-${RUN}-h`, name: `Test intense ${RUN} high` };
const LOW = { id: `e2e-session-if-${RUN}-l`, name: `Test intense ${RUN} low` };
const ACTS = { high: `e2e-act-if-${RUN}-h`, low: `e2e-act-if-${RUN}-l` };

test.beforeAll(async () => {
  await db.connect();
  await db.query(`INSERT INTO "Person" (id, "icgId", "sexAtBirth") VALUES ($1, $2, 'female')`, [P.id, P.icg]);
  await db.query(`INSERT INTO "PersonAlias" (id, "personId", name, "isCommon") VALUES ($1, $2, $3, true)`, [`${P.id}-a`, P.id, P.name]);
  await db.query(`INSERT INTO "IntensityAct" (id, "scenarioId", name, level) VALUES ($1, 'dsit-solo', $2, 7.5), ($3, 'dsit-solo', $4, 2)`, [
    ACTS.high,
    `Test high act ${RUN}`,
    ACTS.low,
    `Test low act ${RUN}`,
  ]);
  for (const [s, act] of [
    [HIGH, ACTS.high],
    [LOW, ACTS.low],
  ] as const) {
    await db.query(`INSERT INTO "Session" (id, name, "updatedAt") VALUES ($1, $2, now())`, [s.id, s.name]);
    await db.query(`INSERT INTO "SessionContribution" (id, "sessionId", "personId", "roleDefinitionId") VALUES ($1, $2, $3, 'crd_model')`, [
      `${s.id}-c`,
      s.id,
      P.id,
    ]);
    await db.query(`INSERT INTO "ContributionAct" (id, "contributionId", "actId") VALUES ($1, $2, $3)`, [`${s.id}-ca`, `${s.id}-c`, act]);
  }
});

test.afterAll(async () => {
  await db.query(`DELETE FROM "SessionContribution" WHERE "personId" = $1`, [P.id]);
  await db.query(`DELETE FROM "Session" WHERE id = ANY($1)`, [[HIGH.id, LOW.id]]);
  await db.query(`DELETE FROM "IntensityAct" WHERE id = ANY($1)`, [[ACTS.high, ACTS.low]]);
  await db.query(`DELETE FROM "PersonAlias" WHERE "personId" = $1`, [P.id]);
  await db.query(`DELETE FROM "Person" WHERE id = $1`, [P.id]);
  await db.end();
});

test("the Intensity facet keeps the sessions at or above the value", async ({ page }) => {
  await page.goto(`/sessions?q=${encodeURIComponent(`Test intense ${RUN}`)}`);
  await expect(page.getByText(LOW.name)).toBeVisible();
  await page.getByRole("button", { name: "Intensity", exact: true }).click();
  await page.getByRole("option", { name: "≥ 7" }).click();
  await expect(page).toHaveURL(/intensity=7/);
  await expect(page.getByText(HIGH.name)).toBeVisible();
  await expect(page.getByText(LOW.name)).toHaveCount(0);
});

test("a person's peak, and intensity within a scenario in the query", async ({ page }) => {
  await page.goto(`/people?q=${encodeURIComponent(P.name)}&intensity=7`);
  const card = page.getByRole("link", { name: new RegExp(P.name) });
  await expect(card).toBeVisible();
  await page.goto(`/people?q=${encodeURIComponent(P.name)}&intensity=9`);
  await expect(page.getByRole("button", { name: "Peak intensity: ≥ 9" })).toBeVisible();
  await expect(card).toHaveCount(0); // the peak is 7.5

  await page.goto(`/sessions?q=${encodeURIComponent(`Test intense ${RUN}`)}&tags=${encodeURIComponent("intensity:Solo<3")}`);
  await expect(page.getByText(LOW.name)).toBeVisible();
  await expect(page.getByText(HIGH.name)).toHaveCount(0);
});
