import "dotenv/config";
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// The browse trail (2026-11-13): the list you came from travels with you.
// A set's cast → a person → walk the cast with ← →; from that person's career
// into a set → the crumb row climbs back up; a channel's Sets tab → walk its
// sets. Everything is created here (own channel, session, sets, people) and
// removed afterwards.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const CHANNEL = `Trail Channel ${RUN}`;
const ids = {
  channel: `e2e-ch-trail-${RUN}`,
  session: `e2e-session-trail-${RUN}`,
  s1: `e2e-set-trail1-${RUN}`,
  s2: `e2e-set-trail2-${RUN}`,
  people: ["a", "b", "c"].map((k) => `e2e-person-trail-${k}-${RUN}`),
};
const NAMES = ["Anna", "Bea", "Cleo"].map((n) => `${n} ${RUN}`);
const SET1 = `Trail Set One ${RUN}`;
const SET2 = `Trail Set Two ${RUN}`;

test.beforeAll(async () => {
  await db.connect();
  const role = (await db.query<{ id: string }>(
    `SELECT d.id FROM "ContributionRoleDefinition" d JOIN "ContributionRoleGroup" g ON g.id = d."groupId"
     WHERE g.kind = 'ON_CAMERA' AND d.presence = 'LEAD' LIMIT 1`,
  )).rows[0]!.id;
  await db.query(`INSERT INTO "Channel" (id, name) VALUES ($1, $2)`, [ids.channel, CHANNEL]);
  await db.query(`INSERT INTO "Session" (id, name, "updatedAt") VALUES ($1, $2, now())`, [ids.session, `Trail Session ${RUN}`]);
  for (const [setId, title, date] of [[ids.s1, SET1, "2020-01-01"], [ids.s2, SET2, "2019-01-01"]]) {
    await db.query(
      `INSERT INTO "Set" (id, type, title, "channelId", "releaseDate", "releaseDatePrecision", "updatedAt")
       VALUES ($1, 'photo', $2, $3, $4, 'DAY', now())`,
      [setId, title, ids.channel, date],
    );
    await db.query(`INSERT INTO "SetSession" ("setId", "sessionId", "isPrimary") VALUES ($1, $2, true)`, [setId, ids.session]);
  }
  for (const [i, personId] of ids.people.entries()) {
    await db.query(`INSERT INTO "Person" (id, "icgId") VALUES ($1, $2)`, [personId, `E2ETR${i}${RUN}`.toUpperCase()]);
    await db.query(`INSERT INTO "PersonAlias" (id, "personId", name, "isCommon") VALUES ($1, $2, $3, true)`, [`${personId}-a`, personId, NAMES[i]]);
    await db.query(`INSERT INTO "SessionContribution" (id, "sessionId", "personId", "roleDefinitionId") VALUES ($1, $2, $3, $4)`, [`${personId}-c`, ids.session, personId, role]);
    for (const setId of [ids.s1, ids.s2]) {
      await db.query(`INSERT INTO "SetParticipant" ("setId", "personId", "roleDefinitionId") VALUES ($1, $2, $3)`, [setId, personId, role]);
    }
  }
});

test.afterAll(async () => {
  await db.query(`DELETE FROM "SetParticipant" WHERE "setId" = ANY($1)`, [[ids.s1, ids.s2]]);
  await db.query(`DELETE FROM "SessionContribution" WHERE "sessionId" = $1`, [ids.session]);
  await db.query(`DELETE FROM "SetSession" WHERE "sessionId" = $1`, [ids.session]);
  await db.query(`DELETE FROM "Set" WHERE id = ANY($1)`, [[ids.s1, ids.s2]]);
  await db.query(`DELETE FROM "Session" WHERE id = $1`, [ids.session]);
  await db.query(`DELETE FROM "Channel" WHERE id = $1`, [ids.channel]);
  await db.query(`DELETE FROM "PersonAlias" WHERE "personId" = ANY($1)`, [ids.people]);
  await db.query(`DELETE FROM "PersonCurrentState" WHERE "personId" = ANY($1)`, [ids.people]).catch(() => undefined);
  await db.query(`DELETE FROM "Person" WHERE id = ANY($1)`, [ids.people]);
  await db.end();
});

test("a set's cast becomes the track: Back names it, ← → walk it, Esc returns", async ({ page }) => {
  test.slow();
  await page.goto(`/sets/${ids.s1}`);
  const cast = page.getByRole("link", { name: new RegExp(NAMES[1]) }).first();
  await cast.click();
  await expect(page).toHaveURL(new RegExp(`/people/${ids.people[1]}\\?via=`), { timeout: 30_000 });

  const back = page.getByTestId("trail-back");
  await expect(back).toContainText(`Back to ${SET1} · Cast`);
  const nav = page.getByTestId("trail-nav");
  await expect(nav).toContainText("2 / 3");

  // → goes to the next of the cast, on the same track
  await nav.getByRole("link", { name: `Next: ${NAMES[2]}` }).click();
  await expect(page).toHaveURL(new RegExp(`/people/${ids.people[2]}\\?via=`), { timeout: 20_000 });
  await expect(page.getByTestId("trail-nav")).toContainText("3 / 3");

  // ← with the keyboard
  await page.locator("body").press("ArrowLeft");
  await expect(page).toHaveURL(new RegExp(`/people/${ids.people[1]}\\?via=`), { timeout: 20_000 });

  // A reload keeps the track
  await page.reload();
  await expect(page.getByTestId("trail-nav")).toContainText("2 / 3");

  // Esc goes back to the set
  await page.locator("body").press("Escape");
  await expect(page).toHaveURL(new RegExp(`/sets/${ids.s1}$`), { timeout: 20_000 });
});

test("one level deeper the crumb row climbs back up", async ({ page }) => {
  test.slow();
  await page.goto(`/sets/${ids.s1}`);
  await page.getByRole("link", { name: new RegExp(NAMES[0]) }).first().click();
  await expect(page.getByTestId("trail-back")).toContainText(`Back to ${SET1} · Cast`, { timeout: 30_000 });
  const personUrl = page.url();

  // Into her career, then to the other set
  await page.getByRole("tab", { name: /Career/ }).click();
  await page.getByRole("link", { name: new RegExp(SET2) }).first().click();
  await expect(page).toHaveURL(new RegExp(`/sets/${ids.s2}\\?via=`), { timeout: 30_000 });
  await expect(page.getByTestId("trail-back")).toContainText(`Back to ${NAMES[0]} · Career`);
  const crumbs = page.getByTestId("trail-crumbs");
  await expect(crumbs.getByRole("link")).toHaveText([`${SET1} · Cast`, `${NAMES[0]} · Career`]);

  // Back on the person, her own track (the cast) is still there
  await page.getByTestId("trail-back").click();
  await expect(page).toHaveURL(new RegExp(`/people/${ids.people[0]}\\?.*via=`), { timeout: 20_000 });
  expect(new URL(page.url()).searchParams.get("via")).toBe(new URL(personUrl).searchParams.get("via"));
  await expect(page.getByTestId("trail-nav")).toContainText("1 / 3");
});

test("a channel's Sets tab is walkable; a plain URL keeps the gallery back link", async ({ page }) => {
  test.slow();
  await page.goto(`/channels/${ids.channel}?tab=sets`);
  await page.getByRole("link", { name: new RegExp(SET1) }).first().click();
  await expect(page).toHaveURL(new RegExp(`/sets/${ids.s1}\\?via=`), { timeout: 30_000 });
  await expect(page.getByTestId("trail-back")).toContainText(`Back to ${CHANNEL} · Sets`);
  await expect(page.getByTestId("trail-nav")).toContainText("1 / 2");

  await page.goto(`/people/${ids.people[0]}`);
  await expect(page.getByTestId("trail-back")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Back to People" })).toBeVisible();
});

test("the Channels gallery is a root: Back keeps its filter, the crumb row starts there", async ({ page }) => {
  test.slow();
  const gallery = `/channels?q=${encodeURIComponent(CHANNEL)}`;
  await page.goto(gallery);
  await page.getByRole("link", { name: new RegExp(CHANNEL) }).first().click();
  await expect(page).toHaveURL(new RegExp(`/channels/${ids.channel}\\?via=`), { timeout: 30_000 });
  await expect(page.getByTestId("trail-back")).toContainText("Back to Channels");
  await expect(page.getByTestId("trail-nav")).toContainText("1 / 1");

  // Into the channel's Sets tab and a set: the crumbs start at the gallery
  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: /Sets/ }).click();
  await expect(page).toHaveURL(/tab=sets.*via=/, { timeout: 20_000 });
  await expect(page.getByTestId("trail-back")).toContainText("Back to Channels");
  await page.getByRole("link", { name: new RegExp(SET2) }).first().click();
  await expect(page).toHaveURL(new RegExp(`/sets/${ids.s2}\\?via=`), { timeout: 30_000 });
  await expect(page.getByTestId("trail-crumbs").getByRole("link")).toHaveText(["Channels", `${CHANNEL} · Sets`]);

  // The first crumb returns to the filtered gallery
  await page.getByTestId("trail-crumbs").getByRole("link", { name: "Channels" }).click();
  await expect(page).toHaveURL(new RegExp(`/channels\\?q=`), { timeout: 20_000 });
});
