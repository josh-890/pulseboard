import "dotenv/config";
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// Channel check (ADR-0038, channels): a channel name links to a channel only
// through an import alias the user set. Each item on /channels/check is decided
// on its own — anchor a name-only link, refuse one, link a waiting name, claim
// an archive channel folder. Seeds its own channels, staged sets and folders.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const R = RUN.toUpperCase();
const CHANNEL = { id: `e2e-channel-chk-${RUN}`, name: `Test channel chk ${RUN}` };
const OWNER = { id: `e2e-channel-chko-${RUN}`, name: `Test owner chk ${RUN}`, short: `ZCK${R}` };
const ANCHOR = `TEST ANCHOR ${R}`;
const REFUSE = `TEST REFUSE ${R}`;
const FOLDER = `ZCK${R}-Owner`;

test.describe.configure({ timeout: 90_000, mode: "serial" });

// Rows live in their section's list; toasts are list items too, so never match page-wide
const nameLinks = (page: import("@playwright/test").Page) =>
  page.getByRole("region", { name: /Linked by name only/ }).getByRole("listitem");
const folders = (page: import("@playwright/test").Page) =>
  page.getByRole("region", { name: /Archive folders no channel claims/ }).getByRole("listitem");
const waitingNames = (page: import("@playwright/test").Page) =>
  page.getByRole("list", { name: "Channel names of staged sets without a channel" }).getByRole("listitem");
const SLOW = { timeout: 30_000 };

test.beforeAll(async () => {
  await db.connect();
  await db.query(`INSERT INTO "Channel" (id, name) VALUES ($1, $2)`, [CHANNEL.id, CHANNEL.name]);
  await db.query(`INSERT INTO "Channel" (id, name, "shortName") VALUES ($1, $2, $3)`, [OWNER.id, OWNER.name, OWNER.short]);
  for (const name of [ANCHOR, REFUSE]) {
    await db.query(
      `INSERT INTO staging_set (id, title, "channelName", "channelId", "updatedAt") VALUES ($1, $2, $3, $4, now())`,
      [`e2e-ss-chk-${name}`, `Test staged chk ${name}`, name, CHANNEL.id],
    );
  }
  await db.query(
    `INSERT INTO archive_folder (id, "fullPath", "isVideo", "folderName", "scannedAt", tenant, "archiveKey", "chanFolderName")
     VALUES ($1, $2, false, $3, now(), 'test', $4, $5)`,
    [`e2e-af-chk-${RUN}`, `X:\\e2e-chk-${RUN}`, `Test folder chk ${RUN}`, `e2e-key-chk-${RUN}`, FOLDER],
  );
});

test.afterAll(async () => {
  await db.query(`DELETE FROM archive_folder WHERE id = $1`, [`e2e-af-chk-${RUN}`]);
  await db.query(`DELETE FROM staging_set WHERE "channelName" = ANY($1)`, [[ANCHOR, REFUSE]]);
  await db.query(`DELETE FROM "Channel" WHERE id = ANY($1)`, [[CHANNEL.id, OWNER.id]]);
  await db.end();
});

test("anchor a name-only link: it becomes an import alias and leaves the list", async ({ page }) => {
  await page.goto("/channels/check");
  const row = nameLinks(page).filter({ hasText: ANCHOR });
  await expect(row).toContainText(CHANNEL.name);
  await row.getByRole("button", { name: "Add as import alias" }).click();
  await expect(nameLinks(page).filter({ hasText: ANCHOR })).toHaveCount(0, SLOW);
  const { rows } = await db.query(`SELECT "importAliases" FROM "Channel" WHERE id = $1`, [CHANNEL.id]);
  expect(rows[0].importAliases).toContain(ANCHOR);
});

test("refuse a name-only link, then link the waiting name to a channel deliberately", async ({ page }) => {
  await page.goto("/channels/check");
  await nameLinks(page).filter({ hasText: REFUSE }).getByRole("button", { name: "Not this one" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Disconnect" }).click();

  // It now waits under "without a channel"
  const waiting = waitingNames(page).filter({ hasText: REFUSE });
  await expect(waiting).toBeVisible(SLOW);
  let { rows } = await db.query(`SELECT "channelId" FROM staging_set WHERE "channelName" = $1`, [REFUSE]);
  expect(rows[0].channelId).toBeNull();

  await waiting.getByRole("combobox").click();
  await page.getByRole("option", { name: OWNER.name }).click();
  await waiting.getByRole("button", { name: `Link to ${OWNER.name}` }).click();
  await expect(waitingNames(page).filter({ hasText: REFUSE })).toHaveCount(0, SLOW);
  ({ rows } = await db.query(`SELECT "channelId" FROM staging_set WHERE "channelName" = $1`, [REFUSE]));
  expect(rows[0].channelId).toBe(OWNER.id);
});

test("claim an archive channel folder for the channel with its Shortname", async ({ page }) => {
  await page.goto("/channels/check");
  const row = folders(page).filter({ hasText: FOLDER }).first();
  await expect(row).toContainText("same Shortname");
  await row.getByRole("button", { name: `Set ${FOLDER} as the archive folder of ${OWNER.name}` }).click();
  await expect(folders(page).filter({ hasText: FOLDER })).toHaveCount(0, SLOW);
  const { rows } = await db.query(`SELECT "channelFolder" FROM "Channel" WHERE id = $1`, [OWNER.id]);
  expect(rows[0].channelFolder).toBe(FOLDER);
});
