import { describe, expect, it } from "vitest";
import { planCatalogImport } from "@/lib/intensity-catalog-transfer";
import {
  exportCatalogWorkbook,
  getCatalogSnapshot,
  previewCatalogImport,
  readCatalogWorkbook,
} from "@/lib/services/intensity-catalog-transfer-service";

// The catalog workbook round trip (2026-10-26), read-only: whatever the catalog
// holds, its own export imports as "nothing to change". Writing is tested on a
// scratch database (intensity-catalog-apply.test.ts) — the dev catalog is real.

describe("intensity catalog workbook", () => {
  it("imports its own export as no change", async () => {
    const buffer = await exportCatalogWorkbook();
    const { file, problems } = await readCatalogWorkbook(buffer);
    expect(problems).toEqual([]);
    const plan = planCatalogImport(await getCatalogSnapshot(), file);
    expect(plan.problems).toEqual([]);
    expect(plan.changes).toEqual([]);
    expect(plan.kept).toEqual([]);
  });

  it("names a file that is no workbook, and one missing a sheet", async () => {
    expect(
      (await previewCatalogImport(Buffer.from("not a workbook"))).problems.map(
        (p) => p.message,
      ),
    ).toEqual(["This is not an Excel workbook (.xlsx)."]);
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Settings").addRow(["Setting", "Value"]);
    const preview = await previewCatalogImport(
      Buffer.from(await wb.xlsx.writeBuffer()),
    );
    expect(preview.problems.map((p) => p.message)).toContain(
      "The sheet “Acts” is missing.",
    );
    expect(preview.changes).toEqual([]);
  });
});
