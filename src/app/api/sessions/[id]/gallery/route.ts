import { NextResponse } from "next/server";
import { getSessionMediaGallery } from "@/lib/services/media-service";
import { withTenantFromHeaders } from "@/lib/tenant-context";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withTenantFromHeaders(async () => {
    try {
      const { id } = await params;
      const items = await getSessionMediaGallery(id);
      return NextResponse.json(items);
    } catch (err) {
      console.error("Session gallery fetch failed:", err);
      return NextResponse.json(
        { error: "Failed to fetch session gallery" },
        { status: 500 },
      );
    }
  });
}
