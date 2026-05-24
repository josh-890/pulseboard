import { test, expect } from "@playwright/test";

// Slice 1 of Phase G (ADR-0005): mutability badge + edit form expose mutability
// in the catalog manager UI.

test.describe("Mutability policy in catalog manager", () => {
  test("attribute rows show a mutability badge", async ({ page }) => {
    await page.goto("/settings/catalogs/attributes");
    await page.waitForLoadState("networkidle");

    // The page renders one or more groups; each definition row should expose a
    // mutability badge ("static" / "rarely" / "volatile"). We assert at least
    // one of each known variant appears.
    await expect(page.locator("text=/^volatile$/").first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=/^rarely$/").first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=/^static$/").first()).toBeVisible({ timeout: 5000 });
  });

  test("edit form exposes a Mutability select", async ({ page }) => {
    await page.goto("/settings/catalogs/attributes");
    await page.waitForLoadState("networkidle");

    // Open the first definition's edit form.
    // The edit button has aria-label="Edit attribute" and is invisible until
    // the row is hovered; force-click bypasses the hover gate.
    await page
      .locator("button[aria-label='Edit attribute']")
      .first()
      .click({ force: true });

    // The Mutability label is part of the edit form.
    await expect(page.getByText("Mutability", { exact: true })).toBeVisible({ timeout: 3000 });

    // And the select has all three options.
    const select = page.locator("select").nth(1); // second select is mutability (first is Type)
    await expect(select.locator("option", { hasText: "Always static" })).toBeAttached();
    await expect(select.locator("option", { hasText: "Rarely changes" })).toBeAttached();
    await expect(select.locator("option", { hasText: "Volatile" })).toBeAttached();
  });
});
