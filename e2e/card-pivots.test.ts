import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// Pivot filters (2026-10-20): a card's channel or label, a part of its date and a
// person's avatar filter the gallery. A click joins the active filters, replaces a
// value of the same kind, and takes away the one already active; Back undoes it.
// Three sets (two in one channel, two in August 2016) and their sessions, with a
// person on camera in the first; the last session is dated 31 August, so a
// month filter must reach the month's last day.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36);
const ids = {
  label: `e2e-label-pv-${RUN}`,
  ch1: `e2e-channel-pv1-${RUN}`,
  ch2: `e2e-channel-pv2-${RUN}`,
  person: `e2e-person-pv-${RUN}`,
};
const ICG = `E2E-PV-${RUN}`.toUpperCase();
const PERSON = `Pivot Model ${RUN}`;
const sets = [
  { key: "alpha", channel: ids.ch1, date: "2016-08-15" },
  { key: "beta", channel: ids.ch1, date: "2016-09-03" },
  { key: "gamma", channel: ids.ch2, date: "2016-08-31" },
] as const;
const setId = (k: string) => `e2e-set-pv-${k}-${RUN}`;
const sessionId = (k: string) => `e2e-session-pv-${k}-${RUN}`;
const title = (k: string) => `Test Set pivot ${k} ${RUN}`;
const sessionName = (k: string) => `Test Session pivot ${k} ${RUN}`;

test.beforeAll(async () => {
  await db.connect();
  await db.query(`INSERT INTO "Label" (id, name) VALUES ($1, $2)`, [ids.label, `Test Label pivot ${RUN}`]);
  await db.query(`INSERT INTO "Channel" (id, name, "labelId") VALUES ($1, $2, $3), ($4, $5, $3)`, [
    ids.ch1, `Test Channel pivot one ${RUN}`, ids.label, ids.ch2, `Test Channel pivot two ${RUN}`,
  ]);
  await db.query(`INSERT INTO "Person" (id, "icgId") VALUES ($1, $2)`, [ids.person, ICG]);
  await db.query(`INSERT INTO "PersonAlias" (id, "personId", name, "isCommon") VALUES ($1, $2, $3, true)`, [`${ids.person}-a`, ids.person, PERSON]);
  const role = (await db.query<{ id: string }>(
    `SELECT d.id FROM "ContributionRoleDefinition" d JOIN "ContributionRoleGroup" g ON g.id = d."groupId" WHERE g.name <> 'Behind Camera' LIMIT 1`,
  )).rows[0]!.id;
  for (const s of sets) {
    await db.query(`INSERT INTO "Set" (id, type, title, "channelId", "releaseDate", "releaseDatePrecision", "updatedAt") VALUES ($1, 'photo', $2, $3, $4, 'DAY', now())`, [setId(s.key), title(s.key), s.channel, s.date]);
    await db.query(`INSERT INTO "Session" (id, name, date, "datePrecision", "labelId", "updatedAt") VALUES ($1, $2, $3, 'DAY', $4, now())`, [sessionId(s.key), sessionName(s.key), s.date, s.key === "beta" ? null : ids.label]);
    await db.query(`INSERT INTO "SetSession" ("setId", "sessionId", "isPrimary") VALUES ($1, $2, true)`, [setId(s.key), sessionId(s.key)]);
  }
  await db.query(`INSERT INTO "SetParticipant" ("setId", "personId", "roleDefinitionId") VALUES ($1, $2, $3)`, [setId("alpha"), ids.person, role]);
  await db.query(`INSERT INTO "SessionContribution" (id, "sessionId", "personId", "roleDefinitionId") VALUES ($1, $2, $3, $4)`, [`${sessionId("alpha")}-c`, sessionId("alpha"), ids.person, role]);
});

test.afterAll(async () => {
  const setIds = sets.map((s) => setId(s.key));
  const sessionIds = sets.map((s) => sessionId(s.key));
  await db.query(`DELETE FROM "SetParticipant" WHERE "setId" = ANY($1::text[])`, [setIds]);
  await db.query(`DELETE FROM "SessionContribution" WHERE "sessionId" = ANY($1::text[])`, [sessionIds]);
  await db.query(`DELETE FROM "SetSession" WHERE "setId" = ANY($1::text[])`, [setIds]);
  await db.query(`DELETE FROM "Set" WHERE id = ANY($1::text[])`, [setIds]);
  await db.query(`DELETE FROM "Session" WHERE id = ANY($1::text[])`, [sessionIds]);
  await db.query(`DELETE FROM "Channel" WHERE id = ANY($1::text[])`, [[ids.ch1, ids.ch2]]);
  await db.query(`DELETE FROM "Label" WHERE id = $1`, [ids.label]);
  await db.query(`DELETE FROM "PersonAlias" WHERE "personId" = $1`, [ids.person]);
  await db.query(`DELETE FROM "Person" WHERE id = $1`, [ids.person]);
  await db.end();
});

const setCard = (page: Page, key: string) => page.locator(`a[href="/sets/${setId(key)}"]`);
const sessionCard = (page: Page, key: string) => page.locator(`a[href="/sessions/${sessionId(key)}"]`);
async function shownSets(page: Page) {
  await page.waitForLoadState("networkidle");
  return (await page.locator('a[href^="/sets/e2e-set-pv-"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")))).map((h) =>
    h!.replace("/sets/e2e-set-pv-", "").replace(`-${RUN}`, ""),
  ).sort();
}

test.describe("Card pivots on /sets", () => {
  test("channel and date parts refine, replace and come off again; Back undoes a step", async ({ page }) => {
    await page.goto(`/sets?type=all&q=${RUN}`);
    await expect(setCard(page, "alpha")).toBeVisible();
    expect(await shownSets(page)).toEqual(["alpha", "beta", "gamma"]);

    // The channel
    const channel = setCard(page, "alpha").getByRole("button", { name: `Show only Test Channel pivot one ${RUN}` });
    await channel.click();
    await expect(page).toHaveURL(new RegExp(`channel=${ids.ch1}`));
    expect(await shownSets(page)).toEqual(["alpha", "beta"]);
    await expect(setCard(page, "alpha").getByRole("button", { name: `Remove the filter Test Channel pivot one ${RUN}` })).toHaveAttribute("aria-pressed", "true");

    // The month joins it
    await setCard(page, "alpha").getByRole("button", { name: "Sets released in Aug 2016" }).click();
    await expect(page).toHaveURL(/releaseDateFrom=2016-08&releaseDateTo=2016-08/);
    expect(await shownSets(page)).toEqual(["alpha"]);
    await expect(page.getByText("Release Date: 2016-08")).toBeVisible();

    // The year replaces the month; the channel stays
    await setCard(page, "alpha").getByRole("button", { name: "Sets released in 2016" }).click();
    await expect(page).toHaveURL(/releaseDateFrom=2016&releaseDateTo=2016/);
    expect(await shownSets(page)).toEqual(["alpha", "beta"]);

    // Clicked again, the channel comes off
    await setCard(page, "alpha").getByRole("button", { name: `Remove the filter Test Channel pivot one ${RUN}` }).click();
    await expect(page).not.toHaveURL(/channel=/);
    expect(await shownSets(page)).toEqual(["alpha", "beta", "gamma"]);

    // Back: the channel again
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`channel=${ids.ch1}`));
  });

  test("a person's avatar filters to them, with Name (ICG-ID) in the chip; the card still opens the set", async ({ page }) => {
    await page.goto(`/sets?type=all&q=${RUN}`);
    await setCard(page, "alpha").getByRole("button", { name: `Show only ${PERSON} (${ICG})` }).click();
    await expect(page).toHaveURL(new RegExp(`personId=${ids.person}`));
    expect(await shownSets(page)).toEqual(["alpha"]);
    // The person filter is an inline field: it holds the name
    await expect(page.locator(`input[value="${PERSON} (${ICG})"]`)).toBeVisible();

    await setCard(page, "alpha").getByRole("heading", { name: title("alpha") }).click();
    await expect(page).toHaveURL(`/sets/${setId("alpha")}`);
  });
});

test.describe("Card pivots with a finger", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("tapping the date opens the year, month and day to choose from", async ({ page }) => {
    await page.goto(`/sets?type=all&q=${RUN}`);
    await setCard(page, "alpha").getByRole("button", { name: "Filter by date 2016-08-15" }).tap();
    const menu = page.getByRole("dialog");
    await expect(menu.getByRole("button")).toHaveText(["2016", "Aug 2016", "15 Aug 2016"]);
    await menu.getByRole("button", { name: "Aug 2016", exact: true }).tap();
    await expect(page).toHaveURL(/releaseDateFrom=2016-08&releaseDateTo=2016-08/);
  });
});

test.describe("Card pivots on /sessions", () => {
  test("label and month filter sessions — the month reaches its last day", async ({ page }) => {
    await page.goto(`/sessions?q=${encodeURIComponent(`pivot`)}`);
    await sessionCard(page, "alpha").getByRole("button", { name: "Sessions from Aug 2016" }).click();
    await expect(page).toHaveURL(/dateFrom=2016-08&dateTo=2016-08/);
    await expect(sessionCard(page, "alpha")).toBeVisible();
    await expect(sessionCard(page, "gamma")).toBeVisible(); // 31 August
    await expect(sessionCard(page, "beta")).toHaveCount(0);

    await sessionCard(page, "alpha").getByRole("button", { name: `Show only Test Label pivot ${RUN}` }).click();
    await expect(page).toHaveURL(new RegExp(`label=${ids.label}`));
    await expect(sessionCard(page, "gamma")).toBeVisible();

    await sessionCard(page, "alpha").getByRole("button", { name: `Show only ${PERSON} (${ICG})` }).click();
    await expect(page).toHaveURL(new RegExp(`personId=${ids.person}`));
    await expect(sessionCard(page, "gamma")).toHaveCount(0);
    await expect(sessionCard(page, "alpha")).toBeVisible();
  });
});
