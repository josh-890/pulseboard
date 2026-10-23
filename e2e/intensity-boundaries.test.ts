import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// Boundaries between intensity levels (2026-10-23): a named line on the seam
// just below a value. "+ Boundary" on a seam in the Intensity column names one
// and opens its panel; folded it is a pill on the seam (description on hover),
// a click opens its panel to describe or delete it (Undo), ▸ unfolds the
// description to read in the column, "Boundaries" unfolds all.
// Seams no real boundary of this tenant uses, found at run time.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const TITLE = `Test boundary ${RUN}`;
let at = 0;
let other = 0;

test.use({ viewport: { width: 1800, height: 1000 } });
test.describe.configure({ timeout: 90_000 });

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

test.beforeAll(async () => {
  await db.connect();
  const max = Number((await db.query<{ value: string }>(`SELECT value FROM "Setting" WHERE key = 'intensity-max'`)).rows[0]?.value ?? 10);
  const used = new Set((await db.query<{ value: number }>(`SELECT value FROM "IntensityBoundary"`)).rows.map((r) => r.value));
  const free: number[] = [];
  for (let v = max - 0.5; v > 0 && free.length < 2; v -= 0.5) if (!used.has(v)) free.push(v);
  [at, other] = free as [number, number];
});
test.afterEach(async () => {
  await db.query(`DELETE FROM "IntensityBoundary" WHERE title LIKE $1`, [`Test boundary ${RUN}%`]);
});
test.afterAll(async () => {
  await db.end();
});

const seam = (page: Page, value: number) => page.getByRole("separator", { name: new RegExp(`^Boundary at ${fmt(value)}:`) });
async function boundary() {
  return (await db.query<{ value: number; title: string; description: string | null }>(
    `SELECT value, title, description FROM "IntensityBoundary" WHERE title LIKE $1`,
    [`Test boundary ${RUN}%`],
  )).rows;
}

test("“+ Boundary” on a seam names one and opens its panel; it shows as a pill on the seam", async ({ page }) => {
  await page.goto("/settings/catalogs/intensity");
  await page.getByRole("checkbox", { name: "Half steps" }).check();
  const add = page.getByRole("button", { name: `New boundary at ${fmt(at)}`, exact: true });
  await expect(async () => {
    await add.click({ force: true }); // shown on hover; until hydrated nothing happens
    await expect(page.getByRole("textbox", { name: `Name the boundary at ${fmt(at)}` })).toBeVisible({ timeout: 1000 });
  }).toPass();
  const field = page.getByRole("textbox", { name: `Name the boundary at ${fmt(at)}` });
  await field.fill(TITLE);
  await field.press("Enter");

  await expect.poll(boundary).toEqual([{ value: at, title: TITLE, description: null }]);
  await expect(page.getByRole("complementary", { name: `Boundary ${TITLE}` })).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/boundary=/);
  await expect(seam(page, at)).toHaveCount(1); // folded it has no height — its pill shows
  await expect(seam(page, at).getByRole("button", { name: `Boundary ${TITLE} — open it` })).toContainText(TITLE);
});

test("the pill opens its panel to describe it; ▸ unfolds the description in the column; the switch unfolds all", async ({ page }) => {
  await db.query(`INSERT INTO "IntensityBoundary" (id, value, title) VALUES ($1, $2, $3), ($4, $5, $6)`, [
    `e2e-bnd-a-${RUN}`,
    at,
    TITLE,
    `e2e-bnd-b-${RUN}`,
    other,
    `${TITLE} two`,
  ]);
  await page.goto("/settings/catalogs/intensity");
  const s = seam(page, at);
  const pill = s.getByRole("button", { name: `Boundary ${TITLE} — open it` });
  await expect(async () => {
    await pill.click();
    await expect(page.getByRole("complementary", { name: `Boundary ${TITLE}` })).toBeVisible({ timeout: 1000 });
  }).toPass();
  const panel = page.getByRole("complementary", { name: `Boundary ${TITLE}` });
  await panel.getByText("Describe the boundary").click();
  await panel.getByRole("textbox").fill("Test: what is given up here");
  await panel.getByRole("textbox").press("Control+Enter");
  await expect.poll(async () => (await boundary()).find((b) => b.title === TITLE)?.description).toBe("Test: what is given up here");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);

  await expect(async () => {
    await page.mouse.move(0, 0);
    await pill.hover();
    await expect(page.getByRole("tooltip")).toContainText("Test: what is given up here", { timeout: 1500 });
  }).toPass({ timeout: 10_000 });

  // Anywhere along the line, far from the column, shows it too
  const pb = (await pill.boundingBox())!;
  await page.mouse.move(pb.x + 900, pb.y + pb.height / 2);
  await expect(page.locator('body > [role="tooltip"]')).toContainText("Test: what is given up here");
  await page.mouse.move(0, 0);

  await s.getByRole("button", { name: `Unfold the boundary ${TITLE}` }).click();
  await expect(s.getByText("Test: what is given up here")).toBeVisible();
  await s.getByRole("button", { name: `Fold the boundary ${TITLE}` }).click();
  await expect(s.getByText("Test: what is given up here")).toHaveCount(0);

  await page.getByRole("checkbox", { name: "Boundaries" }).check();
  await expect(s.getByText("Test: what is given up here")).toBeVisible();
  await expect(seam(page, other).getByRole("button", { name: `Fold the boundary ${TITLE} two` })).toBeVisible();
});

test("a double-click renames the pill in place; delete in the panel offers Undo", async ({ page }) => {
  await db.query(`INSERT INTO "IntensityBoundary" (id, value, title, description) VALUES ($1, $2, $3, 'Test: kept')`, [
    `e2e-bnd-c-${RUN}`,
    at,
    TITLE,
  ]);
  await page.goto("/settings/catalogs/intensity");
  const s = seam(page, at);
  await expect(async () => {
    await s.getByRole("button", { name: `Boundary ${TITLE} — open it` }).dblclick();
    await expect(s.getByRole("textbox", { name: `Rename the boundary ${TITLE}` })).toBeVisible({ timeout: 1000 });
  }).toPass();
  await s.getByRole("textbox", { name: `Rename the boundary ${TITLE}` }).fill(`${TITLE} x`);
  await s.getByRole("textbox", { name: `Rename the boundary ${TITLE}` }).press("Enter");
  await expect.poll(boundary).toEqual([{ value: at, title: `${TITLE} x`, description: "Test: kept" }]);

  const panel = page.getByRole("complementary", { name: `Boundary ${TITLE} x` });
  await expect(panel).toBeVisible({ timeout: 15_000 }); // the double-click's first click opened it
  await panel.getByRole("button", { name: "Delete boundary" }).click();
  await expect.poll(boundary).toEqual([]);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(boundary).toEqual([{ value: at, title: `${TITLE} x`, description: "Test: kept" }]);
  await expect(seam(page, at)).toHaveCount(1);
});
