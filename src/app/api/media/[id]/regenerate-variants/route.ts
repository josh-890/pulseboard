import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { regenerateProfileVariants } from "@/lib/media-upload";
import type { PhotoVariants } from "@/lib/types";
import { withTenantFromHeaders } from "@/lib/tenant-context";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withTenantFromHeaders(async () => {
    const { id: mediaItemId } = await params;

    try {
      const mediaItem = await prisma.mediaItem.findUnique({
        where: { id: mediaItemId },
        select: {
          variants: true,
          originalWidth: true,
          originalHeight: true,
          focalX: true,
          focalY: true,
        },
      });

      if (!mediaItem) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      if (mediaItem.focalX == null || mediaItem.focalY == null) {
        return NextResponse.json({ error: "No focal point set" }, { status: 400 });
      }

      const variants = (mediaItem.variants ?? {}) as PhotoVariants;
      if (!variants.original) {
        return NextResponse.json({ error: "No original variant" }, { status: 400 });
      }

      const updatedVariants = await regenerateProfileVariants(
        variants,
        mediaItem.originalWidth,
        mediaItem.originalHeight,
        mediaItem.focalX,
        mediaItem.focalY,
      );

      await prisma.mediaItem.update({
        where: { id: mediaItemId },
        data: { variants: updatedVariants as unknown as Record<string, string> },
      });

      return NextResponse.json({ success: true });
    } catch (err) {
      console.error("[regenerate-variants] Error:", err);
      const message = err instanceof Error ? err.message : "Unexpected error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
