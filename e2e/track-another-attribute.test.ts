import { test, expect } from "@playwright/test";

// Slice 2 of Phase G: cross-group "Track another attribute" picker on the
// Appearance tab. Lets the user discover and start tracking any catalog
// attribute via a single search-driven affordance.

const SEED_PERSON = "seed-person-1"; // Jane

test.describe("Track another attribute picker", () => {
  test("footer button opens the picker and search filters the catalog", async ({ page }) => {
    await page.goto(`/people/${SEED_PERSON}?tab=appearance`);
    await page.waitForLoadState("networkidle");

    // Click the "+ Track another attribute" footer button
    await page.getByRole("button", { name: /track another attribute/i }).click();

    // Picker dialog appears
    await expect(page.getByRole("heading", { name: "Track another attribute" })).toBeVisible({
      timeout: 5000,
    });

    // Search input narrows the visible catalog
    const search = page.getByPlaceholder(/find or add/i);
    await search.fill("hair");

    // At least one matching attribute is visible
    await expect(page.locator("button", { hasText: /^Hair/ }).first()).toBeVisible({
      timeout: 3000,
    });

    // Non-matching attrs should not appear (e.g. Handedness)
    await expect(page.getByText("Handedness", { exact: true })).toHaveCount(0);
  });

  test("close button dismisses the picker", async ({ page }) => {
    await page.goto(`/people/${SEED_PERSON}?tab=appearance`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /track another attribute/i }).click();
    await expect(page.getByRole("heading", { name: "Track another attribute" })).toBeVisible();

    await page.getByLabel("Close picker").click();
    await expect(page.getByRole("heading", { name: "Track another attribute" })).toHaveCount(0);
  });
});
