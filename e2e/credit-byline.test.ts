import "dotenv/config";
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// "by Photographer" in the set and session hero: the behind-camera lead credits as a
// byline next to the channel — a resolved artist links to their page, a credit not
// resolved yet is a dimmed name, the cast (Model) is not in it.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const SESSION = `e2e-session-byl-${RUN}`;
const SET = `e2e-set-byl-${RUN}`;
const ARTIST = `e2e-artist-byl-${RUN}`;
const ARTIST_NAME = `Test Byline Artist ${RUN}`;
const RAW = `Test Raw Shooter ${RUN}`;
const MODEL = `Test Byline Model ${RUN}`;

test.describe.configure({ mode: "serial", timeout: 60_000 });

const role = async (slug: string) =>
  (await db.query<{ id: string }>(`SELECT id FROM "ContributionRoleDefinition" WHERE slug = $1`, [slug])).rows[0].id;

test.beforeAll(async () => {
  await db.connect();
  const photographer = await role("photographer");
  const model = await role("model");
  await db.query(`INSERT INTO "Session" (id, name, "updatedAt") VALUES ($1, $2, now())`, [SESSION, `Test Session byl ${RUN}`]);
  await db.query(`INSERT INTO "Set" (id, type, title, "updatedAt") VALUES ($1, 'photo', $2, now())`, [SET, `Test Byline Set ${RUN}`]);
  await db.query(`INSERT INTO "SetSession" ("setId", "sessionId", "isPrimary") VALUES ($1, $2, true)`, [SET, SESSION]);
  await db.query(`INSERT INTO "Artist" (id, name, "nameNorm", "updatedAt") VALUES ($1, $2, lower($2), now())`, [ARTIST, ARTIST_NAME]);
  const credit = (id: string, raw: string, roleId: string, artistId: string | null) =>
    db.query(
      `INSERT INTO "SetCreditRaw" (id, "setId", "roleDefinitionId", "rawName", "resolutionStatus", "resolvedArtistId", "updatedAt")
       VALUES ($1, $2, $3, $4, $5::"ResolutionStatus", $6, now())`,
      [`${SET}-${id}`, SET, roleId, raw, artistId ? "RESOLVED" : "UNRESOLVED", artistId],
    );
  await credit("c1", "Byline A.", photographer, ARTIST);
  await credit("c2", RAW, photographer, null);
  await credit("c3", MODEL, model, null);
});

test.afterAll(async () => {
  await db.query(`DELETE FROM "SetCreditRaw" WHERE "setId" = $1`, [SET]);
  await db.query(`DELETE FROM "Artist" WHERE id = $1`, [ARTIST]);
  await db.query(`DELETE FROM "SetSession" WHERE "sessionId" = $1`, [SESSION]);
  await db.query(`DELETE FROM "Set" WHERE id = $1`, [SET]);
  await db.query(`DELETE FROM "Session" WHERE id = $1`, [SESSION]);
  await db.end();
});

for (const [what, path] of [
  ["set", () => `/sets/${SET}`],
  ["session", () => `/sessions/${SESSION}`],
] as const) {
  test(`the ${what} hero names the photographers`, async ({ page }) => {
    await page.goto(path());
    const byline = page.getByTestId("credit-byline");
    await expect(byline).toBeVisible();
    const artist = byline.getByTestId("credit-byline-artist");
    await expect(artist).toContainText(ARTIST_NAME);
    await expect(artist).toHaveAccessibleName(ARTIST_NAME);
    await expect(artist).toHaveAttribute("href", `/artists/${ARTIST}`);
    const raw = byline.getByTestId("credit-byline-unresolved");
    await expect(raw).toHaveText(RAW);
    await expect(raw.locator("xpath=ancestor-or-self::a")).toHaveCount(0);
    await expect(byline).not.toContainText(MODEL);

    await artist.click();
    await expect(page).toHaveURL(new RegExp(`/artists/${ARTIST}`), { timeout: 30_000 });
  });
}
