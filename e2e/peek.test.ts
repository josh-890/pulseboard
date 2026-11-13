import "dotenv/config";
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// Peek (2026-11-13): look through a list in a side panel without leaving it.
// Own channel, session, 2 sets and 3 people; removed afterwards.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const ids = {
  channel: `e2e-ch-peek-${RUN}`,
  session: `e2e-session-peek-${RUN}`,
  s1: `e2e-set-peek1-${RUN}`,
  s2: `e2e-set-peek2-${RUN}`,
  people: ["a", "b", "c"].map((k) => `e2e-person-peek-${k}-${RUN}`),
};
const NAMES = ["Pia", "Quin", "Rosa"].map((n) => `${n} ${RUN}`);
const ICGS = [0, 1, 2].map((i) => `E2EPK${i}${RUN}`.toUpperCase());
const SET1 = `Peek Set One ${RUN}`;
const SET2 = `Peek Set Two ${RUN}`;

test.beforeAll(async () => {
  await db.connect();
  const role = (await db.query<{ id: string }>(
    `SELECT d.id FROM "ContributionRoleDefinition" d JOIN "ContributionRoleGroup" g ON g.id = d."groupId"
     WHERE g.kind = 'ON_CAMERA' AND d.presence = 'LEAD' LIMIT 1`,
  )).rows[0]!.id;
  await db.query(`INSERT INTO "Channel" (id, name) VALUES ($1, $2)`, [ids.channel, `Peek Channel ${RUN}`]);
  await db.query(`INSERT INTO "Session" (id, name, "updatedAt") VALUES ($1, $2, now())`, [ids.session, `Peek Session ${RUN}`]);
  for (const [setId, title, date] of [[ids.s1, SET1, "2021-05-01"], [ids.s2, SET2, "2018-01-01"]]) {
    await db.query(
      `INSERT INTO "Set" (id, type, title, "channelId", "releaseDate", "releaseDatePrecision", "updatedAt")
       VALUES ($1, 'photo', $2, $3, $4, 'DAY', now())`,
      [setId, title, ids.channel, date],
    );
    await db.query(`INSERT INTO "SetSession" ("setId", "sessionId", "isPrimary") VALUES ($1, $2, true)`, [setId, ids.session]);
  }
  for (const [i, personId] of ids.people.entries()) {
    await db.query(`INSERT INTO "Person" (id, "icgId", nationality) VALUES ($1, $2, 'UKR')`, [personId, ICGS[i]]);
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

test("the eye on a cast member peeks; ← → step the cast; Open page goes there on the track", async ({ page }) => {
  test.slow();
  await page.goto(`/sets/${ids.s1}`);
  const cast = page.getByRole("link", { name: new RegExp(NAMES[1]) }).first();
  await expect(cast).toBeVisible({ timeout: 30_000 });
  await cast.hover();
  await page.getByTestId("peek-button").click();

  const peek = page.getByTestId("peek");
  await expect(peek).toBeVisible();
  await expect(peek.getByRole("heading", { name: `${NAMES[1]} (${ICGS[1]})` })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("peek-position")).toHaveText("2 / 3");
  await expect(peek).toContainText("UKR");
  await expect(peek).toContainText("Sets · 2");
  await expect(peek).toContainText(SET1);

  await page.keyboard.press("ArrowRight");
  await expect(peek.getByRole("heading", { name: `${NAMES[2]} (${ICGS[2]})` })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("peek-position")).toHaveText("3 / 3");
  await expect(page).toHaveURL(new RegExp(`/sets/${ids.s1}$`)); // still on the set

  await page.getByTestId("peek-open").click();
  await expect(page).toHaveURL(new RegExp(`/people/${ids.people[2]}\\?via=`), { timeout: 30_000 });
  await expect(page.getByTestId("trail-nav")).toContainText("3 / 3");
});

test("Space on a focused set peeks at it; Esc closes and stays", async ({ page }) => {
  test.slow();
  await page.goto(`/channels/${ids.channel}?tab=sets`);
  const link = page.getByRole("link", { name: new RegExp(SET2) }).first();
  await expect(link).toBeVisible({ timeout: 30_000 });
  await link.focus();
  await page.keyboard.press(" ");
  const peek = page.getByTestId("peek");
  await expect(peek.getByRole("heading", { name: SET2 })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("peek-position")).toHaveText("2 / 2");
  await expect(peek).toContainText("Cast · 3");
  await expect(peek).toContainText(NAMES[0]);

  await page.keyboard.press("Escape");
  await expect(peek).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/channels/${ids.channel}\\?tab=sets$`));
});
