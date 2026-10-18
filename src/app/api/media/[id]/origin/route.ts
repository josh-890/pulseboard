import { NextResponse } from "next/server";
import { getMediaItemOrigin } from "@/lib/services/media-origin-service";
import { withTenantFromHeaders } from "@/lib/tenant-context";

// Where an image comes from — its sets, session and the people shown — for the
// viewer's "back to the set" link in favorites, collections and tag galleries.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withTenantFromHeaders(async () => {
    const { id } = await params;
    try {
      const origin = await getMediaItemOrigin(id);
      if (!origin) return NextResponse.json({ error: "Media item not found" }, { status: 404 });
      return NextResponse.json(origin);
    } catch (err) {
      console.error("[media origin]", err);
      return NextResponse.json({ error: "Could not load where this image comes from" }, { status: 500 });
    }
  });
}
