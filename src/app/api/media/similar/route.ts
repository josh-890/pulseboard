import { NextRequest, NextResponse } from "next/server";
import { getMediaItemPhash, findSimilarImages } from "@/lib/services/media-service";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const mediaItemId = searchParams.get("mediaItemId");
    const limit = Number(searchParams.get("limit") ?? "20");
    const threshold = Number(searchParams.get("threshold") ?? "10");

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
}
