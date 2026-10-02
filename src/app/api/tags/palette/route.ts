import { NextRequest, NextResponse } from "next/server";
import { getTagPaletteData } from "@/lib/services/tag-service";
import type { TaggableEntity } from "@/lib/services/entity-tag-service";
import { withTenantFromHeaders } from "@/lib/tenant-context";

const ENTITY_TYPES: readonly TaggableEntity[] = ["PERSON", "SESSION", "MEDIA_ITEM", "SET", "PROJECT"];

// Groups + tags (with usage counts) the tag palette offers for one entity type.
export async function GET(request: NextRequest) {
  return withTenantFromHeaders(async () => {
    const entityType = ENTITY_TYPES.find((t) => t === request.nextUrl.searchParams.get("entityType"));
    if (!entityType) return NextResponse.json({ error: "entityType required" }, { status: 400 });
    return NextResponse.json(await getTagPaletteData(entityType));
  });
}
