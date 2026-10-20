import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// Physical stats repairs (2026-10-20). A trait that never changes (Eye Pattern,
// ALWAYS_STATIC) is edited in place as always true; a value recorded by mistake
// can be taken back; "On this date" needs a date. The person starts the way the
// bug left a real one: baseline "solid", and an undated change "sectoral" that
// overrides it.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36);
const PERSON = `e2e-person-ps-${RUN}`;
const BASELINE = `${PERSON}-base`;
const UNDATED = `${PERSON}-undated`;
const SOLID = "solid (single uniform color)";
const SECTORAL = "sectoral-heterochromia (wedge of one iris differs)";
let eyePatternId = "";

async function reset() {
  await db.query(`DELETE FROM "ScalarDelta" WHERE "eraId" IN (SELECT id FROM "Era" WHERE "personId" = $1)`, [PERSON]);
  await db.query(`DELETE FROM "Era" WHERE "personId" = $1 AND id <> $2`, [PERSON, BASELINE]);
  await db.query(`INSERT INTO "Era" (id, "personId", label, "isDraft") VALUES ($1, $2, 'Undated changes', true)`, [UNDATED, PERSON]);
  await db.query(
    `INSERT INTO "ScalarDelta" (id, "eraId", "attributeDefinitionId", value) VALUES ($1, $2, $3, $4), ($5, $6, $3, $7)`,
    [`${PERSON}-d1`, BASELINE, eyePatternId, SOLID, `${PERSON}-d2`, UNDATED, SECTORAL],
  );
  await db.query(`SELECT app_recompute_person_current_state($1)`, [PERSON]);
}

async function eyePatternDeltas() {
  const r = await db.query<{ value: string; label: string }>(
    `SELECT d.value, e.label FROM "ScalarDelta" d JOIN "Era" e ON e.id = d."eraId"
      WHERE e."personId" = $1 AND d."attributeDefinitionId" = $2 ORDER BY e."isBaseline" DESC`,
    [PERSON, eyePatternId],
  );
  return r.rows.map((x) => `${x.label}: ${x.value}`);
}

test.beforeAll(async () => {
  await db.connect();
  eyePatternId = (await db.query<{ id: string }>(`SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'eye_pattern'`)).rows[0]!.id;
  await db.query(`INSERT INTO "Person" (id, "icgId") VALUES ($1, $2)`, [PERSON, `E2E-PS-${RUN}`.toUpperCase()]);
  await db.query(`INSERT INTO "PersonAlias" (id, "personId", name, "isCommon") VALUES ($1, $2, $3, true)`, [`${PERSON}-a`, PERSON, `Test Physical ${RUN}`]);
  await db.query(`INSERT INTO "Era" (id, "personId", label, "isBaseline") VALUES ($1, $2, 'Baseline', true)`, [BASELINE, PERSON]);
});

test.beforeEach(reset);

test.afterAll(async () => {
  await db.query(`DELETE FROM "ScalarDelta" WHERE "eraId" IN (SELECT id FROM "Era" WHERE "personId" = $1)`, [PERSON]);
  await db.query(`DELETE FROM "PersonCurrentState" WHERE "personId" = $1`, [PERSON]);
  await db.query(`DELETE FROM "Era" WHERE "personId" = $1`, [PERSON]);
  await db.query(`DELETE FROM "PersonAlias" WHERE "personId" = $1`, [PERSON]);
  await db.query(`DELETE FROM "Person" WHERE id = $1`, [PERSON]);
  await db.end();
});

async function openAppearance(page: Page) {
  await page.goto(`/people/${PERSON}`);
  await page.getByRole("tab", { name: "Appearance" }).click();
  await expect(page.getByText("Physical Stats")).toBeVisible();
}

const eyeRow = (page: Page) => page.locator("div.group\\/row").filter({ has: page.locator("dt", { hasText: /^Eye Pattern$/ }) });

test.describe("A trait that never changes", () => {
  test("is edited in place as baseline; the later change that overrides it can be removed", async ({ page }) => {
    await openAppearance(page);
    await expect(eyeRow(page)).toContainText("sectoral-heterochromia");

    await eyeRow(page).getByRole("button", { name: "Edit Eye Pattern" }).click();
    await expect(eyeRow(page).getByText("A later change overrides this:")).toBeVisible();

    // Baseline → sectoral
    await eyeRow(page).getByRole("combobox").click();
    await page.getByRole("option", { name: /sectoral-heterochromia/ }).click();
    await eyeRow(page).getByRole("button", { name: "Save" }).click();
    await expect(eyeRow(page).getByRole("button", { name: "Save" })).toHaveCount(0);

    // The undated override goes
    await eyeRow(page).getByRole("button", { name: "Edit Eye Pattern" }).click();
    await eyeRow(page).getByRole("button", { name: /Remove Eye Pattern: sectoral-heterochromia \(Undated changes\)/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
    await expect(eyeRow(page).getByText("A later change overrides this:")).toHaveCount(0);

    expect(await eyePatternDeltas()).toEqual([`Baseline: ${SECTORAL}`]);
    // The emptied draft Era is gone
    expect((await db.query(`SELECT 1 FROM "Era" WHERE id = $1`, [UNDATED])).rowCount).toBe(0);
  });

  test("an emptied value clears the baseline", async ({ page }) => {
    await db.query(`DELETE FROM "ScalarDelta" WHERE id = $1`, [`${PERSON}-d2`]);
    await db.query(`SELECT app_recompute_person_current_state($1)`, [PERSON]);
    await openAppearance(page);
    await eyeRow(page).getByRole("button", { name: "Edit Eye Pattern" }).click();
    await eyeRow(page).getByRole("button", { name: "Clear Eye Pattern" }).click();
    await eyeRow(page).getByRole("button", { name: "Save" }).click();
    await expect(eyeRow(page)).toHaveCount(0);
    expect(await eyePatternDeltas()).toEqual([]);
  });
});

test.describe("Record Change", () => {
  test("“On this date” needs a date; a never-changing trait suggests the baseline", async ({ page }) => {
    await openAppearance(page);
    await page.getByRole("button", { name: "Record Change" }).first().click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("radio", { name: "On this date" }).check();

    await sheet.getByRole("button", { name: /Eye Features/ }).click();
    await sheet.getByRole("combobox").filter({ hasText: /sectoral/ }).click();
    await page.getByRole("option", { name: /central-heterochromia/ }).click();

    await expect(sheet.getByRole("button", { name: "Record Change" })).toBeDisabled();
    await expect(sheet.getByText(/Pick a date, or choose/)).toBeVisible();
    await expect(sheet.getByText("Eye Pattern never changes — save as always true?")).toBeVisible();

    await sheet.getByRole("button", { name: "Use baseline" }).click();
    await expect(sheet.getByRole("radio", { name: /always true \(baseline\)/ })).toBeChecked();
    await sheet.getByRole("button", { name: "Record Change" }).click();
    await expect(sheet).toHaveCount(0);
    expect(await eyePatternDeltas()).toEqual([
      "Baseline: central-heterochromia (ring around pupil differs from outer iris)",
      `Undated changes: ${SECTORAL}`,
    ]);
  });
});

test.describe("Taking a value back", () => {
  test("the Undated drawer removes a single value", async ({ page }) => {
    await page.goto(`/people/${PERSON}`);
    await page.getByRole("button", { name: /Show timeline/ }).click();
    await page.getByRole("button", { name: /Remove Eye Pattern: sectoral-heterochromia \(Undated changes\)/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("Value removed")).toBeVisible();
    expect(await eyePatternDeltas()).toEqual([`Baseline: ${SOLID}`]);
  });

  test("emptying a field in Edit Physical Change takes it out of that change", async ({ page }) => {
    await openAppearance(page);
    const change = page.locator("div.group\\/change").filter({ hasText: "Undated changes" });
    await change.hover();
    await change.getByRole("button", { name: "Edit physical change" }).click();
    const sheet = page.getByRole("dialog");
    // Groups holding a value open by themselves
    await sheet.getByRole("button", { name: "Clear Eye Pattern" }).click();
    await expect(sheet.getByText("1 value leaves this change on Update.")).toBeVisible();
    await sheet.getByRole("button", { name: "Update" }).click();
    await expect(sheet).toHaveCount(0);
    expect(await eyePatternDeltas()).toEqual([`Baseline: ${SOLID}`]);
  });
});
