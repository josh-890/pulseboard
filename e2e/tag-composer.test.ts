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
  await db.query(`DELETE FROM tag_example WHERE "mediaItemId" LIKE $1`, [`${SESSION}-%`]);
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

test.describe("many photos at once (S3)", () => {
  test.beforeAll(async () => {
    await db.query(`DELETE FROM media_item_tag WHERE "mediaItemId" LIKE $1`, [`${SESSION}-%`]);
    // photo 1 standing, photo 2 kneeling, photo 3 nothing
    await db.query(
      `INSERT INTO media_item_tag ("mediaItemId", "tagDefinitionId") SELECT $1, id FROM tag_definition WHERE slug = 'standing'`,
      [m(1)],
    );
    await db.query(
      `INSERT INTO media_item_tag ("mediaItemId", "tagDefinitionId") SELECT $1, id FROM tag_definition WHERE slug = 'kneeling'`,
      [m(2)],
    );
  });

  test("a selection counts n/N and one composition lands on all of them", async ({ page }) => {
    await page.goto(`/sets/${SET}/compose?photo=${m(1)}`);
    await page.getByTestId("composer-strip-photo").nth(2).click({ modifiers: ["Shift"] });
    await expect(page.getByTestId("composer-selection-banner")).toContainText("3 photos selected");
    await expect(tile(page, "standing")).toHaveAttribute("data-state", "partial");
    await expect(tile(page, "standing").getByTestId("composer-tile-count")).toHaveText("1/3");

    await tile(page, "sitting").click(); // a base posture: the others present are marked for removal
    await expect(page.getByTestId("composer-composition")).toContainText("+ sitting");
    await expect(page.getByTestId("composer-composition")).toContainText("− standing");
    await page.keyboard.press("Enter");
    for (const k of [1, 2, 3]) await expect.poll(() => tagsOf(m(k))).toEqual(["sitting"]);
    await expect(tile(page, "sitting")).toHaveAttribute("data-state", "on");
  });

  test("the brush paints over the filmstrip; Alt erases", async ({ page }) => {
    await page.goto(`/sets/${SET}/compose?photo=${m(1)}`);
    await page.getByTestId("composer-paint-toggle").click();
    await page.getByTestId("composer-path-Camera").click();
    await tile(page, "portrait").click();
    const strip = page.getByTestId("composer-strip-photo");
    const a = (await strip.nth(0).boundingBox())!;
    const c = (await strip.nth(2).boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + 20);
    await page.mouse.down();
    await page.mouse.move(c.x + c.width / 2, c.y + 20, { steps: 8 });
    await page.mouse.up();
    for (const k of [1, 2, 3]) await expect.poll(() => tagsOf(m(k))).toContain("portrait");

    const b = (await strip.nth(1).boundingBox())!;
    await page.keyboard.down("Alt");
    await page.mouse.move(b.x + b.width / 2, b.y + 20);
    await page.mouse.down();
    await page.mouse.up();
    await page.keyboard.up("Alt");
    await expect.poll(() => tagsOf(m(2))).not.toContain("portrait");
    expect(await tagsOf(m(1))).toContain("portrait");
  });

  test("pass mode: a key per photo writes the section's tag and moves on", async ({ page }) => {
    await page.goto(`/sets/${SET}/compose?photo=${m(1)}`);
    await page.getByTestId("composer-pass-toggle").click();
    await expect(page.getByTestId("composer-pass")).toBeVisible();
    // Base posture: 1 standing · 2 sitting · 3 kneeling
    await page.keyboard.press("3");
    await expect(page.getByTestId("composer-position")).toHaveText("2 / 3");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("composer-position")).toHaveText("3 / 3");
    await page.keyboard.press("0");
    await expect.poll(() => tagsOf(m(1))).toEqual(["kneeling", "portrait"]);
    expect(await tagsOf(m(2))).toEqual(["sitting"]);
    await expect.poll(() => tagsOf(m(3))).toEqual(["portrait"]);
  });
});

test.describe("examples and the tag card (S4)", () => {
  test.beforeAll(async () => {
    await db.query(`DELETE FROM tag_example WHERE tag_example."tagId" = (SELECT id FROM tag_definition WHERE slug = 'seiza') AND "mediaItemId" LIKE $1`, [`${SESSION}-%`]);
  });

  test("the card shows the definition and what not to confuse it with; the photo on screen becomes the tile", async ({ page }) => {
    const had = await db.query(`SELECT count(*)::int n FROM tag_example e JOIN tag_definition t ON t.id = e."tagId" WHERE t.slug = 'seiza'`);
    test.skip(had.rows[0].n >= 5, "seiza already has five examples on this database");
    await page.goto(`/sets/${SET}/compose?photo=${m(2)}`);
    // seiza is a refinement of sitting — make sure sitting is held (earlier tests may have set it)
    if ((await tile(page, "sitting").getAttribute("data-state")) !== "on") await tile(page, "sitting").click();
    const wrap = tile(page, "seiza").locator("..");
    await wrap.hover();
    await wrap.getByTestId("tag-card-open").click();
    const card = page.getByTestId("tag-card");
    await expect(card).toContainText("Knees on the floor");
    await expect(card.getByTestId("tag-card-confusables")).toContainText("kneeling");

    await card.getByTestId("tag-card-use-photo").click();
    // Draw a box around the subject; the rule makes the crop
    await expect(page.getByTestId("example-crop-save")).toBeDisabled();
    const area = (await page.getByTestId("example-crop-box").boundingBox())!;
    await page.mouse.move(area.x + area.width * 0.3, area.y + area.height * 0.1);
    await page.mouse.down();
    await page.mouse.move(area.x + area.width * 0.7, area.y + area.height * 0.9, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByTestId("example-subject-box")).toBeVisible();
    await page.getByTestId("example-crop-save").click();
    await expect.poll(async () =>
      (await db.query(`SELECT count(*)::int n FROM tag_example e JOIN tag_definition t ON t.id = e."tagId" WHERE t.slug = 'seiza' AND e."mediaItemId" = $1`, [m(2)])).rows[0].n,
    ).toBe(1);
    if (had.rows[0].n === 0) await expect(tile(page, "seiza")).toHaveAttribute("data-visual", "true");
    // the box is kept, and the crop follows the Figure rule: the subject fills 85 % of the tile's height
    const ex = await db.query(
      `SELECT "boxH", "cropH" FROM tag_example e JOIN tag_definition t ON t.id = e."tagId" WHERE t.slug = 'seiza' AND e."mediaItemId" = $1`,
      [m(2)],
    );
    expect(ex.rows[0].boxH / ex.rows[0].cropH).toBeCloseTo(0.85, 2);
  });

  test("the Camera path draws pictograms", async ({ page }) => {
    await page.goto(`/sets/${SET}/compose`);
    await page.getByTestId("composer-path-Camera").click();
    await expect(tile(page, "from-behind").getByTestId("camera-pictogram")).toBeVisible();
    await expect(tile(page, "full-body")).toHaveAttribute("data-visual", "true");
  });
});

test.describe("the set as its photos are tagged (S5)", () => {
  test.beforeAll(async () => {
    await db.query(`DELETE FROM media_item_tag WHERE "mediaItemId" LIKE $1`, [`${SESSION}-%`]);
    for (const [k, slugs] of [[1, ["standing", "high-heels"]], [2, ["standing"]]] as const)
      for (const slug of slugs)
        await db.query(`INSERT INTO media_item_tag ("mediaItemId", "tagDefinitionId") SELECT $1, id FROM tag_definition WHERE slug = $2`, [m(k), slug]);
  });

  test("the set page sums up the Composer tags; a tag filters the gallery", async ({ page, context }) => {
    await context.clearCookies({ name: "pulseboard-intensity-panel" });
    await page.goto(`/sets/${SET}`);
    const card = page.getByTestId("composer-summary");
    await expect(card).toContainText("2 / 3 photos");
    await expect(card.locator('[data-path="Figure"]')).toContainText("2/3");
    await expect(card.locator('[data-path="Clothing"]')).toContainText("high-heels");
    await card.getByRole("link", { name: /high-heels/ }).click();
    await expect(page).toHaveURL(/tags=%40image%3Ahigh-heels/);
    await expect(page.getByText("1 of 3 images")).toBeVisible();
  });

  test("/sets finds it with @photos: and shows the coverage on its card", async ({ page }) => {
    await page.goto(`/sets?type=all&tags=${encodeURIComponent("@photos:high-heels")}&q=${encodeURIComponent(`Compose ${RUN}`)}`);
    const card = page.locator(`a[href="/sets/${SET}"]`).first();
    await expect(card).toBeVisible();
    await expect(card.getByTestId("composer-coverage")).toHaveAttribute("aria-label", "Composer: 2 of 3 photos tagged");
  });
});
