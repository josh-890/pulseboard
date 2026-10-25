import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// Intensity presets (2026-10-24): a preset pill (or its digit while the panel
// has focus) ticks its acts for the selected models — marked ◇, to review —
// Undo takes it back, Confirm (⏎) marks them checked. The bar shows one
// scenario's presets, the cast's first. In Settings a preset is created, its
// acts picked and its value shown.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const SESSION = `e2e-session-ip-${RUN}`;
const A = { id: `e2e-person-ip-a-${RUN}`, icg: `E2E-IPA-${RUN}`.toUpperCase(), name: `Test Anna ${RUN}`, c: `${SESSION}-ca` };
const B = { id: `e2e-person-ip-b-${RUN}`, icg: `E2E-IPB-${RUN}`.toUpperCase(), name: `Test Bea ${RUN}`, c: `${SESSION}-cb` };
const LOW = { id: `e2e-act-ip1-${RUN}`, name: `Test act low ${RUN}` };
const HIGH = { id: `e2e-act-ip2-${RUN}`, name: `Test act high ${RUN}` };
const PRESET = { id: `e2e-preset-ip-${RUN}`, name: `Test preset ${RUN}` };
const SOLO_PRESET = { id: `e2e-preset-ips-${RUN}`, name: `Test solo preset ${RUN}` };
const NEW_PRESET = `Test preset new ${RUN}`;

test.describe.configure({ timeout: 90_000 });

test.beforeAll(async () => {
  await db.connect();
  for (const p of [A, B]) {
    await db.query(`INSERT INTO "Person" (id, "icgId", "sexAtBirth") VALUES ($1, $2, 'female')`, [p.id, p.icg]);
    await db.query(`INSERT INTO "PersonAlias" (id, "personId", name, "isCommon") VALUES ($1, $2, $3, true)`, [`${p.id}-a`, p.id, p.name]);
  }
  await db.query(`INSERT INTO "Session" (id, name, "updatedAt") VALUES ($1, $2, now())`, [SESSION, `Test session ip ${RUN}`]);
  for (const p of [A, B]) {
    await db.query(`INSERT INTO "SessionContribution" (id, "sessionId", "personId", "roleDefinitionId") VALUES ($1, $2, $3, 'crd_model')`, [p.c, SESSION, p.id]);
  }
  // Level 0.5 and 9: the preset holds the low one, the high one sits above it
  await db.query(`INSERT INTO "IntensityAct" (id, "scenarioId", name, level) VALUES ($1, 'dsit-gg', $2, 0.5), ($3, 'dsit-gg', $4, 9)`, [
    LOW.id,
    LOW.name,
    HIGH.id,
    HIGH.name,
  ]);
  // First in order, so it is the digit 1
  // For G-G — the cast is two women
  await db.query(`INSERT INTO "IntensityPreset" (id, "scenarioId", name, "sortOrder") VALUES ($1, 'dsit-gg', $2, -1000)`, [PRESET.id, PRESET.name]);
  await db.query(`INSERT INTO "IntensityPreset" (id, "scenarioId", name, "sortOrder") VALUES ($1, 'dsit-solo', $2, -1000)`, [SOLO_PRESET.id, SOLO_PRESET.name]);
  await db.query(`INSERT INTO "IntensityPresetAct" ("presetId", "actId") VALUES ($1, $2)`, [PRESET.id, LOW.id]);
  await db.query(`INSERT INTO "IntensityPresetExtra" ("presetId", "extraId") VALUES ($1, 'dset-public')`, [PRESET.id]);
});

test.beforeEach(async () => {
  await db.query(`DELETE FROM "ContributionAct" WHERE "contributionId" IN ($1, $2)`, [A.c, B.c]);
  await db.query(`DELETE FROM "ContributionExtra" WHERE "contributionId" IN ($1, $2)`, [A.c, B.c]);
  await db.query(`UPDATE "SessionContribution" SET "intensityReviewedAt" = NULL WHERE id IN ($1, $2)`, [A.c, B.c]);
});

test.afterAll(async () => {
  await db.query(`DELETE FROM "SessionContribution" WHERE "sessionId" = $1`, [SESSION]);
  await db.query(`DELETE FROM "IntensityPreset" WHERE id IN ($1, $2) OR name = $3`, [PRESET.id, SOLO_PRESET.id, NEW_PRESET]);
  await db.query(`DELETE FROM "IntensityAct" WHERE id IN ($1, $2)`, [LOW.id, HIGH.id]);
  await db.query(`DELETE FROM "Session" WHERE id = $1`, [SESSION]);
  for (const p of [A, B]) {
    await db.query(`DELETE FROM "PersonAlias" WHERE "personId" = $1`, [p.id]);
    await db.query(`DELETE FROM "Person" WHERE id = $1`, [p.id]);
  }
  await db.end();
});

const ticks = async (c: string) =>
  (await db.query<{ act: string; preset: string | null }>(
    `SELECT "actId" AS act, "presetId" AS preset FROM "ContributionAct" WHERE "contributionId" = $1 ORDER BY 1`,
    [c],
  )).rows;
const reviewed = async (c: string) =>
  (await db.query<{ r: Date | null }>(`SELECT "intensityReviewedAt" AS r FROM "SessionContribution" WHERE id = $1`, [c])).rows[0]!.r !== null;

async function openPanel(page: Page) {
  await page.goto(`/sessions/${SESSION}`);
  const panel = page.getByRole("region", { name: "Intensity panel" });
  await expect(async () => {
    if (!(await panel.isVisible())) await page.getByRole("button", { name: "Intensity", exact: true }).first().click();
    await expect(panel).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  return panel;
}

test("a preset ticks for everyone selected, marks its ticks, asks above it — Confirm checks them", async ({ page }) => {
  const panel = await openPanel(page);
  await panel.getByRole("button", { name: "All", exact: true }).click();
  await expect(panel.getByText("Not rated yet")).toBeVisible();
  // Two women: the bar starts on G-G; the Solo presets are one switch away
  const presets = panel.getByRole("group", { name: "Presets" });
  const scenarioSwitch = panel.getByRole("radiogroup", { name: "Presets for scenario" });
  await expect(scenarioSwitch.getByRole("radio", { name: /G-G/ })).toHaveAttribute("aria-checked", "true");
  await expect(presets.getByRole("button", { name: new RegExp(`Apply ${SOLO_PRESET.name}`) })).toHaveCount(0);
  await scenarioSwitch.getByRole("radio", { name: "Solo" }).click();
  await expect(presets.getByRole("button", { name: new RegExp(`Apply ${SOLO_PRESET.name}`) })).toBeVisible();
  await expect(presets.getByRole("button", { name: new RegExp(`Apply ${PRESET.name} `) })).toHaveCount(0);
  // All: every preset in one row, each naming its scenario
  await scenarioSwitch.getByRole("radio", { name: "All" }).click();
  await expect(presets.getByRole("button", { name: `Apply ${SOLO_PRESET.name} (Solo) to 2 people` })).toBeVisible();
  await expect(presets.getByRole("button", { name: `Apply ${PRESET.name} (G-G) to 2 people` })).toBeVisible();
  await scenarioSwitch.getByRole("radio", { name: /G-G/ }).click();
  await panel.getByRole("button", { name: `Apply ${PRESET.name} to 2 people` }).click();

  for (const p of [A, B]) await expect.poll(() => ticks(p.c)).toEqual([{ act: LOW.id, preset: PRESET.id }]);
  await expect.poll(async () => (await db.query(`SELECT "extraId" FROM "ContributionExtra" WHERE "contributionId" = $1`, [B.c])).rows).toEqual([
    { extraId: "dset-public" },
  ]);
  await expect(panel.getByText("2 of 2 to review")).toBeVisible();
  await expect(panel.getByLabel(`from the preset ${PRESET.name}`).first()).toBeVisible();
  // The act above the preset is asked about first
  await expect(panel.getByRole("list", { name: "Acts above the preset" }).getByRole("checkbox", { name: HIGH.name })).toBeVisible();

  await panel.getByRole("button", { name: "Confirm the intensity of 2 people" }).click();
  for (const p of [A, B]) await expect.poll(() => reviewed(p.c)).toBe(true);
  await expect(panel.getByText(/Confirmed/)).toBeVisible();
  await expect(panel.getByLabel(`from the preset ${PRESET.name}`)).toHaveCount(0);
});

test("the digit applies a preset while the panel has focus, Undo takes it back, ⏎ confirms", async ({ page }) => {
  const panel = await openPanel(page);
  // Anna alone (the first chip is selected); focus a tick in the panel
  await panel.getByRole("checkbox", { name: LOW.name }).focus();
  await page.keyboard.press("1");
  await expect.poll(() => ticks(A.c)).toEqual([{ act: LOW.id, preset: PRESET.id }]);
  expect(await ticks(B.c)).toEqual([]);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => ticks(A.c)).toEqual([]);

  await page.keyboard.press("1");
  await expect.poll(() => ticks(A.c)).toHaveLength(1);
  await panel.getByRole("checkbox", { name: LOW.name }).focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => reviewed(A.c)).toBe(true);
});

test("in Settings a preset is created and its acts picked", async ({ page }) => {
  await page.goto("/settings/catalogs/intensity#presets");
  const add = page.getByPlaceholder("New G-G preset — e.g. Artistic nude");
  await add.fill(NEW_PRESET);
  await add.press("Enter");
  const card = page.getByRole("region", { name: `Preset ${NEW_PRESET}` });
  await expect(card).toBeVisible();
  await card.getByRole("group", { name: "Acts in G-G" }).getByRole("button", { name: new RegExp(LOW.name) }).click();
  await expect
    .poll(async () => (await db.query(`SELECT pa."actId" FROM "IntensityPresetAct" pa JOIN "IntensityPreset" p ON p.id = pa."presetId" WHERE p.name = $1`, [NEW_PRESET])).rows)
    .toEqual([{ actId: LOW.id }]);
  // Its value: the highest act
  await expect(card.getByLabel(`${NEW_PRESET} gives 0.5`)).toBeVisible();
  await card.getByRole("button", { name: `Delete ${NEW_PRESET}` }).click();
  await expect(card).toHaveCount(0);
});
