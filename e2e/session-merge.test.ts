import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// Session merge (2026-10-18): two sessions with the same unhelpful name, one set
// each, the same person and label. Started from the newer one, the dialog
// suggests the older without typing (with the reasons), finds it by set title
// too, and merges into the older one — where the page then lands.
// Since 2026-10-20 a pick opens the compare page: both sessions in full, the
// older on the left, a person filter, two pinned photos in the loupe. The page
// is also reached from two sessions selected in /sessions.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36);
const NAME = `Test Session Set 1 ${RUN}`; // the same on both
const ids = {
  label: `e2e-label-sm-${RUN}`,
  channel: `e2e-channel-sm-${RUN}`,
  person: `e2e-person-sm-${RUN}`,
  extra: `e2e-person-sm-x-${RUN}`, // on camera in the newer session only
  older: `e2e-session-sm-old-${RUN}`,
  newer: `e2e-session-sm-new-${RUN}`,
  setOld: `e2e-set-sm-old-${RUN}`,
  setNew: `e2e-set-sm-new-${RUN}`,
};
const ICG = `E2E-SM-${RUN}`.toUpperCase();
const titleOld = `Test Set merge spring ${RUN}`;
const titleNew = `Test Set merge autumn ${RUN}`;
const media: string[] = [];

test.beforeAll(async ({ request }) => {
  await db.connect();
  await db.query(`INSERT INTO "Label" (id, name) VALUES ($1, $2)`, [ids.label, `Test Label merge ${RUN}`]);
  await db.query(`INSERT INTO "Channel" (id, name, "labelId") VALUES ($1, $2, $3)`, [ids.channel, `Test Channel merge ${RUN}`, ids.label]);
  await db.query(`INSERT INTO "Person" (id, "icgId") VALUES ($1, $2)`, [ids.person, ICG]);
  await db.query(`INSERT INTO "PersonAlias" (id, "personId", name, "isCommon") VALUES ($1, $2, $3, true)`, [`${ids.person}-a`, ids.person, `Merge Model ${RUN}`]);
  await db.query(`INSERT INTO "Person" (id, "icgId") VALUES ($1, $2)`, [ids.extra, `${ICG}-X`]);
  await db.query(`INSERT INTO "PersonAlias" (id, "personId", name, "isCommon") VALUES ($1, $2, $3, true)`, [`${ids.extra}-a`, ids.extra, `Merge Extra ${RUN}`]);
  const role = (await db.query<{ id: string }>(
    `SELECT d.id FROM "ContributionRoleDefinition" d JOIN "ContributionRoleGroup" g ON g.id = d."groupId" WHERE g.name <> 'Behind Camera' LIMIT 1`,
  )).rows[0]!.id;
  for (const [session, set, title, date] of [
    [ids.older, ids.setOld, titleOld, "2004-03-01"],
    [ids.newer, ids.setNew, titleNew, "2004-09-01"],
  ] as const) {
    await db.query(`INSERT INTO "Session" (id, name, date, "datePrecision", "updatedAt") VALUES ($1, $2, $3, 'DAY', now())`, [session, NAME, date]);
    await db.query(`INSERT INTO "Set" (id, type, title, "channelId", "releaseDate", "releaseDatePrecision", "updatedAt") VALUES ($1, 'photo', $2, $3, $4, 'DAY', now())`, [set, title, ids.channel, date]);
    await db.query(`INSERT INTO "SetSession" ("setId", "sessionId", "isPrimary") VALUES ($1, $2, true)`, [set, session]);
    await db.query(`INSERT INTO "SessionContribution" (id, "sessionId", "personId", "roleDefinitionId") VALUES ($1, $2, $3, $4)`, [`${session}-c`, session, ids.person, role]);
  }
  await db.query(`INSERT INTO "SessionContribution" (id, "sessionId", "personId", "roleDefinitionId") VALUES ($1, $2, $3, $4)`, [`${ids.newer}-x`, ids.newer, ids.extra, role]);

  // One photo in each set, so there is something to compare
  const photo = readFileSync(path.join(__dirname, "fixtures/test-photo.jpg"));
  for (const [sessionId, setId, i] of [[ids.older, ids.setOld, 0], [ids.newer, ids.setNew, 1]] as const) {
    const buffer = Buffer.concat([photo, Buffer.from(`${RUN}-${i}`)]);
    const res = await request.post("/api/media/upload", {
      multipart: { file: { name: `merge-${RUN}-${i}.jpg`, mimeType: "image/jpeg", buffer }, sessionId, setId },
    });
    expect(res.status()).toBe(201);
    media.push((await res.json()).mediaItem.id);
  }
});

test.afterAll(async () => {
  const sessions = [ids.older, ids.newer];
  const sets = [ids.setOld, ids.setNew];
  await db.query(`DELETE FROM "SetMediaItem" WHERE "mediaItemId" = ANY($1::text[])`, [media]);
  await db.query(`DELETE FROM "MediaItem" WHERE id = ANY($1::text[])`, [media]);
  await db.query(`DELETE FROM "SetSession" WHERE "sessionId" = ANY($1::text[]) OR "setId" = ANY($2::text[])`, [sessions, sets]);
  await db.query(`DELETE FROM "SessionContribution" WHERE "sessionId" = ANY($1::text[])`, [sessions]);
  await db.query(`DELETE FROM "SetParticipant" WHERE "setId" = ANY($1::text[])`, [sets]);
  await db.query(`DELETE FROM "Set" WHERE id = ANY($1::text[])`, [sets]);
  await db.query(`DELETE FROM "Session" WHERE id = ANY($1::text[])`, [sessions]);
  await db.query(`DELETE FROM "Channel" WHERE id = $1`, [ids.channel]);
  await db.query(`DELETE FROM "Label" WHERE id = $1`, [ids.label]);
  await db.query(`DELETE FROM "PersonAlias" WHERE "personId" = ANY($1::text[])`, [[ids.person, ids.extra]]);
  await db.query(`DELETE FROM "Person" WHERE id = ANY($1::text[])`, [[ids.person, ids.extra]]);
  await db.end();
});

test.describe.serial("Session merge", () => {
  test("in /sessions, two selected sessions open the compare page", async ({ page }) => {
    await page.goto(`/sessions?q=${encodeURIComponent(NAME)}`);
    await page.getByRole("button", { name: "Select", exact: true }).click();
    const boxes = page.getByRole("button", { name: `Select ${NAME}`, exact: true });
    await expect(boxes).toHaveCount(2);
    await boxes.first().click();
    const compare = page.getByRole("button", { name: "Compare & merge" });
    await expect(compare).toBeDisabled(); // one is not a pair
    await page.getByRole("button", { name: `Select ${NAME}`, exact: true }).first().click();
    await expect(compare).toBeEnabled();
    await compare.click();
    await expect(page).toHaveURL(/\/sessions\/merge\?/, { timeout: 20_000 });
    await expect(page.locator('[data-merge-role="survivor"]')).toContainText(titleOld);
    await expect(page.locator('[data-merge-role="absorbed"]')).toContainText(titleNew);
  });

  test("started from the newer session, the older one is suggested, compared and stays", async ({ page }) => {
    await page.goto(`/sessions/${ids.newer}`);
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: /Merge with/ }).click();
    const dialog = page.getByRole("dialog");

    // Suggested without typing, with why
    const suggestion = dialog.getByRole("option").filter({ hasText: titleOld });
    await expect(suggestion).toBeVisible({ timeout: 20_000 });
    await expect(suggestion.getByText(`Same person: Merge Model ${RUN} (${ICG})`)).toBeVisible();
    await expect(suggestion.getByText(`Same label: Test Label merge ${RUN}`)).toBeVisible();

    // Found by its set title as well — and picked, it opens the compare page
    await dialog.getByRole("combobox", { name: "Search sessions" }).fill(`spring ${RUN}`);
    await expect(dialog.getByText("Matches")).toBeVisible();
    const match = dialog.getByRole("option").filter({ hasText: titleOld });
    await expect(match).toHaveCount(1);
    await match.click();
    await expect(page).toHaveURL(new RegExp(`/sessions/merge\\?a=${ids.newer}&b=${ids.older}`), { timeout: 20_000 });

    // The older one stays and is on the left, whichever side it was started from
    const survivor = page.locator('[data-merge-role="survivor"]');
    const absorbed = page.locator('[data-merge-role="absorbed"]');
    await expect(survivor).toContainText(titleOld);
    await expect(survivor.getByText("Stays")).toBeVisible();
    await expect(absorbed).toContainText(titleNew);
    await expect(survivor.getByRole("button", { name: "Gallery image" })).toHaveCount(1);
    await expect(absorbed.getByRole("button", { name: "Gallery image" })).toHaveCount(1);
    await expect(page.getByText("Afterwards: 2 photos · 2 people · 2 sets")).toBeVisible();

    // The person filter: someone only in the newer session
    await page.getByRole("button", { name: new RegExp(`Merge Extra ${RUN}`) }).click();
    await expect(survivor.getByText("No photo here shows this person.")).toBeVisible();
    await expect(absorbed.getByRole("button", { name: "Gallery image" })).toHaveCount(1);
    await page.getByRole("button", { name: "Show everyone" }).click();
    await expect(survivor.getByRole("button", { name: "Gallery image" })).toHaveCount(1);

    // One photo pinned on each side → the loupe, two images; Esc closes it
    const compare = page.getByRole("button", { name: "Compare", exact: true });
    await expect(compare).toBeDisabled();
    await survivor.getByRole("button", { name: "Gallery image" }).hover();
    await survivor.getByRole("button", { name: "Pin to compare" }).click();
    await absorbed.getByRole("button", { name: "Gallery image" }).hover();
    await absorbed.getByRole("button", { name: "Pin to compare" }).click();
    await compare.click();
    const loupe = page.getByRole("dialog", { name: "Compare two photos" });
    await expect(loupe.locator("[data-loupe-side] img")).toHaveCount(2);
    await page.keyboard.press("Escape");
    await expect(loupe).toHaveCount(0);

    // Merge, confirmed once more
    await page.getByRole("button", { name: "Merge sessions" }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toContainText("can't be undone");
    await confirm.getByRole("button", { name: "Merge sessions" }).click();
    await expect(page).toHaveURL(new RegExp(`/sessions/${ids.older}$`), { timeout: 20_000 });
    expect((await db.query(`SELECT 1 FROM "Session" WHERE id = $1`, [ids.newer])).rowCount).toBe(0);
    const links = await db.query<{ setId: string }>(`SELECT "setId" FROM "SetSession" WHERE "sessionId" = $1 ORDER BY "setId"`, [ids.older]);
    expect(links.rows.map((r) => r.setId).sort()).toEqual([ids.setNew, ids.setOld].sort());
    const moved = await db.query(`SELECT 1 FROM "MediaItem" WHERE id = ANY($1::text[]) AND "sessionId" = $2`, [media, ids.older]);
    expect(moved.rowCount).toBe(2);
  });
});
