import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// The act's panel (2026-10-23, K2): a click on a card opens it beside the
// board (`?act=` in the address); ↑/↓ walk the cards, Esc closes, Back closes.
// It edits level, scenario and description, lists where the act is ticked —
// `Name (ICG-ID)` — and deletes an unticked act. On the card: Enter opens,
// F2 or a double-click renames.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36);
const S1 = { id: `e2e-scn-pa-${RUN}`, name: `Test Panel A ${RUN}` };
const S2 = { id: `e2e-scn-pb-${RUN}`, name: `Test Panel B ${RUN}` };
const ACT = (k: string) => ({ id: `e2e-act-p${k}-${RUN}`, name: `Test act ${k} ${RUN}` });
const A = ACT("a");
const B = ACT("b");
const C = ACT("c");
const ICG = `E2E-PA-${RUN}`.toUpperCase();
const PERSON = `Panel Model ${RUN}`;
const ids = { person: `e2e-person-pa-${RUN}`, session: `e2e-session-pa-${RUN}`, c: `e2e-contrib-pa-${RUN}` };

test.use({ viewport: { width: 2200, height: 1000 } });
test.describe.configure({ timeout: 90_000 });

test.beforeAll(async () => {
  await db.connect();
  await db.query(`INSERT INTO "IntensityScenario" (id, name, "sortOrder") VALUES ($1, $2, -20), ($3, $4, -19)`, [
    S1.id,
    S1.name,
    S2.id,
    S2.name,
  ]);
  await db.query(`INSERT INTO "Person" (id, "icgId") VALUES ($1, $2)`, [ids.person, ICG]);
  await db.query(`INSERT INTO "PersonAlias" (id, "personId", name, "isCommon") VALUES ($1, $2, $3, true)`, [
    `e2e-alias-pa-${RUN}`,
    ids.person,
    PERSON,
  ]);
  await db.query(`INSERT INTO "Session" (id, name, date, "datePrecision", "updatedAt") VALUES ($1, $2, '2019-05-04', 'DAY', now())`, [
    ids.session,
    `Test Session panel ${RUN}`,
  ]);
  await db.query(`INSERT INTO "SessionContribution" (id, "sessionId", "personId", "roleDefinitionId") VALUES ($1, $2, $3, 'crd_model')`, [
    ids.c,
    ids.session,
    ids.person,
  ]);
});
test.beforeEach(async () => {
  await db.query(`DELETE FROM "ContributionAct" WHERE "contributionId" = $1`, [ids.c]);
  await db.query(`DELETE FROM "IntensityAct" WHERE "scenarioId" IN ($1, $2) OR id LIKE $3`, [S1.id, S2.id, `e2e-act-p%-${RUN}`]);
  await db.query(
    `INSERT INTO "IntensityAct" (id, "scenarioId", name, level, "sortOrder") VALUES ($1, $4, $5, 2, 0), ($2, $4, $6, 2, 1), ($3, $7, $8, 3, 0)`,
    [A.id, B.id, C.id, S1.id, A.name, B.name, S2.id, C.name],
  );
  await db.query(`INSERT INTO "ContributionAct" (id, "contributionId", "actId") VALUES ($1, $2, $3)`, [`e2e-ca-pa-${RUN}`, ids.c, A.id]);
});
test.afterAll(async () => {
  await db.query(`DELETE FROM "SessionContribution" WHERE id = $1`, [ids.c]);
  await db.query(`DELETE FROM "Session" WHERE id = $1`, [ids.session]);
  await db.query(`DELETE FROM "PersonAlias" WHERE "personId" = $1`, [ids.person]);
  await db.query(`DELETE FROM "Person" WHERE id = $1`, [ids.person]);
  await db.query(`DELETE FROM "IntensityAct" WHERE id LIKE $1`, [`e2e-act-p%-${RUN}`]);
  await db.query(`DELETE FROM "IntensityScenario" WHERE id IN ($1, $2)`, [S1.id, S2.id]);
  await db.end();
});

const card = (page: Page, a: { name: string }) => page.getByRole("button", { name: new RegExp(`^${a.name}, level`) });
const panel = (page: Page, a: { name: string }) => page.getByRole("complementary", { name: `Act ${a.name}` });
const cell = (page: Page, s: { name: string }, level: string) => page.getByRole("cell", { name: `${s.name} at ${level}`, exact: true });
async function act(id: string) {
  return (await db.query<{ scenarioId: string; level: number; name: string; description: string | null }>(
    `SELECT "scenarioId", level, name, description FROM "IntensityAct" WHERE id = $1`,
    [id],
  )).rows[0];
}

test("a click opens the panel; ↑/↓ walk the cards, Esc closes", async ({ page }) => {
  await page.goto("/settings/catalogs/intensity");
  await expect(async () => {
    await card(page, A).click();
    await expect(panel(page, A)).toBeVisible({ timeout: 1000 });
  }).toPass(); // until hydrated
  await expect(page).toHaveURL(new RegExp(`act=${A.id}`));
  await expect(card(page, A)).toHaveAttribute("aria-current", "true");

  await page.keyboard.press("ArrowDown");
  await expect(panel(page, B)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`act=${B.id}`));
  await page.keyboard.press("ArrowDown"); // next column
  await expect(panel(page, C)).toBeVisible();
  await page.keyboard.press("ArrowUp");
  await expect(panel(page, B)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(panel(page, B)).toHaveCount(0);
  await expect(page).not.toHaveURL(/act=/);
});

test("it shows where the act is ticked, Name (ICG-ID), and keeps a ticked act from deletion", async ({ page }) => {
  await page.goto(`/settings/catalogs/intensity?act=${A.id}`);
  const p = panel(page, A);
  await expect(p).toBeVisible();
  await expect(p.getByText("Ticked in 1 session")).toBeVisible();
  const where = p.getByRole("list", { name: `Where ${A.name} is ticked` });
  await expect(where).toContainText(`${PERSON} (${ICG})`);
  await expect(where).toContainText(`2019-05-04 · Test Session panel ${RUN}`);
  await expect(where.getByRole("link")).toHaveAttribute("href", `/sessions/${ids.session}`);
  await expect(p.getByRole("button", { name: /Delete act/ })).toBeDisabled();
});

test("Back closes a panel opened by a click; switching cards adds no history", async ({ page }) => {
  await page.goto("/settings/catalogs/intensity");
  await expect(async () => {
    await card(page, B).click();
    await expect(panel(page, B)).toBeVisible({ timeout: 1000 });
  }).toPass();
  await card(page, A).click();
  await expect(panel(page, A)).toBeVisible();
  await page.goBack();
  await expect(panel(page, A)).toHaveCount(0);
  await expect(page).toHaveURL(/\/settings\/catalogs\/intensity$/);
});

test("level, scenario and description change in the panel; an unticked act is deleted after asking", async ({ page }) => {
  await page.goto(`/settings/catalogs/intensity?act=${B.id}`);
  const p = panel(page, B);
  await expect(p).toBeVisible();

  const level = p.getByRole("spinbutton", { name: `Level of ${B.name}` });
  await level.fill("4.5");
  await level.press("Enter");
  await expect.poll(async () => (await act(B.id))!.level).toBe(4.5);
  await expect(cell(page, S1, "4.5").locator("li")).toHaveText([B.name]);

  await p.getByRole("combobox", { name: `Scenario of ${B.name}` }).selectOption({ label: S2.name });
  await expect.poll(async () => (await act(B.id))!.scenarioId).toBe(S2.id);
  await expect(cell(page, S2, "4.5").locator("li")).toHaveText([B.name]);

  await p.getByText("Add a description").click();
  await p.getByRole("textbox").fill("Test: what it means");
  await p.getByRole("textbox").press("Control+Enter");
  await expect.poll(async () => (await act(B.id))!.description).toBe("Test: what it means");

  await p.getByRole("button", { name: /Delete act/ }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(`Delete the act ${B.name}?`);
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect.poll(() => act(B.id)).toBeUndefined();
  await expect(panel(page, B)).toHaveCount(0);
});

test("on the card: Enter opens, F2 and a double-click rename", async ({ page }) => {
  await page.goto("/settings/catalogs/intensity");
  await expect(async () => {
    await card(page, C).focus();
    await page.keyboard.press("F2");
    await expect(page.getByRole("textbox", { name: `Rename ${C.name}` })).toBeVisible({ timeout: 1000 });
  }).toPass();
  const field = page.getByRole("textbox", { name: `Rename ${C.name}` });
  await field.fill(`${C.name} x`);
  await field.press("Enter");
  await expect.poll(async () => (await act(C.id))!.name).toBe(`${C.name} x`);

  const renamed = { name: `${C.name} x` };
  await card(page, renamed).focus();
  await page.keyboard.press("Enter");
  await expect(panel(page, renamed)).toBeVisible();

  await card(page, A).dblclick();
  const again = page.getByRole("textbox", { name: `Rename ${A.name}` });
  await expect(again).toBeVisible();
  await again.press("Escape"); // leaves it as it was
  await expect(card(page, A)).toBeVisible();
  expect((await act(A.id))!.name).toBe(A.name);
});
