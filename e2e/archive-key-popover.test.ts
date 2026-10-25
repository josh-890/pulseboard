import "dotenv/config";
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// The archive key popover (2026-10-25): hovering a staged set's date lists the
// folders with its day and channel, and the near misses; Link confirms one.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const CODE = `AK${RUN.slice(-5).toUpperCase()}`;
const CH = `e2e-channel-ak-${RUN}`;
const SS = { id: `e2e-staging-ak-${RUN}`, title: `Artica ${RUN}` };
const WRONG = { id: `e2e-folder-akw-${RUN}`, name: `2017-10-05-${CODE} Ginger Frost - Chilea` };
const RIGHT = { id: `e2e-folder-akr-${RUN}`, name: `2017-10-05-${CODE} Nancy A - Artica ${RUN}` };
const NEAR = { id: `e2e-folder-akn-${RUN}`, name: `2017-10-06-${CODE} Mila - Nearby` };
const FOLDERS = [WRONG, RIGHT, NEAR];

test.describe.configure({ timeout: 90_000 });

test.beforeAll(async () => {
  await db.connect();
  await db.query(`INSERT INTO "Channel" (id, name, "shortName") VALUES ($1, $2, $3)`, [CH, `Test AK ${RUN}`, CODE]);
  await db.query(
    `INSERT INTO staging_set (id, title, "titleNorm", "channelName", "channelId", "releaseDate", "releaseDatePrecision", "isVideo", status, "participantNamesNorm", "updatedAt")
     VALUES ($1, $2, lower($2), $3, $4, '2017-10-05', 'DAY', false, 'PENDING', 'nancy a', now())`,
    [SS.id, SS.title, `Test AK ${RUN}`, CH],
  );
  for (const f of FOLDERS) {
    const day = f.name.slice(0, 10);
    await db.query(
      `INSERT INTO archive_folder (id, "fullPath", "folderName", "isVideo", "scannedAt", tenant, "parsedDate", "parsedShortName", "parsedTitle", "archiveKey", "fileCount")
       VALUES ($1, $2, $3, false, now(), 'default', $4, $5, $6, gen_random_uuid()::text, 40)`,
      [f.id, `X:\\E2E-AK-${RUN}\\${f.name}`, f.name, day, CODE, f.name.split(" - ")[1]],
    );
  }
  await db.query(
    `INSERT INTO "ArchiveLink" (id, "archiveFolderId", "stagingSetId", status, confidence, tenant) VALUES ($1, $2, $3, 'SUGGESTED', 'MEDIUM', 'default')`,
    [`e2e-link-ak-${RUN}`, WRONG.id, SS.id],
  );
});

test.afterAll(async () => {
  const ids = FOLDERS.map((f) => f.id);
  await db.query(`DELETE FROM "ArchiveLink" WHERE "archiveFolderId" = ANY($1)`, [ids]);
  await db.query(`DELETE FROM archive_folder WHERE id = ANY($1)`, [ids]);
  await db.query(`DELETE FROM staging_set WHERE id = $1`, [SS.id]);
  await db.query(`DELETE FROM "Channel" WHERE id = $1`, [CH]);
  await db.end();
});

test("hovering the date lists the key's folders; Link confirms the right one", async ({ page }) => {
  await page.goto(`/staging-sets?status=PENDING&search=${encodeURIComponent(SS.title)}&type=photo`);
  const trigger = page.getByRole("button", { name: "Archive folders on 2017-10-05 and the days around it", exact: true });
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  await trigger.hover();

  const pop = page.getByRole("dialog", { name: "Archive folders with this key" });
  await expect(pop).toContainText(`2017-10-05-${CODE}`);
  // The folder agreeing on person and title comes first, the matcher's guess after it
  const rows = pop.getByRole("listitem");
  await expect(rows.nth(0)).toContainText(RIGHT.name);
  await expect(rows.nth(0)).toContainText("free");
  await expect(rows.nth(1)).toContainText("suggested here");
  // The other side of the day: this staged set, holding the wrong folder
  const sets = pop.getByRole("region", { name: "Sets on this day (1)" });
  await expect(sets).toContainText(SS.title);
  await expect(sets).toContainText("this set");
  await expect(sets).toContainText(`suggested: ${WRONG.name}`);
  await expect(pop.getByText("Near misses")).toBeVisible();
  await expect(rows.filter({ hasText: NEAR.name })).toContainText("+1 day");

  await pop.getByRole("button", { name: `Link ${RIGHT.name} to this set` }).click();
  await expect
    .poll(async () => (await db.query(`SELECT status FROM "ArchiveLink" WHERE "archiveFolderId" = $1 AND "stagingSetId" = $2`, [RIGHT.id, SS.id])).rows[0]?.status)
    .toBe("CONFIRMED");
  await expect(pop).toBeHidden();
});
