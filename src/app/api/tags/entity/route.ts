import { NextRequest, NextResponse } from "next/server";
import type { TaggableEntity } from "@/lib/services/entity-tag-service";
import { getEffectiveTags } from "@/lib/services/tag-effective-service";
import { withTenantFromHeaders } from "@/lib/tenant-context";

const ENTITY_TYPES: readonly TaggableEntity[] = ["PERSON", "SESSION", "MEDIA_ITEM", "SET", "PROJECT"];

// An entity's effective tags (ADR-0033): direct ones plus those inherited down
// the content chain, each carrying its source level and `overridden` flag.
// Direct tags are the ones with source DIRECT.
export async function GET(request: NextRequest) {
  return withTenantFromHeaders(async () => {
    const { searchParams } = request.nextUrl;
    const entityType = ENTITY_TYPES.find((t) => t === searchParams.get("entityType"));
    const entityId = searchParams.get("entityId");

    if (!entityType || !entityId) {
      return NextResponse.json({ error: "entityType and entityId required" }, { status: 400 });
    }

    return NextResponse.json(await getEffectiveTags(entityType, entityId));
  });
}
