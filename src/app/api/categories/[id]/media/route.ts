import { NextRequest, NextResponse } from "next/server";
import { getCategoryMediaForPerson } from "@/lib/services/category-service";
import type { PhotoVariants } from "@/lib/types";
import { buildUrl } from "@/lib/media-url";
import { withTenantFromHeaders } from "@/lib/tenant-context";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withTenantFromHeaders(async () => {
    const { id: categoryId } = await params;
    const personId = request.nextUrl.searchParams.get("personId");

    if (!personId) {
      return NextResponse.json(
        { error: "personId is required" },
        { status: 400 },
      );
    }

    const links = await getCategoryMediaForPerson(personId, categoryId);

    const items = links.map((link) => {
      const mi = link.mediaItem;
      const variants = (mi.variants ?? {}) as PhotoVariants;
      const bestMaster = variants.master_4000 ?? variants.original;
      const originalUrl = bestMaster
        ? buildUrl(bestMaster)
        : mi.fileRef
          ? buildUrl(mi.fileRef)
          : "";

      return {
        id: mi.id,
        filename: mi.filename,
        urls: {
          original: originalUrl,
          gallery_512: variants.gallery_512 ? buildUrl(variants.gallery_512) : null,
        },
        originalWidth: mi.originalWidth,
        originalHeight: mi.originalHeight,
        focalX: mi.focalX ?? null,
        focalY: mi.focalY ?? null,
      };
    });

    return NextResponse.json(items);
  });
}
