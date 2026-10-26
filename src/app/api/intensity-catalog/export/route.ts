import { NextResponse } from "next/server";
import { getCurrentTenantId, withTenantFromHeaders } from "@/lib/tenant-context";
import { catalogFileName, exportCatalogWorkbook } from "@/lib/services/intensity-catalog-transfer-service";

/**
 * GET /api/intensity-catalog/export
 * The intensity catalog as an Excel workbook to work on offline (2026-10-26);
 * it comes back through the import under Settings → Catalogs → Intensity.
 */
export async function GET() {
  return withTenantFromHeaders(async () => {
    const buffer = await exportCatalogWorkbook();
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${catalogFileName(getCurrentTenantId())}"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
