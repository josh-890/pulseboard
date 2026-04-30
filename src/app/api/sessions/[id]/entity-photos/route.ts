import { NextRequest, NextResponse } from "next/server";
import { getEntityPhotosForSession } from "@/lib/services/media-service";
import { withTenantFromHeaders } from "@/lib/tenant-context";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withTenantFromHeaders(async () => {
    try {
      const { id: sessionId } = await params;
      const personId = request.nextUrl.searchParams.get("personId");
      if (!personId) {
        return NextResponse.json({ error: "personId required" }, { status: 400 });
      }
      const groups = await getEntityPhotosForSession(sessionId, personId);
      return NextResponse.json(groups);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
