import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

const BASE_URL = process.env.NEXT_PUBLIC_MINIO_URL!;

function buildUrl(key: string): string {
  return `${BASE_URL}/${key}`;
}

type PhotoVariants = Record<string, string | undefined>;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const q = searchParams.get("q") || "";
  const sessionId = searchParams.get("sessionId");
  const personId = searchParams.get("personId");
  const excludeSetId = searchParams.get("excludeSetId");
  const excludeCollectionId = searchParams.get("excludeCollectionId");
  const cursor = searchParams.get("cursor");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

  const where: Prisma.MediaItemWhereInput = {
    deletedAt: null,
  };

  if (q) {
    where.filename = { contains: q, mode: "insensitive" };
  }

  if (sessionId) {
    where.sessionId = sessionId;
  }

  if (personId) {
    where.personMediaLinks = {
      some: { personId, deletedAt: null },
    };
  }

  if (excludeSetId) {
    where.setMediaItems = {
      none: { setId: excludeSetId },
    };
  }

  if (excludeCollectionId) {
    where.collectionItems = {
      none: { collectionId: excludeCollectionId },
    };
  }

  const items = await prisma.mediaItem.findMany({
    where,
    include: {
      session: { select: { id: true, name: true } },
      personMediaLinks: {
        where: { deletedAt: null },
        select: {
          person: {
            select: {
              id: true,
              icgId: true,
              aliases: { where: { type: "common", deletedAt: null }, take: 1 },
            },
          },
        },
        take: 3,
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });

  const hasMore = items.length > limit;
  const results = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? results[results.length - 1]!.id : null;

  const mapped = results.map((item) => {
    const variants = (item.variants as PhotoVariants) ?? {};
    const thumbUrl = variants.gallery_512
      ? buildUrl(variants.gallery_512)
      : item.fileRef
        ? buildUrl(item.fileRef)
        : "";

    return {
      id: item.id,
      filename: item.filename,
      mimeType: item.mimeType,
      originalWidth: item.originalWidth,
      originalHeight: item.originalHeight,
      thumbUrl,
      sessionId: item.sessionId,
      sessionName: item.session?.name ?? null,
      persons: Object.values(
        Object.fromEntries(
          item.personMediaLinks.map((link) => [
            link.person.id,
            {
              id: link.person.id,
              icgId: link.person.icgId,
              name: link.person.aliases[0]?.name ?? null,
            },
          ]),
        ),
      ),
      createdAt: item.createdAt,
    };
  });

  return NextResponse.json({ items: mapped, nextCursor });
}
