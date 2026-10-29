import "dotenv/config";
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// Covers on request (ADR-0038 S7): opening a staged set without a cover asks
// the catalogue for it, and the panel says it is on the way. Seeds one staged
// set and her catalogue folder; removed after (the request goes with the set).

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36).toUpperCase();
const SET_ID = `e2e-staging-cover-${RUN}`;
const ICG = `ZZ-89@${RUN}`;

test.describe.configure({ timeout: 90_000, mode: "serial" });

test.beforeAll(async () => {
  await db.connect();
  await db.query(
    `INSERT INTO staging_set (id, title, "titleNorm", "channelName", "externalId", "subjectIcgId", participants, "participantIcgIds", "updatedAt")
     VALUES ($1, $2, $3, 'Test Channel', $4, $5, $6, $7, now())`,
    [SET_ID, `E2E Cover ${RUN}`, `e2e cover ${RUN.toLowerCase()}`, `E2E-CVR-${RUN}`, ICG, JSON.stringify([{ name: "Wren", icgId: ICG }]), [ICG]],
  );
  await db.query(
    `INSERT INTO catalogue_folder (path, "icgId", name, kind, signature, "firstRunId", "lastRunId", "updatedAt")
     VALUES ($1, $2, 'Wren', 'contact', 's', 'test', 'test', now())`,
    [`ZE2C|${RUN}`, ICG],
  );
});

test.afterAll(async () => {
  await db.query(`DELETE FROM staging_set WHERE id = $1`, [SET_ID]);
  await db.query(`DELETE FROM catalogue_folder WHERE path = $1`, [`ZE2C|${RUN}`]);
  await db.end();
});

test("opening a staged set without a cover asks the catalogue and says it is on the way", async ({ page }) => {
  await page.goto(`/staging-sets?select=${SET_ID}`);
  await expect(page.getByText(/Cover on the way from the catalogue/)).toBeVisible({ timeout: 30_000 });
  const { rows } = await db.query(`SELECT status, reason FROM catalogue_cover_request WHERE "stagingSetId" = $1`, [SET_ID]);
  expect(rows).toEqual([{ status: "WANTED", reason: "opened" }]);
});
