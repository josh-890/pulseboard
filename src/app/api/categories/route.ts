import { NextResponse } from "next/server";
import { getAllCategoryGroups } from "@/lib/services/category-service";
import { withTenantFromHeaders } from "@/lib/tenant-context";

// Grouped detail categories for the "Assign to detail" sheet. Returns a slim
// shape (no need to leak the full rows to the client picker).
export async function GET() {
  return withTenantFromHeaders(async () => {
    const groups = await getAllCategoryGroups();
    return NextResponse.json(
      groups.map((g) => ({
        id: g.id,
        name: g.name,
        categories: g.categories.map((c) => ({
          id: c.id,
          name: c.name,
          entityModel: c.entityModel,
          alignmentTemplateId: c.alignmentTemplateId,
        })),
      })),
    );
  });
}
