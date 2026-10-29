import "dotenv/config";
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// Archive matching (ADR-0038 S5): Match now on the runs page matches an archive
// folder against the catalogue sets in the background, and the page then shows
// what it found. Seeds a channel (import alias + Shortname), a Contact with a
// channel alias, one catalogue set and one archive folder; all removed after.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36).toUpperCase();
const SHORT = `ZEM${RUN}`;
const ALIAS = `E2E MATCH ${RUN}`;
const ICG = `ZZ-94@${RUN}`;
const FOLDER_ID = `e2e-af-match-${RUN}`;

test.describe.configure({ timeout: 90_000, mode: "serial" });

let matchBefore: string | null = null;

test.beforeAll(async () => {
  await db.connect();
  matchBefore = (await db.query(`SELECT value FROM "Setting" WHERE key = 'catalogue.match.last'`)).rows[0]?.value ?? null;
  await db.query(`INSERT INTO "Channel" (id, name, "shortName", "importAliases") VALUES ($1, $2, $3, $4)`, [
    `e2e-channel-match-${RUN}`, `Test match ${RUN}`, SHORT, [ALIAS],
  ]);
  const contact = `e2e-contact-match-${RUN}`;
  await db.query(`INSERT INTO "PersonRef" (id, "icgId", name, "updatedAt") VALUES ($1, $2, 'Test Mira', now())`, [contact, ICG]);
  await db.query(
    `INSERT INTO contact_channel_alias ("contactId", "channelName", alias, "aliasNorm") VALUES ($1, $2, 'Miraz', 'miraz')`,
    [contact, ALIAS],
  );
  await db.query(
    `INSERT INTO catalogue_set ("coverId", "channelName", title, date, "castIcgIds") VALUES ($1, $2, 'Morning Light', '2016-07-08', $3)`,
    [`E2E-MATCH-${RUN}`, ALIAS, [ICG]],
  );
  await db.query(
    `INSERT INTO archive_folder (id, "fullPath", "isVideo", "folderName", "scannedAt", tenant, "archiveKey",
       "parsedDate", "parsedShortName", "parsedTitle")
     VALUES ($1, $2, false, $3, now(), 'test', $4, '2016-07-08', $5, 'Quite Different')`,
    [FOLDER_ID, `X:\\e2e-match-${RUN}`, `2016-07-08-${SHORT} Miraz - Quite Different`, `e2e-key-match-${RUN}`, SHORT],
  );
});

test.afterAll(async () => {
  await db.query(`DELETE FROM archive_folder WHERE id = $1`, [FOLDER_ID]);
  await db.query(`DELETE FROM catalogue_set WHERE "coverId" = $1`, [`E2E-MATCH-${RUN}`]);
  await db.query(`DELETE FROM "PersonRef" WHERE "icgId" = $1`, [ICG]);
  await db.query(`DELETE FROM "Channel" WHERE id = $1`, [`e2e-channel-match-${RUN}`]);
  if (matchBefore) await db.query(`UPDATE "Setting" SET value = $1 WHERE key = 'catalogue.match.last'`, [matchBefore]);
  else await db.query(`DELETE FROM "Setting" WHERE key = 'catalogue.match.last'`);
  await db.end();
});

test("Match now matches a folder by channel + alias though its title differs, and the page reports it", async ({ page }) => {
  await page.goto("/people/contacts/runs");
  const section = page.getByRole("region", { name: "Archive matching" });
  await section.getByRole("button", { name: "Match now" }).click();
  await expect(page.getByText(/Matching started/)).toBeVisible();

  await expect
    .poll(async () => {
      const { rows } = await db.query(
        `SELECT tier, demotions FROM archive_folder_suggestion WHERE "archiveFolderId" = $1 AND source = 'CATALOGUE'`,
        [FOLDER_ID],
      );
      return rows;
    }, { timeout: 60_000 })
    .toEqual([{ tier: "EXACT", demotions: [] }]);

  await page.reload();
  await expect(section).toContainText(/Last matched .* every folder without a set/);
  await expect(section).toContainText(/with a suggestion \(\d+ exact/);
});
