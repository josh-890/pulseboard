import { NextRequest, NextResponse } from "next/server";
import { TAGGABLE_ENTITIES } from "@/lib/tag-domains";
import { getSelectionTagCounts, type TaggableEntity } from "@/lib/services/entity-tag-service";
import { withTenantFromHeaders } from "@/lib/tenant-context";

const ENTITY_TYPES: readonly TaggableEntity[] = TAGGABLE_ENTITIES;

// How many of the selected entities carry each tag — the tri-state bulk palette.
// POST because a selection can be thousands of ids.
export async function POST(request: NextRequest) {
  return withTenantFromHeaders(async () => {
    const body: unknown = await request.json().catch(() => null);
    const entityType =
      body && typeof body === "object" && "entityType" in body
        ? ENTITY_TYPES.find((t) => t === (body as { entityType: unknown }).entityType)
        : undefined;
    const ids =
      body && typeof body === "object" && "ids" in body && Array.isArray((body as { ids: unknown }).ids)
        ? (body as { ids: unknown[] }).ids.filter((x): x is string => typeof x === "string")
        : null;
    if (!entityType || !ids) {
      return NextResponse.json({ error: "entityType and ids required" }, { status: 400 });
    }
    return NextResponse.json(await getSelectionTagCounts(entityType, ids));
  });
}
