import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";

// Export and import of the intensity catalog (2026-10-26) — read-only here: the
// dev catalog is real, so nothing is applied. The import's writing is tested on
// a scratch database (src/lib/services/__tests__/intensity-catalog-apply.test.ts).

test.describe.configure({ timeout: 90_000 });

test("Export downloads the workbook; importing it unchanged shows nothing to change", async ({ page }) => {
  await page.goto("/settings/catalogs/intensity");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^intensity-catalog-.+-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const path = await file.path();

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readFileSync(path) as unknown as ExcelJS.Buffer);
  expect(wb.worksheets.map((w) => w.name)).toEqual([
    "Read me",
    "Settings",
    "Scale",
    "Boundaries",
    "Scenarios",
    "Acts",
    "Extra groups",
    "Extras",
    "Presets",
  ]);

  await page.getByLabel("Choose a catalog workbook to import").setInputFiles(path);
  const dialog = page.getByRole("dialog", { name: "Import the intensity catalog" });
  await expect(dialog).toContainText("The file matches the catalog — there is nothing to change.");
  await expect(dialog.getByRole("button", { name: "Apply" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
});

test("a broken file shows its problems and cannot be applied", async ({ page }) => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("Settings").addRows([
    ["Setting", "Value"],
    ["Max", 99],
  ]);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());

  await page.goto("/settings/catalogs/intensity");
  await page.getByLabel("Choose a catalog workbook to import").setInputFiles({
    name: "broken.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer,
  });
  const dialog = page.getByRole("dialog", { name: "Import the intensity catalog" });
  const problems = dialog.getByRole("region", { name: "Problems" });
  await expect(problems).toContainText("Fix these in the file, then import it again");
  await expect(problems).toContainText("The sheet “Acts” is missing.");
  await expect(dialog.getByRole("button", { name: "Apply" })).toBeDisabled();
});
