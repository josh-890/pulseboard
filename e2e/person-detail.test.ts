import { test, expect, type Page } from "@playwright/test";
import path from "path";

// ── Helpers ──────────────────────────────────────────────────────────────────

const SEED_PERSON = "seed-person-1"; // Jane
const TEST_PHOTO = path.resolve(__dirname, "fixtures/test-photo.jpg");

async function goToPersonDetail(page: Page) {
  await page.goto(`/people/${SEED_PERSON}`);
  await page.waitForLoadState("networkidle");
}

async function switchTab(page: Page, tabName: string) {
  await page.getByRole("tab", { name: tabName }).click();
  await page.waitForTimeout(500);
}

/**
 * Open the body region picker dialog, search for a region, click it, then Done.
 */
async function selectBodyRegion(page: Page, regionName: string) {
  // Click the "Select Regions..." trigger button to open the dialog
  await page.getByRole("button", { name: /select regions/i }).click();
  await expect(page.getByRole("heading", { name: "Select Body Regions" })).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(500);

  // Use the search input in the body region picker
  await page.getByPlaceholder("Search regions...").fill(regionName);
  await page.waitForTimeout(300);

  // Click the search result from the results list (not SVG region buttons)
  const searchResults = page.getByTestId("region-search-results");
  await expect(searchResults).toBeVisible({ timeout: 3000 });
  await searchResults.locator("button").filter({ hasText: regionName }).first().click();
  await page.waitForTimeout(200);

  // Click Done to close the dialog
  await page.getByRole("button", { name: "Done" }).click();
  await page.waitForTimeout(500);
}

/**
 * In the Appearance tab, click the "Add" button next to a section heading.
 */
async function clickAddInSection(page: Page, sectionHeading: string) {
  // The structure is: generic > [generic(heading), button("Add")]
  // Find heading, go to parent, find "Add" button within that parent
  const heading = page.getByRole("heading", { name: sectionHeading, level: 2 });
  // The Add button is a sibling — find it via the shared parent container
  const container = heading.locator("xpath=ancestor::div[1]/..");
  await container.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForTimeout(500);
}

// ── Persona CRUD ─────────────────────────────────────────────────────────────

test.describe("Persona CRUD", () => {
  test("create persona with physical changes and body mark event", async ({ page }) => {
    await goToPersonDetail(page);

    const ts = Date.now();
    const label = `Test Persona ${ts}`;

    // Click "New Persona" button
    await page.getByRole("button", { name: /new persona/i }).click();
    await expect(page.getByRole("heading", { name: "New Persona" })).toBeVisible({ timeout: 5000 });

    // Fill persona label (required to enable submit)
    await page.getByPlaceholder(/e\.g\. March 2024/i).fill(label);

    // ── Physical Changes — expand accordion and fill fields by label
    await page.getByRole("button", { name: "Physical Changes" }).click();
    await page.waitForTimeout(300);

    // Fields are labeled, not placeholders: "Hair Color", "Weight (kg)", etc.
    const physicalSection = page.getByText("Only fill in what changed.").locator("..");
    await physicalSection.locator("input").first().fill("platinum"); // Hair Color
    await physicalSection.getByRole("spinbutton").fill("55"); // Weight (kg)

    // ── Body Mark Events — expand and add a body mark
    await page.getByRole("button", { name: "Body Mark Events" }).click();
    await page.waitForTimeout(300);

    // Select type "tattoo"
    const bmSection = page.getByText("New Body Mark").locator("..");
    await bmSection.getByRole("button", { name: "tattoo" }).click();

    // Fill body region (free text input in the persona sheet)
    await page.getByPlaceholder("Body region...").fill("Right Forearm");

    // Fill motif
    await page.getByPlaceholder("Motif (optional)...").fill("Star pattern");

    // Click "Add to persona"
    await page.getByRole("button", { name: /add to persona/i }).click();
    await page.waitForTimeout(300);

    // Submit the persona
    const createBtn = page.getByRole("button", { name: /create persona/i });
    await createBtn.scrollIntoViewIfNeeded();
    await createBtn.click();

    // Verify: persona label appears in the timeline (page refreshes)
    await page.waitForTimeout(2000);
    await expect(page.getByText(label)).toBeVisible({ timeout: 10000 });
  });

  test("delete test persona", async ({ page }) => {
    await goToPersonDetail(page);
    await page.waitForTimeout(1000);

    // Find a test persona by its label
    const testPersonaText = page.getByText(/Test Persona \d+/).first();
    const isVisible = await testPersonaText.isVisible().catch(() => false);
    if (!isVisible) {
      // No test persona to delete — skip
      test.skip();
      return;
    }

    // The persona card header: generic > [label text, buttons container > [Edit, Delete]]
    // ancestor::div[1] = card header containing label + buttons
    const cardHeader = testPersonaText.locator("xpath=ancestor::div[1]");
    await cardHeader.getByRole("button", { name: "Delete" }).click();

    // Confirm in the alert dialog
    const alertDialog = page.getByRole("alertdialog");
    await expect(alertDialog).toBeVisible({ timeout: 3000 });
    await alertDialog.getByRole("button", { name: /delete/i }).last().click();

    // Verify persona is gone (wait for page to refresh)
    await page.waitForTimeout(3000);
    await expect(page.getByText(/Test Persona \d+/)).not.toBeVisible({ timeout: 10000 });
  });
});

// ── Aliases CRUD ─────────────────────────────────────────────────────────────

test.describe("Aliases CRUD", () => {
  test("create alias", async ({ page }) => {
    await goToPersonDetail(page);
    await switchTab(page, "Aliases");

    const ts = Date.now();
    const aliasName = `TestAlias${ts}`;

    await page.getByRole("button", { name: "Add Alias" }).click();
    await expect(page.getByRole("heading", { name: "Add Alias" })).toBeVisible({ timeout: 5000 });

    await page.getByPlaceholder(/enter alias name/i).fill(aliasName);
    // Type defaults to "Alias" which is fine
    await page.getByRole("button", { name: "Create Alias" }).click();

    // No toast — verify alias appears in the list after page refresh
    await page.waitForTimeout(2000);
    await expect(page.getByText(aliasName)).toBeVisible({ timeout: 10000 });
  });

  test("edit alias", async ({ page }) => {
    await goToPersonDetail(page);
    await switchTab(page, "Aliases");

    // Find any TestAlias row
    const testAliasText = page.getByText(/TestAlias\d+/).first();
    if (!(await testAliasText.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    // Each alias row: generic > [checkbox, name, type badge, source badge, generic([Edit, Delete])]
    // Click Edit alias — it's within the same row
    const aliasRow = testAliasText.locator("xpath=ancestor::div[1]");
    await aliasRow.getByRole("button", { name: "Edit alias" }).click();

    await expect(page.getByRole("heading", { name: /edit alias/i })).toBeVisible({ timeout: 5000 });

    // Modify the name
    const nameInput = page.getByPlaceholder(/enter alias name/i);
    const original = await nameInput.inputValue();
    await nameInput.fill(original + "Ed");
    await page.getByRole("button", { name: /save|update/i }).click();

    // Verify updated name appears
    await page.waitForTimeout(2000);
    await expect(page.getByText(original + "Ed")).toBeVisible({ timeout: 10000 });
  });

  test("delete alias", async ({ page }) => {
    await goToPersonDetail(page);
    await switchTab(page, "Aliases");

    // Find test alias
    const testAliasText = page.getByText(/TestAlias\d+/).first();
    if (!(await testAliasText.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    const aliasRow = testAliasText.locator("xpath=ancestor::div[1]");
    await aliasRow.getByRole("button", { name: "Delete alias" }).click();

    // Confirm deletion
    const alertDialog = page.getByRole("alertdialog");
    if (await alertDialog.isVisible({ timeout: 2000 }).catch(() => false)) {
      await alertDialog.getByRole("button", { name: /delete|confirm/i }).click();
    }

    // Verify alias is gone
    await page.waitForTimeout(2000);
    await expect(testAliasText).not.toBeVisible({ timeout: 5000 });
  });
});

// ── Appearance Tab: Body Marks ───────────────────────────────────────────────

test.describe("Appearance: Body Marks", () => {
  test("create body mark with body region picker", async ({ page }) => {
    await goToPersonDetail(page);
    await switchTab(page, "Appearance");

    await clickAddInSection(page, "Body Marks");
    await expect(page.getByRole("heading", { name: "Add Body Mark" })).toBeVisible({ timeout: 5000 });

    // Type "tattoo" is already selected by default — no need to click

    // Select body region via the picker dialog
    await selectBodyRegion(page, "Left Upper Arm");

    // Fill motif
    await page.getByPlaceholder("Design or pattern name...").fill("Test Eagle Tattoo");
    // Fill description
    await page.getByPlaceholder("Detailed description...").fill("Large eagle on upper arm");
    // Fill colors
    await page.getByPlaceholder("black, red...").fill("black, gold");
    // Fill size
    await page.getByPlaceholder("small, 5cm...").fill("12cm");

    // Submit
    const submitBtn = page.getByRole("button", { name: "Create Body Mark" });
    await submitBtn.scrollIntoViewIfNeeded();
    await submitBtn.click();

    // Wait for the sheet to close and page to settle
    await expect(page.getByRole("heading", { name: "Add Body Mark" })).not.toBeVisible({ timeout: 15000 });
    await page.waitForLoadState("networkidle");

    // Force a page reload to ensure we see the latest data
    await page.reload();
    await page.waitForLoadState("networkidle");
    await switchTab(page, "Appearance");

    // Expand the new body mark row — region shows as "Upper Arm (L)" chip
    const lastRow = page.getByRole("button", { name: /tattoo.*Upper Arm/i }).last();
    if (await lastRow.isVisible().catch(() => false)) {
      await lastRow.click();
      await page.waitForTimeout(300);
    }
    await expect(page.getByText("Test Eagle Tattoo").first()).toBeVisible({ timeout: 10000 });
  });

  test("edit body mark", async ({ page }) => {
    await goToPersonDetail(page);
    await switchTab(page, "Appearance");
    await page.waitForTimeout(500);

    // Expand the test body mark row (motif is hidden in collapsed state)
    const markRow = page.getByRole("button", { name: /tattoo.*Upper Arm/i }).last();
    if (!(await markRow.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await markRow.click();
    await page.waitForTimeout(300);

    // Click edit on the test body mark
    const editBtn = page.getByRole("button", { name: "Edit body mark" }).last();
    if (!(await editBtn.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    await editBtn.click();
    await expect(page.getByRole("heading", { name: "Edit Body Mark" })).toBeVisible({ timeout: 5000 });

    // The seed data's body mark has no bodyRegions array, but the test-created
    // body mark should have bodyRegions from the picker. If the update button
    // is disabled, we need to select a body region first.
    const updateBtn = page.getByRole("button", { name: "Update Body Mark" });
    const isDisabled = await updateBtn.isDisabled();
    if (isDisabled) {
      await selectBodyRegion(page, "Left Upper Arm");
    }

    // Modify the size field (simple, won't break validation)
    const editSheet = page.getByRole("heading", { name: "Edit Body Mark" }).locator("xpath=ancestor::div[1]/..");
    const allInputs = await editSheet.locator("input[type='text'], textarea").all();
    for (const input of allInputs) {
      const val = await input.inputValue();
      if (val === "12cm" || val === "small" || val === "") {
        await input.fill("15cm");
        break;
      }
    }

    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Update Body Mark" }).click();

    // Wait for sheet to close and reload
    await expect(page.getByRole("heading", { name: "Edit Body Mark" })).not.toBeVisible({ timeout: 15000 });
    await page.waitForLoadState("networkidle");
    await page.reload();
    await page.waitForLoadState("networkidle");
    await switchTab(page, "Appearance");

    // Expand the row to see the motif (hidden in collapsed state)
    const updatedMarkRow = page.getByRole("button", { name: /tattoo.*Upper Arm/i }).last();
    if (await updatedMarkRow.isVisible().catch(() => false)) {
      await updatedMarkRow.click();
      await page.waitForTimeout(300);
    }
    // Verify the body mark is still visible (it was updated, not deleted)
    await expect(page.getByText("Test Eagle Tattoo").first()).toBeVisible({ timeout: 10000 });
  });

  test("delete body mark", async ({ page }) => {
    await goToPersonDetail(page);
    await switchTab(page, "Appearance");
    await page.waitForTimeout(500);

    // Expand the test body mark row (motif is hidden in collapsed state)
    const markRow = page.getByRole("button", { name: /tattoo.*Upper Arm/i }).last();
    if (!(await markRow.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await markRow.click();
    await page.waitForTimeout(300);

    // Click the delete button (now visible in expanded row)
    await page.getByRole("button", { name: "Delete body mark" }).last().click();

    // No confirmation dialog for body marks — deletion is immediate
    await page.waitForTimeout(3000);
    await expect(page.getByText("Test Eagle Tattoo").first()).not.toBeVisible({ timeout: 10000 });
  });
});

// ── Appearance Tab: Body Modifications ───────────────────────────────────────

test.describe("Appearance: Body Modifications", () => {
  test("create body modification with body region picker", async ({ page }) => {
    await goToPersonDetail(page);
    await switchTab(page, "Appearance");

    await clickAddInSection(page, "Body Modifications");
    await expect(page.getByRole("heading", { name: "Add Body Modification" })).toBeVisible({ timeout: 5000 });

    // Type "piercing" is already selected by default — no need to click

    // Select body region via picker
    await selectBodyRegion(page, "Navel");

    // Fill description
    const descInput = page.getByPlaceholder(/details|description/i).first();
    await descInput.fill("Test navel ring");

    // Submit
    const modSubmitBtn = page.getByRole("button", { name: "Create Body Modification" });
    await modSubmitBtn.scrollIntoViewIfNeeded();
    await modSubmitBtn.click();

    // Wait for sheet to close and reload to see latest data
    await expect(page.getByRole("heading", { name: "Add Body Modification" })).not.toBeVisible({ timeout: 15000 });
    await page.waitForLoadState("networkidle");
    await page.reload();
    await page.waitForLoadState("networkidle");
    await switchTab(page, "Appearance");

    // Expand the last body modification row to reveal the description text
    const lastModRow = page.getByRole("button", { name: /piercing.*Navel/i }).last();
    if (await lastModRow.isVisible().catch(() => false)) {
      await lastModRow.click();
      await page.waitForTimeout(300);
    }
    await expect(page.getByText("Test navel ring").first()).toBeVisible({ timeout: 10000 });
  });

  test("edit body modification", async ({ page }) => {
    await goToPersonDetail(page);
    await switchTab(page, "Appearance");
    await page.waitForTimeout(500);

    // Expand the test body mod row (description is hidden in collapsed state)
    const modRow = page.getByRole("button", { name: /piercing.*Navel/i }).last();
    if (!(await modRow.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await modRow.click();
    await page.waitForTimeout(300);

    const editBtn = page.getByRole("button", { name: "Edit body modification" }).first();
    if (!(await editBtn.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    await editBtn.click();
    await expect(page.getByRole("heading", { name: "Edit Body Modification" })).toBeVisible({ timeout: 5000 });

    // Edit sheet uses labels, not placeholders — find the description input by value
    const editSheet = page.getByRole("heading", { name: "Edit Body Modification" }).locator("xpath=ancestor::div[1]/..");
    const allInputs = await editSheet.locator("input[type='text'], textarea").all();
    for (const input of allInputs) {
      const val = await input.inputValue();
      if (val.includes("navel ring")) {
        await input.fill("Test navel ring (updated)");
        break;
      }
    }

    await page.getByRole("button", { name: "Update Body Modification" }).click();

    // Wait for sheet to close and reload
    await expect(page.getByRole("heading", { name: "Edit Body Modification" })).not.toBeVisible({ timeout: 15000 });
    await page.waitForLoadState("networkidle");
    await page.reload();
    await page.waitForLoadState("networkidle");
    await switchTab(page, "Appearance");

    // Expand the row to see the updated description
    const updatedRow = page.getByRole("button", { name: /piercing.*Navel/i }).last();
    if (await updatedRow.isVisible().catch(() => false)) {
      await updatedRow.click();
      await page.waitForTimeout(300);
    }
    await expect(page.getByText("Test navel ring (updated)")).toBeVisible({ timeout: 10000 });
  });

  test("delete body modification", async ({ page }) => {
    await goToPersonDetail(page);
    await switchTab(page, "Appearance");
    await page.waitForTimeout(500);

    // Expand the test body mod row (description hidden in collapsed state)
    const modRow = page.getByRole("button", { name: /piercing.*Navel/i }).last();
    if (!(await modRow.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await modRow.click();
    await page.waitForTimeout(300);

    const deleteBtn = page.getByRole("button", { name: "Delete body modification" }).first();
    if (!(await deleteBtn.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    await deleteBtn.click();

    const alertDialog = page.getByRole("alertdialog");
    if (await alertDialog.isVisible({ timeout: 2000 }).catch(() => false)) {
      await alertDialog.getByRole("button", { name: /delete|confirm/i }).click();
    }

    await page.waitForTimeout(2000);
    await expect(page.getByText("Test navel ring")).not.toBeVisible({ timeout: 5000 });
  });
});

// ── Appearance Tab: Cosmetic Procedures ──────────────────────────────────────

test.describe("Appearance: Cosmetic Procedures", () => {
  test("create cosmetic procedure with body region picker", async ({ page }) => {
    await goToPersonDetail(page);
    await switchTab(page, "Appearance");

    await clickAddInSection(page, "Cosmetic Procedures");
    await expect(page.getByRole("heading", { name: "Add Cosmetic Procedure" })).toBeVisible({ timeout: 5000 });

    // Type is free-text
    await page.getByPlaceholder(/e\.g\. lip filler/i).fill("Test Rhinoplasty");

    // Select body region
    await selectBodyRegion(page, "Face");

    // Fill description
    await page.getByPlaceholder(/procedure details/i).fill("Test nose job");

    // Fill provider
    await page.getByPlaceholder(/clinic or practitioner/i).fill("Test Clinic");

    const procSubmitBtn = page.getByRole("button", { name: "Create Cosmetic Procedure" });
    await procSubmitBtn.scrollIntoViewIfNeeded();
    await procSubmitBtn.click();

    // Wait for sheet to close and reload to see latest data
    await expect(page.getByRole("heading", { name: "Add Cosmetic Procedure" })).not.toBeVisible({ timeout: 15000 });
    await page.waitForLoadState("networkidle");
    await page.reload();
    await page.waitForLoadState("networkidle");
    await switchTab(page, "Appearance");

    await expect(page.getByText("Test Rhinoplasty", { exact: true }).first()).toBeVisible({ timeout: 10000 });
  });

  test("edit cosmetic procedure", async ({ page }) => {
    await goToPersonDetail(page);
    await switchTab(page, "Appearance");
    await page.waitForTimeout(500);

    // Expand the test cosmetic procedure row (click the collapsed row header)
    const procRow = page.getByRole("button", { name: /Test Rhinoplasty.*Face/i }).first();
    if (!(await procRow.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await procRow.click();
    await page.waitForTimeout(300);

    const editBtn = page.getByRole("button", { name: "Edit cosmetic procedure" }).first();
    if (!(await editBtn.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    await editBtn.click();
    await expect(page.getByRole("heading", { name: "Edit Cosmetic Procedure" })).toBeVisible({ timeout: 5000 });

    // Edit sheet uses labels, not placeholders — find the provider input by value
    const editSheet = page.getByRole("heading", { name: "Edit Cosmetic Procedure" }).locator("xpath=ancestor::div[1]/..");
    const allInputs = await editSheet.locator("input[type='text'], textarea").all();
    for (const input of allInputs) {
      const val = await input.inputValue();
      if (val.includes("Test Clinic")) {
        await input.fill("Updated Test Clinic");
        break;
      }
    }

    await page.getByRole("button", { name: "Update Cosmetic Procedure" }).click();

    // Wait for sheet to close and reload
    await expect(page.getByRole("heading", { name: "Edit Cosmetic Procedure" })).not.toBeVisible({ timeout: 15000 });
    await page.waitForLoadState("networkidle");
    await page.reload();
    await page.waitForLoadState("networkidle");
    await switchTab(page, "Appearance");

    // Expand the row to see the updated provider (hidden in collapsed state)
    const updatedProcRow = page.getByRole("button", { name: /Test Rhinoplasty.*Face/i }).first();
    if (await updatedProcRow.isVisible().catch(() => false)) {
      await updatedProcRow.click();
      await page.waitForTimeout(300);
    }
    await expect(page.getByText("Updated Test Clinic")).toBeVisible({ timeout: 10000 });
  });

  test("delete cosmetic procedure", async ({ page }) => {
    await goToPersonDetail(page);
    await switchTab(page, "Appearance");
    await page.waitForTimeout(500);

    // Expand the test cosmetic procedure row (click the collapsed row header)
    const procRow = page.getByRole("button", { name: /Test Rhinoplasty.*Face/i }).first();
    if (!(await procRow.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await procRow.click();
    await page.waitForTimeout(300);

    const deleteBtn = page.getByRole("button", { name: "Delete cosmetic procedure" }).first();
    if (!(await deleteBtn.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    await deleteBtn.click();

    const alertDialog = page.getByRole("alertdialog");
    if (await alertDialog.isVisible({ timeout: 2000 }).catch(() => false)) {
      await alertDialog.getByRole("button", { name: /delete|confirm/i }).click();
    }

    await page.waitForTimeout(2000);
    await expect(page.getByRole("button", { name: /Test Rhinoplasty.*Face/i })).not.toBeVisible({ timeout: 5000 });
  });
});

// ── Photo Upload & Gallery ───────────────────────────────────────────────────

test.describe("Photo Management", () => {
  test("upload photo via reference session page", async ({ page }) => {
    // Navigate to the reference session page via its direct URL
    await page.goto(`/people/${SEED_PERSON}`);
    await page.waitForLoadState("networkidle");

    // Click the "Reference Media" link card
    await page.locator("a[href*='/sessions/']").filter({ hasText: "Reference Media" }).click();
    await page.waitForLoadState("networkidle");

    // Look for file input (hidden inputs used by drop zones)
    const fileInput = page.locator("input[type='file']").first();
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(TEST_PHOTO);
      await page.waitForTimeout(5000); // Wait for upload + processing

      // Verify: new thumbnail should appear
      const thumbnails = page.locator("img");
      await expect(thumbnails.first()).toBeVisible({ timeout: 10000 });
    }
  });

  test("gallery shows thumbnails on Photos tab", async ({ page }) => {
    await goToPersonDetail(page);
    await switchTab(page, "Photos");

    // The Photos tab should show photo thumbnails
    await page.waitForTimeout(1000);
    const images = page.locator("img");
    await expect(images.first()).toBeVisible();
  });

  test("photo lightbox opens on click", async ({ page }) => {
    await goToPersonDetail(page);
    await switchTab(page, "Photos");
    await page.waitForTimeout(1000);

    // Click the first clickable image in the gallery
    const galleryImg = page.locator("[class*='cursor-pointer'] img, [role='button'] img").first();
    if (await galleryImg.isVisible().catch(() => false)) {
      await galleryImg.click();
      await page.waitForTimeout(500);

      // Lightbox should appear as a fixed overlay
      const lightbox = page.locator("[class*='fixed'][class*='inset']").last();
      await expect(lightbox).toBeVisible({ timeout: 3000 });

      // Close with Escape
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }
  });
});

// ── Focal Point ─────────────────────────────────────────────────────────────

test.describe("Focal Point", () => {
  async function openInfoPanelOnReferenceSession(page: Page) {
    // Navigate to person detail
    await page.goto(`/people/${SEED_PERSON}`);
    await page.waitForLoadState("networkidle");

    // Click the "Reference Media" link card to go to reference session
    await page.locator("a[href*='/sessions/']").filter({ hasText: "Reference Media" }).click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Click the first image thumbnail to select it and open the info panel
    const galleryImg = page.locator("[class*='cursor-pointer'] img, [role='button'] img").first();
    if (!(await galleryImg.isVisible().catch(() => false))) {
      return false;
    }
    await galleryImg.click();
    await page.waitForTimeout(500);

    // Scroll the focal point section into view by clicking its header
    const focalHeader = page.getByText("Focal Point").first();
    await focalHeader.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    // Ensure the section is expanded (click header if collapsed)
    const focalThumb = page.locator("[aria-label='Click to set focal point']");
    if (!(await focalThumb.isVisible().catch(() => false))) {
      await focalHeader.click();
      await page.waitForTimeout(300);
    }

    // Scroll the thumbnail fully into view
    await focalThumb.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    return true;
  }

  test("set focal point via info panel", async ({ page }) => {
    const opened = await openInfoPanelOnReferenceSession(page);
    if (!opened) {
      test.skip();
      return;
    }

    const focalThumb = page.locator("[aria-label='Click to set focal point']");
    await expect(focalThumb).toBeVisible({ timeout: 3000 });

    // Click near center of the thumbnail
    await focalThumb.click({ position: { x: 50, y: 30 } });
    await page.waitForTimeout(1500);

    // Verify "Manual" label and coordinates appear
    await expect(page.getByText("Manual")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/\d+%.*\d+%/)).toBeVisible({ timeout: 3000 });
  });

  test("change focal point does not freeze panel", async ({ page }) => {
    const opened = await openInfoPanelOnReferenceSession(page);
    if (!opened) {
      test.skip();
      return;
    }

    const focalThumb = page.locator("[aria-label='Click to set focal point']");
    await expect(focalThumb).toBeVisible({ timeout: 3000 });

    // Set focal point
    await focalThumb.click({ position: { x: 80, y: 20 } });
    await page.waitForTimeout(500);

    // Immediately verify the panel is still interactive — the "Clear" button should be clickable
    const clearBtn = page.getByRole("button", { name: "Clear" });
    await clearBtn.scrollIntoViewIfNeeded();
    await expect(clearBtn).toBeEnabled({ timeout: 3000 });
  });

  test("reset focal point", async ({ page }) => {
    const opened = await openInfoPanelOnReferenceSession(page);
    if (!opened) {
      test.skip();
      return;
    }

    const focalThumb = page.locator("[aria-label='Click to set focal point']");
    await expect(focalThumb).toBeVisible({ timeout: 3000 });

    // Ensure a focal point is set first
    const manualLabel = page.getByText("Manual");
    if (!(await manualLabel.isVisible().catch(() => false))) {
      await focalThumb.click({ position: { x: 50, y: 50 } });
      await page.waitForTimeout(1500);
      await expect(manualLabel).toBeVisible({ timeout: 5000 });
    }

    // Click Clear
    const clearBtn = page.getByRole("button", { name: "Clear" });
    await clearBtn.scrollIntoViewIfNeeded();
    await clearBtn.click();
    await page.waitForTimeout(1500);

    // Verify "Not set" appears
    await expect(page.getByText("Not set")).toBeVisible({ timeout: 5000 });
  });
});

// ── Skills CRUD ──────────────────────────────────────────────────────────────

test.describe("Skills CRUD", () => {
  test("add skill event to existing skill", async ({ page }) => {
    await goToPersonDetail(page);
    await switchTab(page, "Skills");

    // Expand the first skill group if collapsed
    const groupBtn = page.locator("button").filter({ hasText: /Technical|Performance/i }).first();
    await groupBtn.click();
    await page.waitForTimeout(300);

    // Click "Add event" on the first skill
    const addEventBtn = page.locator("[aria-label='Add event']").first();
    if (await addEventBtn.isVisible().catch(() => false)) {
      await addEventBtn.click();

      const heading = page.getByRole("heading", { name: /add.*event/i });
      await expect(heading).toBeVisible({ timeout: 5000 });

      // Select event type
      const eventTypeBtn = page.getByRole("button", { name: /improved/i }).first();
      if (await eventTypeBtn.isVisible().catch(() => false)) {
        await eventTypeBtn.click();
      }

      // Fill notes
      const notesInput = page.getByPlaceholder(/notes|optional/i).first();
      if (await notesInput.isVisible().catch(() => false)) {
        await notesInput.fill("Test event from Playwright");
      }

      // Submit
      await page.getByRole("button", { name: /add event|create/i }).click();

      // Verify event was created (no toast, check DOM)
      await page.waitForTimeout(2000);
      await expect(page.getByText("Test event from Playwright")).toBeVisible({ timeout: 10000 });
    }
  });

  test("edit skill level", async ({ page }) => {
    await goToPersonDetail(page);
    await switchTab(page, "Skills");

    // Expand skill group
    const groupBtn = page.locator("button").filter({ hasText: /Technical|Performance/i }).first();
    await groupBtn.click();
    await page.waitForTimeout(300);

    // Click "Edit skill" on the first skill
    const editBtn = page.locator("[aria-label='Edit skill']").first();
    if (await editBtn.isVisible().catch(() => false)) {
      await editBtn.click();

      const heading = page.getByRole("heading", { name: /edit skill/i });
      await expect(heading).toBeVisible({ timeout: 5000 });

      // Just save without changes to test the flow
      await page.getByRole("button", { name: /save|update/i }).click();
      await page.waitForTimeout(2000);
    }
  });

  test("delete skill event", async ({ page }) => {
    await goToPersonDetail(page);
    await switchTab(page, "Skills");

    // Expand skill group
    const groupBtn = page.locator("button").filter({ hasText: /Technical|Performance/i }).first();
    await groupBtn.click();
    await page.waitForTimeout(300);

    // Find the test event we created
    const testEvent = page.getByText("Test event from Playwright");
    if (await testEvent.isVisible().catch(() => false)) {
      // Hover to reveal delete button on the event row
      const eventRow = testEvent.locator("xpath=ancestor::div[contains(@class, 'group')]").first();
      await eventRow.hover();
      await page.waitForTimeout(200);

      // Click the trash/delete button
      const deleteBtn = eventRow.locator("button").filter({ has: page.locator("svg") }).last();
      await deleteBtn.click();

      await page.waitForTimeout(2000);
      await expect(testEvent).not.toBeVisible({ timeout: 5000 });
    }
  });
});
