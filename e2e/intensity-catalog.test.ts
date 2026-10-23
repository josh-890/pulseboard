import "dotenv/config";
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// Intensity catalog editor (ADR-0036, slice 1′): scenarios left to right, each
// with its own acts sorted by level (0.5 steps); extras in groups or free;
// Max can be renamed but never deleted.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36);
const SCENARIO = `Test Scenario ${RUN}`;
const GROUP = `Test Group ${RUN}`;
const EXTRA = `Test Extra ${RUN}`;

let maxName = "";
let scale85: { title: string | null; description: string | null } | null = null;

test.beforeAll(async () => {
  await db.connect();
  maxName = (await db.query<{ name: string }>(`SELECT name FROM "IntensityExtra" WHERE "isMax"`)).rows[0]!.name;
  scale85 = (await db.query(`SELECT title, description FROM "IntensityScaleStep" WHERE value = 8.5`)).rows[0] ?? null;
});
test.afterAll(async () => {
  await db.query(`DELETE FROM "IntensityScaleStep" WHERE value = 8.5`);
  if (scale85) {
    await db.query(`INSERT INTO "IntensityScaleStep" (id, value, title, description) VALUES ('e2e-restore-85', 8.5, $1, $2)`, [
      scale85.title,
      scale85.description,
    ]);
  }
  await db.query(`UPDATE "IntensityExtra" SET name = $1 WHERE "isMax"`, [maxName]);
  await db.query(`DELETE FROM "IntensityExtra" WHERE name LIKE 'Test Extra %'`);
  await db.query(`DELETE FROM "IntensityExtraGroup" WHERE name LIKE 'Test Group %'`);
  await db.query(`DELETE FROM "IntensityScenario" WHERE name LIKE 'Test Scenario %'`);
  await db.end();
});

async function acts() {
  const r = await db.query<{ name: string; level: number }>(
    `SELECT a.name, a.level FROM "IntensityAct" a JOIN "IntensityScenario" s ON s.id = a."scenarioId"
      WHERE s.name = $1 ORDER BY a.level, a.name`,
    [SCENARIO],
  );
  return r.rows.map((a) => `${a.level} ${a.name}`);
}

test("acts sit on the row of their level; the scale describes each value", async ({ page }) => {
  await page.goto("/settings/catalogs/intensity");
  for (const name of ["Solo", "G-G", "G-B", "Group", "Special"]) {
    await expect(page.getByRole("columnheader", { name: `Scenario ${name}` })).toBeVisible();
  }

  const add = page.getByRole("textbox", { name: "Add a scenario" });
  await add.fill(SCENARIO);
  await add.press("Enter");
  await expect(page.getByRole("columnheader", { name: `Scenario ${SCENARIO}` })).toBeVisible();

  // An act is added right in its cell — scenario × level
  await page.getByRole("button", { name: `New act in ${SCENARIO} at 2`, exact: true }).click();
  const field = page.getByRole("textbox", { name: `Add an act to ${SCENARIO} at 2`, exact: true });
  await field.fill("Test act one");
  await field.press("Enter");
  await expect(page.getByRole("cell", { name: `${SCENARIO} at 2`, exact: true })).toContainText("Test act one");
  await expect.poll(acts).toEqual(["2 Test act one"]);

  // A level off the half-step grid is refused; a valid one moves it to that row
  const level = page.getByRole("spinbutton", { name: "Level of Test act one" });
  await level.fill("2.3");
  await level.press("Enter");
  await expect(level).toHaveValue("2");
  await level.fill("3.5");
  await level.press("Enter");
  await expect(page.getByRole("cell", { name: `${SCENARIO} at 3.5`, exact: true })).toContainText("Test act one");
  await expect.poll(acts).toEqual(["3.5 Test act one"]);

  // Arrow keys step; after a short rest the act moves rows and keeps the cursor
  await page.getByRole("spinbutton", { name: "Level of Test act one" }).press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("cell", { name: `${SCENARIO} at 4.5`, exact: true })).toContainText("Test act one");
  await expect.poll(acts).toEqual(["4.5 Test act one"]);
  await expect(page.getByRole("spinbutton", { name: "Level of Test act one" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect.poll(acts).toEqual(["4 Test act one"]);
  await expect(page.getByRole("spinbutton", { name: "Level of Test act one" })).toBeFocused();

  // Half steps show on request; a value gets a title, and — with descriptions
  // unfolded — a description, which otherwise shows on hover
  await expect(page.getByRole("rowheader", { name: "Intensity 8.5" })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Half steps" }).check();
  const row = page.getByRole("rowheader", { name: "Intensity 8.5" });
  await row.getByText("Title for 8.5").click();
  await row.getByRole("textbox").fill("Test edge");
  await row.getByRole("textbox").press("Enter");
  await expect(row.getByText("Test edge")).toBeVisible();
  await expect(row.getByText("Describe 8.5")).toHaveCount(0);

  await page.getByRole("checkbox", { name: "Descriptions" }).check();
  await row.getByText("Describe 8.5").click();
  await row.getByRole("textbox").fill("Test: almost at the edge");
  await row.getByRole("textbox").press("Control+Enter");
  await expect
    .poll(async () => (await db.query(`SELECT title, description FROM "IntensityScaleStep" WHERE value = 8.5`)).rows[0])
    .toEqual({ title: "Test edge", description: "Test: almost at the edge" });

  await page.getByRole("checkbox", { name: "Descriptions" }).uncheck();
  // Radix opens on pointer movement — a re-render under a still pointer needs another move
  await expect(async () => {
    await page.mouse.move(0, 0);
    await row.getByText("Test edge").hover();
    await expect(page.getByRole("tooltip")).toContainText("Test: almost at the edge", { timeout: 1500 });
  }).toPass({ timeout: 10_000 });

  await page.getByRole("button", { name: "Delete Test act one" }).click();
  await expect.poll(acts).toEqual([]);

  // Deleting the scenario lives in its ⋯ menu and asks first
  await page.getByRole("button", { name: `More for ${SCENARIO}` }).click();
  await page.getByRole("menuitem", { name: "Delete scenario…" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(`Delete the scenario ${SCENARIO}?`);
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("columnheader", { name: `Scenario ${SCENARIO}` })).toHaveCount(0);
});

test("extras: a group, an extra in it with points, Max renamed but not deletable", async ({ page }) => {
  await page.goto("/settings/catalogs/intensity");
  await expect(page.getByRole("region", { name: "Extra group Location" })).toContainText("Public");

  const addGroup = page.getByRole("textbox", { name: "Add an extra group" });
  await addGroup.fill(GROUP);
  await addGroup.press("Enter");
  const group = page.getByRole("region", { name: `Extra group ${GROUP}` });
  await expect(group).toBeVisible();

  const addExtra = group.getByRole("textbox", { name: `Add an extra to ${GROUP}` });
  await addExtra.fill(EXTRA);
  await addExtra.press("Enter");
  const points = group.getByRole("spinbutton", { name: `Points of ${EXTRA}` });
  await points.fill("1.5");
  await points.press("Enter");
  await expect
    .poll(async () => (await db.query(`SELECT points FROM "IntensityExtra" WHERE name = $1`, [EXTRA])).rows[0]?.points)
    .toBe(1.5);

  // Moving it out of the group
  await group.getByRole("combobox", { name: `Group of ${EXTRA}` }).selectOption("");
  await expect(page.getByRole("region", { name: "Extras without a group" }).getByText(EXTRA)).toBeVisible();

  // Max: rename only — it has no delete button
  const max = page.getByRole("region", { name: "Max extra" });
  await expect(max.getByRole("button", { name: /Delete/ })).toHaveCount(0);
  await max.getByText(maxName, { exact: true }).click();
  await max.getByRole("textbox").fill(`Ultimate ${RUN}`);
  await max.getByRole("textbox").press("Enter");
  await expect
    .poll(async () => (await db.query(`SELECT name FROM "IntensityExtra" WHERE "isMax"`)).rows[0]?.name)
    .toBe(`Ultimate ${RUN}`);
});

test("the settings navigation folds away for more room, and stays folded on reload", async ({ page }) => {
  await page.goto("/settings/catalogs/intensity");
  await expect(page.getByRole("navigation", { name: "Catalogs" })).toBeVisible();
  await page.getByRole("button", { name: "Hide settings navigation" }).click();
  await expect(page.getByRole("navigation", { name: "Catalogs" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Catalogs" })).toBeVisible(); // icon rail, labelled
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Catalogs" })).toHaveCount(0);
  await page.getByRole("button", { name: "Show settings navigation" }).click();
  await expect(page.getByRole("navigation", { name: "Catalogs" })).toBeVisible();
});

test("one scenario can be worked in alone, at full width", async ({ page }) => {
  await page.goto("/settings/catalogs/intensity");
  await page.getByRole("button", { name: "Work in Solo only" }).click();
  await expect(page.getByRole("columnheader", { name: "Scenario Solo" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Scenario G-G" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Add a scenario" })).toHaveCount(0);
  await page.getByRole("button", { name: "Show all scenarios" }).click();
  await expect(page.getByRole("columnheader", { name: "Scenario G-G" })).toBeVisible();
});
