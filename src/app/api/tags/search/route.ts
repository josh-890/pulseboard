import { NextRequest, NextResponse } from "next/server";
import { searchTagDefinitions, getTagDefinitionsForScope } from "@/lib/services/tag-service";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q") ?? "";
  const scope = searchParams.get("scope") ?? undefined;

  const tags = q.trim()
    ? await searchTagDefinitions(q, scope)
    : scope
      ? await getTagDefinitionsForScope(scope)
      : [];

  return NextResponse.json(tags);
}
