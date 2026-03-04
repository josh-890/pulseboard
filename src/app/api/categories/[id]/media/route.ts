import { NextRequest, NextResponse } from "next/server";
import { getCategoryMediaForPerson } from "@/lib/services/category-service";
import type { PhotoVariants } from "@/lib/types";

const BASE_URL = process.env.NEXT_PUBLIC_MINIO_URL!;

function buildUrl(key: string): string {
  return `${BASE_URL}/${key}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
    const originalUrl = variants.original
      ? buildUrl(variants.original)
      : mi.fileRef
        ? buildUrl(mi.fileRef)
        : "";

    return {
      id: mi.id,
      filename: mi.filename,
      urls: {
        original: originalUrl,
        profile_256: variants.profile_256 ? buildUrl(variants.profile_256) : null,
        gallery_512: variants.gallery_512 ? buildUrl(variants.gallery_512) : null,
      },
      originalWidth: mi.originalWidth,
      originalHeight: mi.originalHeight,
    };
  });

  return NextResponse.json(items);
}
