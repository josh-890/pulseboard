import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// The tag workbench (ADR-0042, S2): a base posture replaces, Shift adds and both
// refinements unfold; the state matrix names and creates a combination; Enter
// writes and carries the pinned paths over as a proposal, → moves on without
// writing; the set gallery links in. Own fixture set; never the user's photos.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const SESSION = `e2e-session-compose-${RUN}`;
const SET = `e2e-set-compose-${RUN}`;
const m = (k: number) => `${SESSION}-${k}`;
const COMBO = "torn-skirt";
let comboExisted = true;

test.describe.configure({ mode: "serial", timeout: 60_000 });

test.beforeAll(async () => {
  await db.connect();
  comboExisted = (await db.query(`SELECT 1 FROM tag_definition WHERE slug = $1`, [COMBO])).rowCount! > 0;
  await db.query(`INSERT INTO "Session" (id, name, "updatedAt") VALUES ($1, $2, now())`, [SESSION, `Compose ${RUN}`]);
  await db.query(`INSERT INTO "Set" (id, type, title, "updatedAt") VALUES ($1, 'photo', $2, now())`, [SET, `Compose ${RUN}`]);
  await db.query(`INSERT INTO "SetSession" ("setId", "sessionId", "isPrimary") VALUES ($1, $2, true)`, [SET, SESSION]);
  for (const k of [1, 2, 3]) {
    await db.query(
      `INSERT INTO "MediaItem" (id, "sessionId", "mediaType", filename, "mimeType", size, "originalWidth", "originalHeight", "fileRef", "updatedAt")
       VALUES ($1, $2, 'PHOTO', $3, 'image/jpeg', 1, 600, 900, 'e2e/none.jpg', now())`,
      [m(k), SESSION, `${m(k)}.jpg`],
    );
    await db.query(`INSERT INTO "SetMediaItem" ("setId", "mediaItemId", "sortOrder") VALUES ($1, $2, $3)`, [SET, m(k), k]);
  }
});

test.afterAll(async () => {
  await db.query(`DELETE FROM media_item_tag WHERE "mediaItemId" LIKE $1`, [`${SESSION}-%`]);
  await db.query(`DELETE FROM "SetMediaItem" WHERE "setId" = $1`, [SET]);
  await db.query(`DELETE FROM "MediaItem" WHERE "sessionId" = $1`, [SESSION]);
  await db.query(`DELETE FROM "SetSession" WHERE "setId" = $1`, [SET]);
  await db.query(`DELETE FROM "Set" WHERE id = $1`, [SET]);
  await db.query(`DELETE FROM "Session" WHERE id = $1`, [SESSION]);
  if (!comboExisted) await db.query(`DELETE FROM tag_definition WHERE slug = $1 AND NOT EXISTS (SELECT 1 FROM media_item_tag mt WHERE mt."tagDefinitionId" = tag_definition.id)`, [COMBO]);
  await db.end();
});

const tile = (page: Page, name: string) => page.locator(`[data-testid="composer-tile"][data-tag="${name}"]`);
const tagsOf = async (id: string) =>
  (
    await db.query<{ name: string }>(
      `SELECT t.name FROM media_item_tag mt JOIN tag_definition t ON t.id = mt."tagDefinitionId" WHERE mt."mediaItemId" = $1 ORDER BY t.name`,
      [id],
    )
  ).rows.map((r) => r.name);

test.beforeEach(async ({ page }) => {
  // Default pins (Clothing + Camera), whatever an earlier visit left behind
  await page.addInitScript(() => window.localStorage.removeItem("composer.pinned"));
});

test("the set gallery links into the workbench", async ({ page }) => {
  await page.goto(`/sets/${SET}`);
  await page.getByTestId("compose-entry").first().click();
  await expect(page).toHaveURL(new RegExp(`/sets/${SET}/compose`));
  await expect(page.getByTestId("composer-position")).toHaveText("1 / 3");
});

test("a base posture replaces; Shift adds; both refinements unfold; changing the base drops orphans", async ({ page }) => {
  await page.goto(`/sets/${SET}/compose`);
  await tile(page, "standing").click();
  await tile(page, "kneeling").click();
  await expect(tile(page, "standing")).toHaveAttribute("data-state", "off");
  await tile(page, "standing").click({ modifiers: ["Shift"] });
  await expect(page.locator('[data-testid="composer-refinement"] [data-base]')).toHaveCount(2);
  await tile(page, "contrapposto").click();
  await tile(page, "standing").click(); // standing off: contrapposto goes with it
  await expect(page.getByTestId("composer-diff")).not.toContainText("contrapposto");
  await expect(page.getByTestId("composer-diff")).toContainText("+ kneeling");
});

test("the matrix creates a combination that implies its garment and the generic state", async ({ page }) => {
  await page.goto(`/sets/${SET}/compose`);
  await page.getByTestId("composer-path-Clothing").click();
  await tile(page, "skirt").click();
  await page.locator(`[data-testid="composer-matrix-chip"][data-tag="${COMBO}"]`).click();
  await expect(page.locator(`[data-testid="composer-matrix-chip"][data-tag="${COMBO}"]`)).toHaveAttribute("aria-pressed", "true");
  await expect(tile(page, "torn-clothes")).toHaveAttribute("data-state", "implied");
  const row = await db.query(
    `SELECT p.name AS parent FROM tag_definition t JOIN tag_definition p ON p.id = t."parentId" WHERE t.slug = $1`,
    [COMBO],
  );
  expect(row.rows[0]?.parent).toBe("skirt");
});

test("Enter writes and carries the pinned paths over; → moves on without writing", async ({ page }) => {
  await page.goto(`/sets/${SET}/compose`);
  await tile(page, "sitting").click();
  await page.getByTestId("composer-path-Camera").click();
  await tile(page, "full-body").click();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("composer-position")).toHaveText("2 / 3");
  await expect.poll(() => tagsOf(m(1))).toEqual(["full-body", "sitting"]);

  // Photo 2: Camera is pinned — full-body is offered; Figure is not carried
  await expect(tile(page, "full-body")).toHaveAttribute("data-state", "proposed");
  await page.getByTestId("composer-path-Figure").click();
  await expect(tile(page, "sitting")).toHaveAttribute("data-state", "off");

  // → leaves photo 2 untouched
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("composer-position")).toHaveText("3 / 3");
  expect(await tagsOf(m(2))).toEqual([]);

  // Enter on photo 3 accepts the proposal
  await page.keyboard.press("Enter");
  await expect.poll(() => tagsOf(m(3))).toEqual(["full-body"]);
});

test("leaving a photo with unwritten changes asks once; the same move again discards, Enter writes", async ({ page }) => {
  await page.goto(`/sets/${SET}/compose?photo=${m(2)}`);
  await expect(page.getByTestId("composer-position")).toHaveText("2 / 3");
  await tile(page, "lying").click();

  // Skip warns and stays
  await page.getByTestId("composer-skip").click();
  await expect(page.getByTestId("composer-unsaved")).toContainText("+ lying");
  await expect(page.getByTestId("composer-position")).toHaveText("2 / 3");

  // The same move again discards
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("composer-position")).toHaveText("3 / 3");
  expect(await tagsOf(m(2))).toEqual([]);

  // Back to 2, change, try to leave, then Enter writes and goes where we were heading
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("composer-position")).toHaveText("2 / 3");
  await tile(page, "lying").click();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("composer-unsaved")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("composer-position")).toHaveText("1 / 3");
  await expect.poll(() => tagsOf(m(2))).toContain("lying");

  // An untouched carried-over offer is no unsaved work: → just moves on
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("composer-unsaved")).toHaveCount(0);
});
