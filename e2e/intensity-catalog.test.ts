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

  // Its level changes by dragging it (intensity-board.test.ts); the card has no level field or delete of its own
  const cardOne = page.getByRole("button", { name: /^Test act one, level 2/ });
  await expect(cardOne).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "Level of Test act one" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete Test act one" })).toHaveCount(0);

  // Half steps show on request. A value is renamed in place with a double-click;
  // a click opens its panel, where the description is written — it shows in the
  // column with "Descriptions", and otherwise on hover
  await expect(page.getByRole("rowheader", { name: "Intensity 8.5" })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Half steps" }).check();
  const row = page.getByRole("rowheader", { name: "Intensity 8.5" });
  await row.getByText("Title for 8.5").dblclick();
  await row.getByRole("textbox", { name: "Rename 8.5" }).fill("Test edge");
  await row.getByRole("textbox", { name: "Rename 8.5" }).press("Enter");
  await expect(row.getByText("Test edge")).toBeVisible();

  await row.getByText("Test edge").click();
  const level = page.getByRole("complementary", { name: "Intensity 8.5" });
  await expect(page).toHaveURL(/level=8\.5/);
  await level.getByText("Describe 8.5").click();
  await level.getByRole("textbox").fill("Test: almost at the edge");
  await level.getByRole("textbox").press("Control+Enter");
  await expect
    .poll(async () => (await db.query(`SELECT title, description FROM "IntensityScaleStep" WHERE value = 8.5`)).rows[0])
    .toEqual({ title: "Test edge", description: "Test: almost at the edge" });
  await page.keyboard.press("Escape");
  await expect(level).toHaveCount(0);

  await page.getByRole("checkbox", { name: "Descriptions" }).check();
  await expect(row.getByText("Test: almost at the edge")).toBeVisible();
  await page.getByRole("checkbox", { name: "Descriptions" }).uncheck();
  // Radix opens on pointer movement — a re-render under a still pointer needs another move
  await expect(async () => {
    await page.mouse.move(0, 0);
    await row.getByText("Test edge").hover();
    await expect(page.getByRole("tooltip")).toContainText("Test: almost at the edge", { timeout: 1500 });
  }).toPass({ timeout: 10_000 });

  // Deleting the scenario lives in its ⋯ menu and asks first — its unticked acts go with it
  await page.getByRole("button", { name: `More for ${SCENARIO}` }).click();
  await page.getByRole("menuitem", { name: "Delete scenario…" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(`Delete the scenario ${SCENARIO}?`);
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("columnheader", { name: `Scenario ${SCENARIO}` })).toHaveCount(0);
  await expect.poll(acts).toEqual([]);
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

  // Out of the group with its small icon — it falls back to No group; and back in through the menu
  await group.getByRole("button", { name: `Take ${EXTRA} out of its group` }).click();
  const free = page.getByRole("region", { name: "Extras without a group" });
  await expect(free.getByText(EXTRA)).toBeVisible();
  await free.getByRole("button", { name: `Put ${EXTRA} into a group` }).click();
  await page.getByRole("menuitem", { name: GROUP }).click();
  await expect(group.getByText(EXTRA)).toBeVisible();
  await expect(free.getByText(EXTRA)).toHaveCount(0);

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

test("Max is set above the board: higher adds lanes up to it, lower is refused while acts sit above", async ({ page }) => {
  const before = Number((await db.query<{ value: string }>(`SELECT value FROM "Setting" WHERE key = 'intensity-max'`)).rows[0]?.value ?? 10);
  const sc = `Test Scenario max ${RUN}`;
  await db.query(`INSERT INTO "IntensityScenario" (id, name, "sortOrder") VALUES ($1, $2, 98)`, [`e2e-scn-max-${RUN}`, sc]);
  await db.query(`INSERT INTO "IntensityAct" (id, "scenarioId", name, level) VALUES ($1, $2, $3, 5)`, [
    `e2e-act-max-${RUN}`,
    `e2e-scn-max-${RUN}`,
    `Test act max ${RUN}`,
  ]);
  try {
    await page.goto("/settings/catalogs/intensity");
    const field = page.getByRole("spinbutton", { name: "Top of the scale (Max)" });
    await expect(field).toHaveValue(String(before));
    await field.fill(String(before + 2));
    await field.press("Enter");
    await expect(page.getByRole("rowheader", { name: `Intensity ${before + 2}`, exact: true })).toBeVisible();
    await expect(page.getByRole("rowheader", { name: `Intensity ${before + 1.5}`, exact: true })).toBeVisible();
    const nameNow = (await db.query<{ name: string }>(`SELECT name FROM "IntensityExtra" WHERE "isMax"`)).rows[0]!.name;
    await expect(page.getByText(`only ${nameNow} reaches ${before + 2}`)).toBeVisible();

    await field.fill("4");
    await field.press("Enter");
    await expect(page.getByText(`Max cannot become 4`)).toBeVisible();
    await expect(page.getByText(`Test act max ${RUN} (${sc}, 5)`).first()).toBeVisible();
    await expect(field).toHaveValue(String(before + 2));
  } finally {
    await db.query(`DELETE FROM "IntensityScenario" WHERE id = $1`, [`e2e-scn-max-${RUN}`]);
    // Back as it was: the Max row's text and the setting
    await db.query(`UPDATE "IntensityScaleStep" SET value = $1 WHERE value = $2`, [before, before + 2]);
    await db.query(`INSERT INTO "Setting" (key, value, "updatedAt") VALUES ('intensity-max', $1, now()) ON CONFLICT (key) DO UPDATE SET value = $1, "updatedAt" = now()`, [String(before)]);
  }
});

test("a value's ▸ unfolds its own description to read; ↑/↓ in its panel walk the scale", async ({ page }) => {
  // 8.5 is ours for this file (restored in afterAll)
  await db.query(
    `INSERT INTO "IntensityScaleStep" (id, value, description) VALUES ('e2e-step-85', 8.5, 'Test: on its own')
     ON CONFLICT (value) DO UPDATE SET description = 'Test: on its own'`,
  );
  await page.goto("/settings/catalogs/intensity");
  await page.getByRole("checkbox", { name: "Half steps" }).check();
  const row = page.getByRole("rowheader", { name: "Intensity 8.5" });
  await expect(page.getByRole("checkbox", { name: "Descriptions" })).not.toBeChecked();
  await row.getByRole("button", { name: "Open the description of 8.5" }).click();
  await expect(row.getByText("Test: on its own")).toBeVisible();
  // Other values stay folded
  await expect(page.getByRole("rowheader", { name: "Intensity 8", exact: true }).getByText(/open to write one/)).toHaveCount(0);
  await row.getByRole("button", { name: "Fold the description of 8.5" }).click();
  await expect(row.getByText("Test: on its own")).toHaveCount(0);

  // The panel walks the scale: 8.5 → 9 → back
  await row.locator("[data-level]").click();
  await expect(page.getByRole("complementary", { name: "Intensity 8.5" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("complementary", { name: "Intensity 9" })).toBeVisible();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("complementary", { name: "Intensity 8.5" })).toBeVisible();
});

test("a group counts in some scenarios only: untick one in its menu, the card says “not in …”", async ({ page }) => {
  const name = `Test Group scope ${RUN}`;
  await db.query(`INSERT INTO "IntensityExtraGroup" (id, name) VALUES ($1, $2)`, [`e2e-grp-scope-${RUN}`, name]);
  try {
    await page.goto("/settings/catalogs/intensity");
    const card = page.getByRole("region", { name: `Extra group ${name}` });
    await expect(async () => {
      await card.getByRole("button", { name: `Scenarios the group ${name} counts in` }).click();
      await expect(page.getByRole("menuitemcheckbox", { name: "Solo" })).toBeVisible({ timeout: 1000 });
    }).toPass();
    await expect(page.getByRole("menuitemcheckbox", { name: "Solo" })).toBeChecked();
    await page.getByRole("menuitemcheckbox", { name: "Solo" }).click();
    await expect
      .poll(async () => (await db.query(`SELECT "scenarioId" FROM "IntensityExtraGroupScenarioOff" WHERE "groupId" = $1`, [`e2e-grp-scope-${RUN}`])).rows)
      .toEqual([{ scenarioId: "dsit-solo" }]);
    await page.keyboard.press("Escape");
    await expect(card.getByText("not in Solo")).toBeVisible();
  } finally {
    await db.query(`DELETE FROM "IntensityExtraGroup" WHERE id = $1`, [`e2e-grp-scope-${RUN}`]);
  }
});
