import { NextRequest, NextResponse } from "next/server";
import {
  searchTagDefinitions,
  getTagDefinitionsForScope,
  getPopularTagsForScope,
} from "@/lib/services/tag-service";
import { withTenantFromHeaders } from "@/lib/tenant-context";

export async function GET(request: NextRequest) {
  return withTenantFromHeaders(async () => {
    const { searchParams } = request.nextUrl;
    const q = searchParams.get("q") ?? "";
    const scope = searchParams.get("scope") ?? undefined;
    const popular = searchParams.get("popular") === "true";

    if (popular && scope) {
      const tags = await getPopularTagsForScope(scope);
      return NextResponse.json(tags);
    }

    const tags = q.trim()
      ? await searchTagDefinitions(q, scope)
      : scope
        ? await getTagDefinitionsForScope(scope)
        : [];

    return NextResponse.json(tags);
  });
}
