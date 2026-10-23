import "dotenv/config";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { Client } from "pg";

// The intensity catalog as a board (2026-10-23, K1): a card dragged into any
// cell takes that scenario and level at the place it is dropped; within a cell
// the order is manual; Undo in the toast puts it back; the keyboard drags too.
// Two scenarios of our own, first in line so both columns are in view.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 5); // unique even when workers start together
const S1 = { id: `e2e-scn-a-${RUN}`, name: `Test Board A ${RUN}` };
const S2 = { id: `e2e-scn-b-${RUN}`, name: `Test Board B ${RUN}` };
const name = (k: string) => `Test act ${k} ${RUN}`;

// Wide: parallel runs of this file each put two columns first
test.use({ viewport: { width: 2600, height: 1000 } });
// Drags wait for hydration and every move renders the whole board — slow under parallel workers
test.describe.configure({ timeout: 90_000 });

test.beforeAll(async () => {
  await db.connect();
  await db.query(`INSERT INTO "IntensityScenario" (id, name, "sortOrder") VALUES ($1, $2, -2), ($3, $4, -1)`, [
    S1.id,
    S1.name,
    S2.id,
    S2.name,
  ]);
});
// Our acts by id — a drag gone astray may have put one in another scenario
const ACTS = `e2e-act-_-${RUN}`; // a, b, c, d — not the panel test's pa, pb, pc
test.beforeEach(async () => {
  await db.query(`DELETE FROM "IntensityAct" WHERE "scenarioId" IN ($1, $2) OR id LIKE $3`, [S1.id, S2.id, ACTS]);
  await db.query(
    `INSERT INTO "IntensityAct" (id, "scenarioId", name, level, "sortOrder") VALUES
      ($1, $5, $6, 2, 0), ($2, $5, $7, 2, 1), ($3, $5, $8, 2, 2), ($4, $9, $10, 3, 0)`,
    [`e2e-act-a-${RUN}`, `e2e-act-b-${RUN}`, `e2e-act-c-${RUN}`, `e2e-act-d-${RUN}`, S1.id, name("a"), name("b"), name("c"), S2.id, name("d")],
  );
});
test.afterAll(async () => {
  await db.query(`DELETE FROM "IntensityAct" WHERE id LIKE $1`, [ACTS]);
  await db.query(`DELETE FROM "IntensityScenario" WHERE id IN ($1, $2)`, [S1.id, S2.id]);
  await db.end();
});

const card = (page: Page, k: string) => page.locator("li", { has: page.getByLabel(new RegExp(`^Act ${name(k)},`)) });
const cell = (page: Page, s: { name: string }, level: string) => page.getByRole("cell", { name: `${s.name} at ${level}`, exact: true });

async function where(k: string) {
  const r = await db.query<{ scenarioId: string; level: number; sortOrder: number }>(
    `SELECT "scenarioId", level, "sortOrder" FROM "IntensityAct" WHERE name = $1`,
    [name(k)],
  );
  return r.rows[0]!;
}

/** The card in hand while a mouse drag runs */
const inHand = (page: Page) => page.locator("body > div.cursor-grabbing");

/** Press and move a little until the drag has started — before hydration a press does nothing yet */
async function pickUp(page: Page, from: Locator) {
  await expect(async () => {
    const a = (await from.boundingBox())!;
    await page.mouse.move(a.x + 20, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + 30, a.y + 20, { steps: 5 });
    try {
      await inHand(page).waitFor({ timeout: 1500 });
    } catch {
      await page.mouse.up();
      throw new Error("not picked up yet");
    }
  }).toPass({ timeout: 15_000 });
}

/**
 * Pick up, then over the target at a height within it, and drop. Into another
 * cell (`lit`), let go only once that cell is lit as the target — what a person
 * waits to see; the board measures the lanes that opened with the drag.
 */
async function drag(page: Page, from: Locator, to: Locator, yFrac = 0.5, lit?: Locator) {
  await pickUp(page, from);
  await expect(async () => {
    const b = (await to.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height * yFrac, { steps: 4 });
    if (lit) await expect(lit).toHaveClass(/bg-primary\/10/, { timeout: 500 });
    else await page.waitForTimeout(150);
  }).toPass({ timeout: 10_000 });
  await page.mouse.up();
}

test("a card dragged onto another scenario's card lands before it, at that level; Undo puts it back", async ({ page }) => {
  await page.goto("/settings/catalogs/intensity");
  await expect(card(page, "c")).toBeVisible();
  await drag(page, card(page, "c"), card(page, "d"), 0.3, cell(page, S2, "3"));

  await expect(page.getByText(`${name("c")} → ${S2.name} · 3`)).toBeVisible();
  await expect.poll(() => where("c")).toEqual({ scenarioId: S2.id, level: 3, sortOrder: 0 });
  expect(await where("d")).toMatchObject({ sortOrder: 1 });
  await page.getByRole("button", { name: "Undo" }).click(); // while the toast is up
  await expect.poll(() => where("c")).toMatchObject({ scenarioId: S1.id, level: 2 });
  await expect(cell(page, S1, "2").locator("li")).toHaveText([name("a"), name("b"), name("c")], { timeout: 15_000 });
});

test("while dragging, every half step is a lane: a card dropped on an empty cell takes its level", async ({ page }) => {
  await page.goto("/settings/catalogs/intensity");
  await expect(card(page, "a")).toBeVisible();
  await pickUp(page, card(page, "a"));
  const target = cell(page, S2, "4.5"); // only there while a card is held
  await expect(target).toBeVisible();
  // Let go once that cell is lit as the target — what a person waits to see
  await expect(async () => {
    const b = (await target.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
    await expect(target).toHaveClass(/bg-primary\/10/, { timeout: 500 });
  }).toPass({ timeout: 10_000 });
  await page.mouse.up();
  await expect.poll(() => where("a")).toMatchObject({ scenarioId: S2.id, level: 4.5 });
  await expect(cell(page, S2, "4.5").locator("li")).toHaveText([name("a")], { timeout: 15_000 });
});

test("the order within a cell is manual and stays after a reload", async ({ page }) => {
  await page.goto("/settings/catalogs/intensity");
  await expect(card(page, "c")).toBeVisible();
  await drag(page, card(page, "c"), card(page, "a"), 0.3);
  await expect(page.getByText(`${name("c")}: new place in its row`)).toBeVisible();
  await expect.poll(async () => (await where("c")).sortOrder).toBe(0);
  await page.reload();
  await expect(cell(page, S1, "2").locator("li")).toHaveText([name("c"), name("a"), name("b")], { timeout: 15_000 });
});

test("the keyboard drags: Space picks up, arrows move, Space drops", async ({ page }) => {
  await page.goto("/settings/catalogs/intensity");
  const live = page.locator('[id^="DndLiveRegion"]');
  // Until the page is hydrated, Space does nothing yet
  await expect(async () => {
    await card(page, "b").focus();
    await page.keyboard.press("Space");
    await expect(card(page, "b")).toHaveAttribute("aria-pressed", "true", { timeout: 1000 });
  }).toPass();
  await expect(live).toContainText(name("b")); // the move is announced by name
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(300); // the sensor measures the new place
  await page.keyboard.press("Space");
  await expect(cell(page, S1, "2").locator("li")).toHaveText([name("b"), name("a"), name("c")], { timeout: 15_000 });
  await expect.poll(async () => (await where("b")).sortOrder).toBe(0);
});

test("a name the target scenario already has is refused, and the card stays", async ({ page }) => {
  await db.query(`UPDATE "IntensityAct" SET name = $1 WHERE name = $2`, [name("a"), name("d")]); // B has "a" too
  await page.goto("/settings/catalogs/intensity");
  const dInB = cell(page, S2, "3").locator("li");
  await expect(dInB).toHaveText([name("a")]);
  await drag(page, card(page, "c"), cell(page, S2, "3"), 0.9, cell(page, S2, "3"));
  await expect.poll(() => where("c")).toMatchObject({ scenarioId: S2.id }); // c is free to go
  await drag(page, cell(page, S1, "2").locator("li").first(), cell(page, S2, "3"), 0.9, cell(page, S2, "3"));
  await expect(page.getByText(`${S2.name} already has “${name("a")}”.`)).toBeVisible();
  await expect(cell(page, S1, "2").locator("li").first()).toHaveText(name("a"));
});
