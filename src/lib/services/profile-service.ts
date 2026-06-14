/**
 * Profile framings (ADR-0016) — the person browser view of the Profile category
 * group. Replaces the legacy slot state. Per Profile category: the person's images
 * + the effective representative (explicit, else most recent). The avatar is the
 * representative of the avatar-source (Headshot) category.
 */
import { prisma } from "@/lib/db";
import { buildUrl } from "@/lib/media-url";
import { PROFILE_GROUP_ID } from "@/lib/services/category-service";
import type { PhotoVariants } from "@/lib/types";

function thumbUrl(variants: unknown, fileRef: string | null): string | null {
  const v = (variants ?? {}) as PhotoVariants;
  const key = v.gallery_512 ?? v.view_1200 ?? fileRef ?? null;
  return key ? buildUrl(key) : null;
}

export type ProfileFramingImage = {
  mediaItemId: string;
  thumbUrl: string | null;
  isAligned: boolean;
  isHd: boolean;
  isRepresentative: boolean;
  focalX: number | null;
  focalY: number | null;
};

export type ProfileFraming = {
  categoryId: string;
  name: string;
  isAvatarSource: boolean;
  aspectW: number;
  aspectH: number;
  hasTemplate: boolean;
  images: ProfileFramingImage[];
  repMediaItemId: string | null;
};

export async function getPersonProfileFramings(personId: string): Promise<ProfileFraming[]> {
  const cats = await prisma.mediaCategory.findMany({
    where: { groupId: PROFILE_GROUP_ID },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      isAvatarSource: true,
      alignmentTemplateId: true,
      alignmentTemplate: { select: { aspectW: true, aspectH: true } },
    },
  });
  if (cats.length === 0) return [];

  const links = await prisma.personMediaLink.findMany({
    where: { personId, usage: "DETAIL", categoryId: { in: cats.map((c) => c.id) } },
    orderBy: [{ isRepresentative: "desc" }, { createdAt: "desc" }],
    select: {
      categoryId: true,
      isRepresentative: true,
      mediaItem: { select: { id: true, variants: true, fileRef: true, motifTemplateId: true, bakeSource: true, focalX: true, focalY: true } },
    },
  });

  const byCat = new Map<string, ProfileFramingImage[]>();
  for (const l of links) {
    if (!l.categoryId) continue;
    const arr = byCat.get(l.categoryId) ?? [];
    arr.push({
      mediaItemId: l.mediaItem.id,
      thumbUrl: thumbUrl(l.mediaItem.variants, l.mediaItem.fileRef),
      isAligned: l.mediaItem.motifTemplateId != null,
      isHd: l.mediaItem.bakeSource === "ORIGINAL",
      isRepresentative: l.isRepresentative,
      focalX: l.mediaItem.focalX,
      focalY: l.mediaItem.focalY,
    });
    byCat.set(l.categoryId, arr);
  }

  return cats.map((c) => {
    const images = byCat.get(c.id) ?? [];
    const rep = images.find((i) => i.isRepresentative) ?? images[0] ?? null;
    return {
      categoryId: c.id,
      name: c.name,
      isAvatarSource: c.isAvatarSource,
      aspectW: c.alignmentTemplate?.aspectW ?? 2,
      aspectH: c.alignmentTemplate?.aspectH ?? 3,
      hasTemplate: c.alignmentTemplateId != null,
      images,
      repMediaItemId: rep?.mediaItemId ?? null,
    };
  });
}
