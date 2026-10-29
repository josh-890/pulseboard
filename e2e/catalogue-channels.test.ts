import "dotenv/config";
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// Catalogue channels (ADR-0038 S4): a channel name the catalogue writes that no
// import alias links shows on /channels/check with what it would connect, and
// linking it — here through the hint of the channel owning its archive folders —
// takes it off the list and connects its waiting staged set. Seeds its own rows.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const R = RUN.toUpperCase();
const OWNER = { id: `e2e-channel-cat-${RUN}`, name: `Test owner cat ${RUN}`, folder: `ZCT${R}-Owner` };
const NAME = `TEST CATNAME ${R}`;
const SLOW = { timeout: 30_000 };

test.describe.configure({ timeout: 90_000, mode: "serial" });

const catalogueRows = (page: import("@playwright/test").Page) =>
  page.getByRole("list", { name: "Catalogue channel names" }).getByRole("listitem").filter({ hasText: NAME });

test.beforeAll(async () => {
  await db.connect();
  await db.query(`INSERT INTO "Channel" (id, name, "channelFolder") VALUES ($1, $2, $3)`, [OWNER.id, OWNER.name, OWNER.folder]);
  for (const n of ["1", "2"]) {
    await db.query(
      `INSERT INTO catalogue_set ("coverId", "channelName", title, date, "castIcgIds") VALUES ($1, $2, $3, $4, '{}')`,
      [`E2E-CAT-${R}-${n}`, NAME, `Test set ${n}`, n === "1" ? "2011-01-01" : "2015-06-01"],
    );
  }
  await db.query(
    `INSERT INTO archive_folder (id, "fullPath", "isVideo", "folderName", "scannedAt", tenant, "archiveKey", "chanFolderName")
     VALUES ($1, $2, false, $3, now(), 'test', $4, $5)`,
    [`e2e-af-cat-${RUN}`, `X:\\e2e-cat-${RUN}`, `Test folder cat ${RUN}`, `e2e-key-cat-${RUN}`, OWNER.folder],
  );
  await db.query(
    `INSERT INTO archive_folder_suggestion (id, "archiveFolderId", "icgId", name, source, tier, score, demotions, evidence)
     VALUES ($1, $2, 'ZZ-97@CAT', 'Test', 'CATALOGUE', 'EXACT', 1, '{}', $3)`,
    [`e2e-afs-cat-${RUN}`, `e2e-af-cat-${RUN}`, JSON.stringify({ matchedChannel: NAME })],
  );
  await db.query(
    `INSERT INTO staging_set (id, title, "channelName", "updatedAt") VALUES ($1, $2, $3, now())`,
    [`e2e-ss-cat-${RUN}`, `Test staged cat ${RUN}`, NAME],
  );
});

test.afterAll(async () => {
  await db.query(`DELETE FROM archive_folder WHERE id = $1`, [`e2e-af-cat-${RUN}`]);
  await db.query(`DELETE FROM staging_set WHERE id = $1`, [`e2e-ss-cat-${RUN}`]);
  await db.query(`DELETE FROM catalogue_set WHERE "coverId" LIKE $1`, [`E2E-CAT-${R}-%`]);
  await db.query(`DELETE FROM "Channel" WHERE id = $1`, [OWNER.id]);
  await db.end();
});

test("a catalogue name shows what it connects, and its hint links it", async ({ page }) => {
  await page.goto(`/channels/check?cq=${encodeURIComponent(NAME)}`);
  const row = catalogueRows(page);
  await expect(row).toContainText("1 archive folder · 1 waiting staged set · 2 catalogue sets · 2011–2015");
  await expect(row).toContainText(`archive folders in ${OWNER.folder}`);
  // Its waiting staged set is decided here, not twice
  await expect(
    page.getByRole("list", { name: "Channel names of staged sets without a channel" }).getByText(NAME),
  ).toHaveCount(0);

  await row.getByRole("button", { name: `Link to ${OWNER.name}` }).first().click();
  await expect(catalogueRows(page)).toHaveCount(0, SLOW);
  const { rows } = await db.query(
    `SELECT c."importAliases", s."channelId" FROM "Channel" c, staging_set s WHERE c.id = $1 AND s.id = $2`,
    [OWNER.id, `e2e-ss-cat-${RUN}`],
  );
  expect(rows[0].importAliases).toContain(NAME);
  expect(rows[0].channelId).toBe(OWNER.id);
});
