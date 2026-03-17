import { NextRequest, NextResponse } from "next/server";
import { getMediaItemsForSession } from "@/lib/services/media-service";
import { prisma } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: sessionId } = await params;
    const { searchParams } = request.nextUrl;
    const personId = searchParams.get("personId");
    const categoryId = searchParams.get("categoryId");

    const items = await getMediaItemsForSession(sessionId);

    // If personId + categoryId provided, query existing DETAIL links
    let linkedIds = new Set<string>();
    if (personId && categoryId) {
      const links = await prisma.personMediaLink.findMany({
        where: {
          personId,
          usage: "DETAIL",
          categoryId,
        },
        select: { mediaItemId: true },
      });
      linkedIds = new Set(links.map((l) => l.mediaItemId));
    }

    const result = items.map((item) => ({
      id: item.id,
      filename: item.filename,
      urls: item.urls,
      originalWidth: item.originalWidth,
      originalHeight: item.originalHeight,
      isLinked: linkedIds.has(item.id),
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error("Session media fetch failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch session media" },
      { status: 500 },
    );
  }
}
