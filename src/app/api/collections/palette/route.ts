import { NextResponse } from "next/server";
import { getGridCollectionsForPalette } from "@/lib/services/collection-service";
import { withTenantFromHeaders } from "@/lib/tenant-context";

// ADR-0019: GRID collections (+ which is the target) for the quick-add palette.
export async function GET() {
  return withTenantFromHeaders(async () => {
    const collections = await getGridCollectionsForPalette();
    return NextResponse.json(collections);
  });
}
