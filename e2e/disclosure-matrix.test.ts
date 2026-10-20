import "dotenv/config";
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// Disclosure matrix editor (ADR-0035, slice 1): situations left to right, each
// with its own ladder; steps are added, described, reordered and removed; a
// situation is added and weighted; settings are listed private → public.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36);
const SITUATION = `Test Situation ${RUN}`;

test.beforeAll(() => db.connect());
test.afterAll(async () => {
  await db.query(`DELETE FROM "DisclosureSituation" WHERE name LIKE 'Test Situation %'`);
  await db.end();
});

test("a situation gets its own ladder, which can be reordered and pruned", async ({ page }) => {
  await page.goto("/settings/catalogs/disclosure");
  for (const name of ["Glamour", "Solo", "G-G", "G-B", "Group", "Special"]) {
    await expect(page.getByRole("region", { name: `Situation ${name}` })).toBeVisible();
  }
  await expect(page.getByText("Private / studio")).toBeVisible();

  const add = page.getByRole("textbox", { name: "Add a situation" });
  await add.fill(SITUATION);
  await add.press("Enter");
  const column = page.getByRole("region", { name: `Situation ${SITUATION}` });
  await expect(column).toBeVisible();

  const step = column.getByRole("textbox", { name: `Add a step to ${SITUATION}` });
  for (const name of ["Test step one", "Test step two"]) {
    await step.fill(name);
    await step.press("Enter");
    await expect(column.getByText(name)).toBeVisible();
  }
  // The highest step moves down to first place
  await column.getByRole("button", { name: "Move Test step two lower" }).click();
  await expect(column.getByLabel("Level 1: Test step two")).toBeVisible();

  const weight = column.getByRole("spinbutton", { name: `Weight of ${SITUATION}` });
  await weight.fill("2.5");
  await weight.blur();
  await expect.poll(async () => (await db.query(`SELECT weight FROM "DisclosureSituation" WHERE name = $1`, [SITUATION])).rows[0]?.weight).toBe(2.5);

  await column.getByRole("button", { name: "Delete Test step one" }).click();
  await expect(column.getByText("Test step one")).toHaveCount(0);
  const ranks = await db.query(
    `SELECT l.name, l.rank FROM "DisclosureLevel" l JOIN "DisclosureSituation" s ON s.id = l."situationId" WHERE s.name = $1`,
    [SITUATION],
  );
  expect(ranks.rows).toEqual([{ name: "Test step two", rank: 0 }]);
});
