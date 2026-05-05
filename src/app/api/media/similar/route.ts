import { NextRequest, NextResponse } from "next/server";
import { getMediaItemPhash, findSimilarImages } from "@/lib/services/media-service";
import { withTenantFromHeaders } from "@/lib/tenant-context";

export async function GET(request: NextRequest) {
  return withTenantFromHeaders(async () => {
    try {
      const { searchParams } = request.nextUrl;
      const mediaItemId = searchParams.get("mediaItemId");
      const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));
      const threshold = Math.min(64, Math.max(0, parseInt(searchParams.get("threshold") ?? "10", 10) || 10));

      if (!mediaItemId) {
        return NextResponse.json(
          { error: "mediaItemId is required" },
          { status: 400 },
        );
      }

      const source = await getMediaItemPhash(mediaItemId);
      if (!source) {
        return NextResponse.json(
          { error: "Media item not found" },
          { status: 404 },
        );
      }

      if (!source.phash) {
        return NextResponse.json(
          { error: "No perceptual hash available for this image" },
          { status: 400 },
        );
      }

      const matches = await findSimilarImages(source.phash, { limit, threshold });

      // Filter out the source item itself
      const filtered = matches.filter((m) => m.mediaItemId !== mediaItemId);

      return NextResponse.json({ source, matches: filtered });
    } catch (err) {
      console.error("Similar search failed:", err);
      return NextResponse.json(
        { error: "Search failed" },
        { status: 500 },
      );
    }
  });
}
