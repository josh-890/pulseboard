import "dotenv/config";
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// Recently viewed (2026-11-13): the last detail pages opened, in the top bar.
// Own channel + person, removed afterwards.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const CHANNEL = `Recent Channel ${RUN}`;
const NAME = `Rita ${RUN}`;
const ICG = `E2ERC${RUN}`.toUpperCase();
const ids = { channel: `e2e-ch-recent-${RUN}`, person: `e2e-person-recent-${RUN}` };

test.beforeAll(async () => {
  await db.connect();
  await db.query(`INSERT INTO "Channel" (id, name) VALUES ($1, $2)`, [ids.channel, CHANNEL]);
  await db.query(`INSERT INTO "Person" (id, "icgId") VALUES ($1, $2)`, [ids.person, ICG]);
  await db.query(`INSERT INTO "PersonAlias" (id, "personId", name, "isCommon") VALUES ($1, $2, $3, true)`, [`${ids.person}-a`, ids.person, NAME]);
});

test.afterAll(async () => {
  await db.query(`DELETE FROM "PersonAlias" WHERE "personId" = $1`, [ids.person]);
  await db.query(`DELETE FROM "PersonCurrentState" WHERE "personId" = $1`, [ids.person]).catch(() => undefined);
  await db.query(`DELETE FROM "Person" WHERE id = $1`, [ids.person]);
  await db.query(`DELETE FROM "Channel" WHERE id = $1`, [ids.channel]);
  await db.end();
});

test("Recent lists the pages opened, newest first, without the one you are on", async ({ page }) => {
  test.slow();
  await page.goto(`/channels/${ids.channel}`);
  await expect(page.getByRole("heading", { name: CHANNEL })).toBeVisible({ timeout: 30_000 });
  await page.goto(`/people/${ids.person}`);
  await expect(page.getByText(NAME).first()).toBeVisible({ timeout: 30_000 });

  // On the person: the channel is listed, the person (current page) is not
  await page.getByTestId("recent-trigger").click();
  const list = page.getByTestId("recent-list");
  await expect(list.getByRole("link", { name: new RegExp(CHANNEL) })).toBeVisible();
  await expect(list.getByRole("link", { name: new RegExp(NAME) })).toHaveCount(0);

  // Open the channel from Recent: now the person sits on top, named with the ICG-ID
  await list.getByRole("link", { name: new RegExp(CHANNEL) }).click();
  await expect(page).toHaveURL(new RegExp(`/channels/${ids.channel}$`), { timeout: 20_000 });
  await page.getByTestId("recent-trigger").click();
  await expect(page.getByTestId("recent-list").getByRole("link").first()).toContainText(`${NAME} (${ICG})`);

  // Clear empties it
  await page.getByTestId("recent-list").getByRole("button", { name: "Clear" }).click();
  await expect(page.getByTestId("recent-list")).toContainText("show up here");
});
