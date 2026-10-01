import { NextRequest, NextResponse } from "next/server";
import {
  searchTagDefinitions,
  getTagDefinitionsForEntity,
  getPopularTagsForEntity,
} from "@/lib/services/tag-service";
import type { TaggableEntity } from "@/lib/services/entity-tag-service";
import { withTenantFromHeaders } from "@/lib/tenant-context";

const ENTITY_TYPES: readonly TaggableEntity[] = ["PERSON", "SESSION", "MEDIA_ITEM", "SET", "PROJECT"];

function parseEntityType(value: string | null): TaggableEntity | undefined {
  return ENTITY_TYPES.find((t) => t === value);
}

// `scope` = the entity type being tagged; it decides which group domains are
// offered and how they rank (ADR-0033).
export async function GET(request: NextRequest) {
  return withTenantFromHeaders(async () => {
    const { searchParams } = request.nextUrl;
    const q = searchParams.get("q") ?? "";
    const entityType = parseEntityType(searchParams.get("scope"));
    const popular = searchParams.get("popular") === "true";

    if (popular && entityType) {
      return NextResponse.json(await getPopularTagsForEntity(entityType));
    }

    const tags = q.trim()
      ? await searchTagDefinitions(q, entityType)
      : entityType
        ? await getTagDefinitionsForEntity(entityType)
        : [];

    return NextResponse.json(tags);
  });
}
