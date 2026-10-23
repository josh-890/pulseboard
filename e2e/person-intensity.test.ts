import "dotenv/config";
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// A person's Intensity (ADR-0036, slice 3): the header gauge (peak, mean) in
// place of CP/WCP, and the tab — peak tiles, the matrix with first times and
// counts, the course with first times starred and undated sessions last.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36);
const P = `e2e-person-pi-${RUN}`;
const ICG = `E2E-PI-${RUN}`.toUpperCase();
const act = (k: string) => `e2e-act-pi-${k}-${RUN}`;
const NAMES = { swim: `Test swim ${RUN}`, ling: `Test lingerie ${RUN}`, top: `Test topless ${RUN}`, nude: `Test nude ${RUN}` };

test.beforeAll(async () => {
  await db.connect();
  await db.query(`INSERT INTO "Person" (id, "icgId", "sexAtBirth") VALUES ($1, $2, 'female')`, [P, ICG]);
  await db.query(`INSERT INTO "PersonAlias" (id, "personId", name, "isCommon") VALUES ($1, $2, $3, true)`, [`${P}-a`, P, `Test Course ${RUN}`]);
  await db.query(
    `INSERT INTO "IntensityAct" (id, "scenarioId", name, level) VALUES ($1,'dsit-solo',$2,1.5),($3,'dsit-solo',$4,2.5),($5,'dsit-solo',$6,5),($7,'dsit-solo',$8,7)`,
    [act("swim"), NAMES.swim, act("ling"), NAMES.ling, act("top"), NAMES.top, act("nude"), NAMES.nude],
  );
  const sessions: [string, string | null, string, string[], string[]][] = [
    ["s1", "2019-07-01", "DAY", ["swim"], []],
    ["s2", "2020-03-01", "MONTH", ["swim", "ling"], []],
    ["s3", "2022-05-10", "DAY", ["top"], ["dset-public"]],
    ["s4", null, "UNKNOWN", ["nude"], []],
  ];
  for (const [k, date, precision, acts, extras] of sessions) {
    const sid = `e2e-session-pi-${k}-${RUN}`;
    await db.query(`INSERT INTO "Session" (id, name, date, "datePrecision", "updatedAt") VALUES ($1, $2, $3, $4, now())`, [sid, `Test ${k} ${RUN}`, date, precision]);
    await db.query(`INSERT INTO "SessionContribution" (id, "sessionId", "personId", "roleDefinitionId") VALUES ($1, $2, $3, 'crd_model')`, [`${sid}-c`, sid, P]);
    for (const a of acts) await db.query(`INSERT INTO "ContributionAct" (id, "contributionId", "actId") VALUES ($1, $2, $3)`, [`${sid}-${a}`, `${sid}-c`, act(a)]);
    for (const e of extras) await db.query(`INSERT INTO "ContributionExtra" ("contributionId", "extraId") VALUES ($1, $2)`, [`${sid}-c`, e]);
  }
});

test.afterAll(async () => {
  await db.query(`DELETE FROM "SessionContribution" WHERE "personId" = $1`, [P]);
  await db.query(`DELETE FROM "Session" WHERE id LIKE $1`, [`e2e-session-pi-%-${RUN}`]);
  await db.query(`DELETE FROM "IntensityAct" WHERE id LIKE $1`, [`e2e-act-pi-%-${RUN}`]);
  await db.query(`DELETE FROM "PersonAlias" WHERE "personId" = $1`, [P]);
  await db.query(`DELETE FROM "Person" WHERE id = $1`, [P]);
  await db.end();
});

test("the header gauge and the Intensity tab", async ({ page }) => {
  await page.goto(`/people/${P}`);
  // Peak 7 (topless 5 + public 2, 2022; the undated nude is also 7); mean of 1.5, 2.5, 7, 7 = 4.5
  await expect(page.getByTitle("Intensity — the highest across their sessions; the dot is their mean")).toContainText("7");
  await expect(page.getByTitle("Mean intensity of their sessions")).toHaveText("ø 4.5");

  await page.getByRole("tab", { name: /Intensity/ }).click();
  await expect(page.getByLabel("Peaks")).toContainText("Peak");

  await expect(page.getByLabel(`${NAMES.swim}: reached, first 2019-07-01, 2 sessions`)).toBeVisible();
  await expect(page.getByLabel(`${NAMES.ling}: reached, first 2020-03, 1 session`)).toBeVisible();
  await expect(page.getByLabel(`${NAMES.nude}: reached, first date unknown, 1 session`)).toBeVisible();

  const course = page.getByRole("list", { name: "Intensity by session, oldest first" });
  await expect(course.getByRole("link")).toHaveCount(4);
  await expect(course.getByRole("link").nth(0)).toHaveAccessibleName(`Test s1 ${RUN}: 1.5, 1 first`);
  await expect(course.getByRole("link").nth(1)).toHaveAccessibleName(`Test s2 ${RUN}: 2.5, 1 first`);
  await expect(course.getByRole("link").nth(2)).toHaveAccessibleName(`Test s3 ${RUN}: 7, 1 first`);
  // Undated last, never a first time
  await expect(course.getByRole("link").nth(3)).toHaveAccessibleName(`Test s4 ${RUN}: 7`);
  await expect(course).toContainText("undated");
});
