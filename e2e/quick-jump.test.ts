import "dotenv/config";
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// Quick jump (2026-11-13): Ctrl+K, type, Enter → the page. Own person + channel,
// removed afterwards.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const ICG = `QJ${RUN}`.toUpperCase();
const NAME = `Quilla ${RUN}`;
const AKA = `Zephyrine ${RUN}`;
const CHANNEL = `Jumpchannel ${RUN}`;
const ids = { person: `e2e-person-qj-${RUN}`, channel: `e2e-ch-qj-${RUN}` };

test.beforeAll(async () => {
  await db.connect();
  await db.query(`INSERT INTO "Person" (id, "icgId") VALUES ($1, $2)`, [ids.person, ICG]);
  await db.query(`INSERT INTO "PersonAlias" (id, "personId", name, "isCommon") VALUES ($1, $2, $3, true), ($4, $2, $5, false)`,
    [`${ids.person}-a`, ids.person, NAME, `${ids.person}-b`, AKA]);
  await db.query(`INSERT INTO "Channel" (id, name) VALUES ($1, $2)`, [ids.channel, CHANNEL]);
});

test.afterAll(async () => {
  await db.query(`DELETE FROM "PersonAlias" WHERE "personId" = $1`, [ids.person]);
  await db.query(`DELETE FROM "PersonCurrentState" WHERE "personId" = $1`, [ids.person]).catch(() => undefined);
  await db.query(`DELETE FROM "Person" WHERE id = $1`, [ids.person]);
  await db.query(`DELETE FROM "Channel" WHERE id = $1`, [ids.channel]);
  await db.end();
});

test("Ctrl+K finds a person by ICG-ID and Enter opens her page", async ({ page }) => {
  test.slow();
  await page.goto("/sets");
  await expect(page.getByTestId("quick-jump-trigger")).toBeVisible({ timeout: 30_000 });
  const box = page.getByTestId("quick-jump");
  await expect(async () => {
    await page.keyboard.press("Control+k"); // until the page has hydrated
    await expect(box).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await box.getByRole("combobox").fill(ICG.toLowerCase());
  const hit = box.getByRole("option", { name: new RegExp(`${NAME} \\(${ICG}\\)`) });
  await expect(hit).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/people/${ids.person}$`), { timeout: 30_000 });
  await expect(box).toHaveCount(0);
});

test("an other alias finds her too, and the button opens it; groups are named", async ({ page }) => {
  test.slow();
  await page.goto("/sets");
  await page.getByTestId("quick-jump-trigger").click();
  const box = page.getByTestId("quick-jump");
  await box.getByRole("combobox").fill(AKA);
  await expect(box.getByRole("option", { name: new RegExp(`a\\.k\\.a\\. ${AKA}`) })).toBeVisible({ timeout: 20_000 });
  await expect(box.getByText("People", { exact: true })).toBeVisible();

  await box.getByRole("combobox").fill(CHANNEL);
  await expect(box.getByText("Channels", { exact: true })).toBeVisible({ timeout: 20_000 });
  await box.getByRole("option", { name: new RegExp(CHANNEL) }).click();
  await expect(page).toHaveURL(new RegExp(`/channels/${ids.channel}$`), { timeout: 30_000 });

  // Empty, it offers Recently viewed (the channel just opened) — once the page is up
  await expect(page.getByRole("heading", { name: CHANNEL })).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await page.keyboard.press("Control+k");
    await expect(page.getByTestId("quick-jump")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByTestId("quick-jump").getByText("Recently viewed")).toBeVisible();
  await expect(page.getByTestId("quick-jump").getByRole("option", { name: new RegExp(CHANNEL) })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("quick-jump")).toHaveCount(0);
});

test("nothing found says so", async ({ page }) => {
  test.slow();
  await page.goto("/sets");
  await page.getByTestId("quick-jump-trigger").click();
  await page.getByTestId("quick-jump").getByRole("combobox").fill(`zzqq${RUN}`);
  await expect(page.getByTestId("quick-jump")).toContainText("Nothing found", { timeout: 20_000 });
});
