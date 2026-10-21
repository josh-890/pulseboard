import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// Intensity on a session (ADR-0036, slice 2): the panel beside the photos —
// people as chips over one editor. One person: tick, note, extras, own extras,
// Max. Several: changes apply to all, a half tick names who has an act. Undo
// after unticking an act with a note; "Same as …"; find an act and Enter.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36);
const SESSION = `e2e-session-si-${RUN}`;
const A = { id: `e2e-person-si-a-${RUN}`, icg: `E2E-SIA-${RUN}`.toUpperCase(), name: `Test Anna ${RUN}`, c: `${SESSION}-ca` };
const B = { id: `e2e-person-si-b-${RUN}`, icg: `E2E-SIB-${RUN}`.toUpperCase(), name: `Test Bea ${RUN}`, c: `${SESSION}-cb` };
const ACT1 = { id: `e2e-act-si1-${RUN}`, name: `Test act one ${RUN}` };
const ACT2 = { id: `e2e-act-si2-${RUN}`, name: `Test act two ${RUN}` };
const label = (p: typeof A) => `${p.name} (${p.icg})`;

test.beforeAll(async () => {
  await db.connect();
  for (const p of [A, B]) {
    await db.query(`INSERT INTO "Person" (id, "icgId", "sexAtBirth") VALUES ($1, $2, 'female')`, [p.id, p.icg]);
    await db.query(`INSERT INTO "PersonAlias" (id, "personId", name, "isCommon") VALUES ($1, $2, $3, true)`, [`${p.id}-a`, p.id, p.name]);
  }
  await db.query(`INSERT INTO "Session" (id, name, "updatedAt") VALUES ($1, $2, now())`, [SESSION, `Test session ${RUN}`]);
  for (const p of [A, B]) {
    await db.query(`INSERT INTO "SessionContribution" (id, "sessionId", "personId", "roleDefinitionId") VALUES ($1, $2, $3, 'crd_model')`, [p.c, SESSION, p.id]);
  }
  await db.query(`INSERT INTO "IntensityAct" (id, "scenarioId", name, level) VALUES ($1, 'dsit-glamour', $2, 3), ($3, 'dsit-glamour', $4, 6)`, [
    ACT1.id,
    ACT1.name,
    ACT2.id,
    ACT2.name,
  ]);
});

test.beforeEach(async () => {
  await db.query(`DELETE FROM "ContributionAct" WHERE "contributionId" IN ($1, $2)`, [A.c, B.c]);
  await db.query(`DELETE FROM "ContributionExtra" WHERE "contributionId" IN ($1, $2)`, [A.c, B.c]);
});

test.afterAll(async () => {
  await db.query(`DELETE FROM "SessionContribution" WHERE "sessionId" = $1`, [SESSION]);
  await db.query(`DELETE FROM "IntensityAct" WHERE id IN ($1, $2)`, [ACT1.id, ACT2.id]);
  await db.query(`DELETE FROM "Session" WHERE id = $1`, [SESSION]);
  for (const p of [A, B]) {
    await db.query(`DELETE FROM "PersonAlias" WHERE "personId" = $1`, [p.id]);
    await db.query(`DELETE FROM "Person" WHERE id = $1`, [p.id]);
  }
  await db.end();
});

async function extraName(id: string) {
  return (await db.query<{ name: string }>(`SELECT name FROM "IntensityExtra" WHERE id = $1`, [id])).rows[0]!.name;
}
const acts = async (c: string) =>
  (await db.query<{ name: string; notes: string | null }>(
    `SELECT a.name, ca.notes FROM "ContributionAct" ca JOIN "IntensityAct" a ON a.id = ca."actId" WHERE ca."contributionId" = $1 ORDER BY a.level`,
    [c],
  )).rows;
const extras = async (c: string) =>
  (await db.query<{ id: string }>(`SELECT "extraId" AS id FROM "ContributionExtra" WHERE "contributionId" = $1 ORDER BY 1`, [c])).rows.map((r) => r.id);

async function openPanel(page: Page) {
  await page.goto(`/sessions/${SESSION}`);
  const panel = page.getByRole("region", { name: "Intensity panel" });
  // Remembered open (cookie) or opened now — the toggle answers once the page is interactive
  await expect(async () => {
    if (!(await panel.isVisible())) await page.getByRole("button", { name: "Intensity", exact: true }).first().click();
    await expect(panel).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  return panel;
}

const chip = (page: Page, p: typeof A) =>
  page.getByRole("region", { name: "Intensity panel" }).getByRole("button", { name: new RegExp(`^${p.name} \\(`) });

test("one person: tick, note, session extras, own extras, Max — and it all comes back", async ({ page }) => {
  const [publicName, firstName, maxName] = [await extraName("dset-public"), await extraName("ix-first-time"), await extraName("ix-max")];
  const panel = await openPanel(page);
  await expect(panel.getByText(`Editing ${label(A)}`)).toBeVisible();
  // Two women on camera: G-G is the suggestion; Glamour opens by hand
  await panel.getByRole("button", { name: /^Glamour/ }).click();

  await panel.getByRole("checkbox", { name: ACT1.name }).check();
  await expect(chip(page, A)).toContainText("3");

  await panel.getByRole("button", { name: `Add a note to ${ACT1.name}` }).click();
  await panel.getByRole("textbox", { name: `Note on ${ACT1.name}` }).fill("Test: hesitant at first");
  await panel.getByRole("textbox", { name: `Note on ${ACT1.name}` }).press("Enter");

  await panel.getByRole("radiogroup", { name: new RegExp(`for ${A.name}`) }).getByRole("radio", { name: new RegExp(publicName) }).click();
  await panel.getByRole("button", { name: `${firstName} for ${label(A)}` }).click();
  await expect(chip(page, A)).toContainText("6");

  // The value explains itself on hover
  await expect(async () => {
    await page.mouse.move(0, 0);
    await panel.getByLabel("Value 6").hover();
    await expect(page.getByRole("tooltip")).toContainText(`${ACT1.name} 3 + ${publicName} 2 + ${firstName} 1 = 6`, { timeout: 1500 });
  }).toPass({ timeout: 10_000 });

  // This act alone without a location, then Max
  await panel.getByRole("button", { name: `Extras of ${ACT1.name}` }).click();
  await panel.getByRole("radiogroup", { name: new RegExp(`for ${ACT1.name}`) }).getByRole("radio", { name: "—" }).click();
  await expect(chip(page, A)).toContainText("4");
  await panel.getByRole("button", { name: `${maxName} for ${ACT1.name}` }).click();
  await expect(chip(page, A)).toContainText("10");

  await expect.poll(async () => acts(A.c)).toEqual([{ name: ACT1.name, notes: "Test: hesitant at first" }]);
  // Saved: no location and Max for this act (DROP + ADD)
  await expect
    .poll(async () => (await db.query(`SELECT e.mode FROM "ContributionActExtra" e JOIN "ContributionAct" a ON a.id = e."contributionActId" WHERE a."contributionId" = $1 ORDER BY 1`, [A.c])).rows.map((r) => r.mode))
    .toEqual(["ADD", "DROP"]);
  const reopened = await openPanel(page);
  await expect(chip(page, A)).toContainText("10");
  await expect(reopened.getByText("Test: hesitant at first")).toBeVisible();
});

test("several people: a change applies to all; a half tick names who has the act", async ({ page }) => {
  const publicName = await extraName("dset-public");
  const panel = await openPanel(page);
  await panel.getByRole("button", { name: /^Glamour/ }).click();
  await panel.getByRole("checkbox", { name: ACT1.name }).check(); // Anna only

  await chip(page, B).click(); // both selected
  await expect(panel.getByText("2 selected — every change applies to all of them")).toBeVisible();
  await expect(panel.getByText(`only ${A.name}`)).toBeVisible();

  await panel.getByRole("checkbox", { name: ACT2.name }).check();
  await panel.getByRole("radiogroup", { name: /for 2 people/ }).getByRole("radio", { name: new RegExp(publicName) }).click();
  await expect.poll(async () => (await acts(B.c)).map((a) => a.name)).toEqual([ACT2.name]);
  await expect.poll(async () => extras(B.c)).toEqual(["dset-public"]);
  await expect.poll(async () => extras(A.c)).toEqual(["dset-public"]);

  // Ticking the half-ticked act gives it to everyone selected
  await panel.getByRole("checkbox", { name: ACT1.name }).click();
  await expect.poll(async () => (await acts(B.c)).map((a) => a.name)).toEqual([ACT1.name, ACT2.name]);
});

test("unticking an act with a note offers Undo; Same as copies; Enter in the search ticks", async ({ page }) => {
  const panel = await openPanel(page);
  await panel.getByRole("button", { name: /^Glamour/ }).click();
  await panel.getByRole("checkbox", { name: ACT1.name }).check();
  await panel.getByRole("button", { name: `Add a note to ${ACT1.name}` }).click();
  await panel.getByRole("textbox", { name: `Note on ${ACT1.name}` }).fill("Test: keep me");
  await panel.getByRole("textbox", { name: `Note on ${ACT1.name}` }).press("Enter");
  await expect.poll(async () => acts(A.c)).toEqual([{ name: ACT1.name, notes: "Test: keep me" }]);

  await panel.getByRole("checkbox", { name: ACT1.name }).uncheck();
  await expect.poll(async () => acts(A.c)).toEqual([]);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => acts(A.c)).toEqual([{ name: ACT1.name, notes: "Test: keep me" }]);

  // Bea alone, then Same as Anna: her acts (not her notes) come over
  await panel.getByRole("button", { name: `Only ${label(B)}` }).click();
  await panel.getByRole("button", { name: "Same as…" }).click();
  await page.getByRole("menuitem", { name: `Same as ${label(A)}` }).click();
  await expect.poll(async () => acts(B.c)).toEqual([{ name: ACT1.name, notes: null }]);

  // Find an act, Enter ticks it for Bea
  await panel.getByRole("searchbox", { name: "Find an act" }).fill(`act two ${RUN}`);
  await panel.getByRole("searchbox", { name: "Find an act" }).press("Enter");
  await expect.poll(async () => (await acts(B.c)).map((a) => a.name)).toEqual([ACT1.name, ACT2.name]);
});

test("Max in a person's session extras makes them 10 without acts; the sidebar shows it with the panel closed", async ({ page }) => {
  const maxName = await extraName("ix-max");
  const panel = await openPanel(page);
  await panel.getByRole("button", { name: `${maxName} for ${label(A)}` }).click();
  await expect(chip(page, A)).toContainText("10");
  await panel.getByRole("button", { name: "Close the intensity panel" }).click();
  await expect(page.getByRole("region", { name: "Intensity panel" })).toHaveCount(0);
  await expect(page.getByRole("listitem").filter({ hasText: label(A) })).toContainText("10");
});
