import "dotenv/config";
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// The rating queue (2026-10-25): "Rate these" on a /sessions list opens its
// first unrated session, by channel then date, with the panel open; a tick is
// the rating (no confirming since 2026-11-28); "Next session" (⏎) goes on and
// the Rated filter finds the rated ones.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const TAG = `e2e-rq-${RUN}`;
const CH = { a: `e2e-channel-rqa-${RUN}`, b: `e2e-channel-rqb-${RUN}` };
// First by channel (Alpha before Beta), though its date is later
const FIRST = { id: `e2e-session-rq1-${RUN}`, name: `Test ${TAG} first`, ch: CH.a, date: "2022-05-01" };
const SECOND = { id: `e2e-session-rq2-${RUN}`, name: `Test ${TAG} second`, ch: CH.b, date: "2019-05-01" };
const PERSON = { id: `e2e-person-rq-${RUN}`, icg: `E2E-RQ-${RUN}`.toUpperCase(), name: `Test Rita ${RUN}` };
const ACT = { id: `e2e-act-rq-${RUN}`, name: `e2e rq act ${RUN}` };

test.describe.configure({ timeout: 90_000 });

test.beforeAll(async () => {
  await db.connect();
  await db.query(`INSERT INTO "Person" (id, "icgId", "sexAtBirth") VALUES ($1, $2, 'female')`, [PERSON.id, PERSON.icg]);
  await db.query(`INSERT INTO "PersonAlias" (id, "personId", name, "isCommon") VALUES ($1, $2, $3, true)`, [`${PERSON.id}-a`, PERSON.id, PERSON.name]);
  await db.query(`INSERT INTO "Channel" (id, name) VALUES ($1, $2), ($3, $4)`, [CH.a, `Test Alpha ${RUN}`, CH.b, `Test Beta ${RUN}`]);
  await db.query(`INSERT INTO "IntensityAct" (id, "scenarioId", name, level) VALUES ($1, 'dsit-solo', $2, 2)`, [ACT.id, ACT.name]);
  for (const s of [FIRST, SECOND]) {
    await db.query(`INSERT INTO "Session" (id, name, date, "updatedAt") VALUES ($1, $2, $3, now())`, [s.id, s.name, s.date]);
    await db.query(`INSERT INTO "Set" (id, title, type, "channelId", "updatedAt") VALUES ($1, $2, 'photo', $3, now())`, [`${s.id}-set`, s.name, s.ch]);
    await db.query(`INSERT INTO "SetSession" ("setId", "sessionId", "isPrimary") VALUES ($1, $2, true)`, [`${s.id}-set`, s.id]);
    await db.query(`INSERT INTO "SessionContribution" (id, "sessionId", "personId", "roleDefinitionId") VALUES ($1, $2, $3, 'crd_model')`, [
      `${s.id}-c`,
      s.id,
      PERSON.id,
    ]);
  }
});

test.afterAll(async () => {
  const sessions = [FIRST.id, SECOND.id];
  await db.query(`DELETE FROM "SessionContribution" WHERE "sessionId" = ANY($1)`, [sessions]);
  await db.query(`DELETE FROM "IntensityAct" WHERE id = $1`, [ACT.id]);
  await db.query(`DELETE FROM "SetSession" WHERE "sessionId" = ANY($1)`, [sessions]);
  await db.query(`DELETE FROM "SetParticipant" WHERE "setId" = ANY($1)`, [sessions.map((s) => `${s}-set`)]);
  await db.query(`DELETE FROM "Set" WHERE id = ANY($1)`, [sessions.map((s) => `${s}-set`)]);
  await db.query(`DELETE FROM "Session" WHERE id = ANY($1)`, [sessions]);
  await db.query(`DELETE FROM "Channel" WHERE id IN ($1, $2)`, [CH.a, CH.b]);
  await db.query(`DELETE FROM "PersonAlias" WHERE "personId" = $1`, [PERSON.id]);
  await db.query(`DELETE FROM "Person" WHERE id = $1`, [PERSON.id]);
  await db.end();
});

test("Rate these walks the list by channel; a tick rates, Next goes on; Rated finds the rated", async ({ page }) => {
  await page.goto(`/sessions?q=${encodeURIComponent(TAG)}`);
  await page.getByRole("link", { name: "Rate these" }).click();

  // The first visit compiles the route and the session page
  await expect(page).toHaveURL(new RegExp(`/sessions/${FIRST.id}\\?rate=`), { timeout: 30_000 });
  const bar = page.getByRole("navigation", { name: "Rating queue" });
  await expect(bar).toContainText("Rating 1 / 2");
  await expect(bar).toContainText(`Test Alpha ${RUN}`);
  const panel = page.getByRole("region", { name: "Intensity panel" });
  await expect(panel).toBeVisible();

  // ] skips ahead, [ comes back
  await page.locator("body").press("]");
  await expect(page).toHaveURL(new RegExp(`/sessions/${SECOND.id}\\?rate=`));
  await expect(bar).toContainText("Rating 2 / 2");
  await page.locator("body").press("[");
  await expect(page).toHaveURL(new RegExp(`/sessions/${FIRST.id}\\?rate=`));

  // Nothing to confirm: a tick is the rating
  await expect(panel.getByRole("button", { name: /Confirm/ })).toHaveCount(0);
  await panel.getByRole("checkbox", { name: ACT.name }).click();
  await expect
    .poll(async () => (await db.query(`SELECT 1 FROM "ContributionAct" WHERE "contributionId" = $1`, [`${FIRST.id}-c`])).rowCount)
    .toBe(1);
  await panel.getByRole("button", { name: /Next session/ }).click();
  await expect(page).toHaveURL(new RegExp(`/sessions/${SECOND.id}\\?rate=`));
  // The first is rated and left the queue
  await expect(bar).toContainText("Rating 1 / 1");
  await expect(bar).toContainText("Last one");

  // Past the last one: back to the list
  await panel.getByRole("button", { name: /Next session/ }).click();
  await expect(page).toHaveURL(new RegExp(`/sessions\\?q=`));

  await page.goto(`/sessions?q=${encodeURIComponent(TAG)}&rated=rated`);
  await expect(page.getByText(FIRST.name)).toBeVisible();
  await expect(page.getByText(SECOND.name)).toHaveCount(0);
  await page.goto(`/sessions?q=${encodeURIComponent(TAG)}&rated=unrated`);
  await expect(page.getByText(SECOND.name)).toBeVisible();
  await expect(page.getByText(FIRST.name)).toHaveCount(0);
});
