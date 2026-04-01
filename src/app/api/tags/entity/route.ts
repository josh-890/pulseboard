import { NextRequest, NextResponse } from "next/server";
import { getEntityTags } from "@/lib/services/entity-tag-service";
import type { TaggableEntity } from "@/lib/services/entity-tag-service";
import { withTenantFromHeaders } from "@/lib/tenant-context";

export async function GET(request: NextRequest) {
  return withTenantFromHeaders(async () => {
    const { searchParams } = request.nextUrl;
    const entityType = searchParams.get("entityType") as TaggableEntity | null;
    const entityId = searchParams.get("entityId");

    if (!entityType || !entityId) {
      return NextResponse.json({ error: "entityType and entityId required" }, { status: 400 });
    }

    const tags = await getEntityTags(entityType, entityId);
    return NextResponse.json(tags);
  });
}
