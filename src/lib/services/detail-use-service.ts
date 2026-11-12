import { prisma } from "@/lib/db";
import { parsePhotoVariants, type PhotoVariants } from "@/lib/types";
import { buildPhotoUrls } from "@/lib/media-url";
import { copyMediaToReferenceSession, ensureReferenceSession } from "./media-service";
import { getDisplayName } from "@/lib/utils";

// Where an image is already used in a person's detail categories (2026-11-12).
//
// Assigning a photo to a detail category copies it into the person's reference
// session (one DETAIL link per media item per person, so a second category needs
// a second copy). Nothing used to tell you the photo was there already. "The same
// image" is recognised by:
//   - the item itself, when it already sits in the reference session;
//   - a reference-session item with the same byte hash (copies carry the hash —
//     it survives copies of copies and the same file in two sets);
//   - a reference-session item copied from it (copiedFromMediaItemId);
// and its Aligned images by motifProvenance.sourceMediaItemId pointing at the
// image or any item with the same hash.

export type DetailUseKind = "copy" | "aligned";

export type DetailUse = {
  mediaItemId: string;
  kind: DetailUseKind;
  categoryId: string | null; // null = in the reference session, no detail category
  categoryName: string | null;
  linkedAt: Date | null;
  thumbUrl: string;
};

function thumbOf(variants: unknown, fileRef: string | null): string {
  const v = parsePhotoVariants(variants) ?? ({} as PhotoVariants);
  const u = buildPhotoUrls(v, fileRef);
  return u.gallery_512 ?? u.view_1200 ?? u.original ?? "";
}

export async function getDetailUsesOfImage(personId: string, sourceMediaItemId: string): Promise<DetailUse[]> {
  const [source, refSession] = await Promise.all([
    prisma.mediaItem.findUnique({ where: { id: sourceMediaItemId }, select: { id: true, hash: true } }),
    prisma.session.findUnique({ where: { personId }, select: { id: true } }),
  ]);
  if (!source || !refSession) return [];

  // Every item that is this same image anywhere — the possible alignment sources.
  const sameImageIds = new Set<string>([source.id]);
  if (source.hash) {
    const sameHash = await prisma.mediaItem.findMany({ where: { hash: source.hash }, select: { id: true } });
    for (const s of sameHash) sameImageIds.add(s.id);
  }

  const copies = await prisma.mediaItem.findMany({
    where: {
      sessionId: refSession.id,
      motifTemplateId: null,
      OR: [
        { id: source.id },
        { copiedFromMediaItemId: { in: [...sameImageIds] } },
        ...(source.hash ? [{ hash: source.hash }] : []),
      ],
    },
    select: { id: true, variants: true, fileRef: true },
  });

  const aligned = await prisma.$queryRaw<{ id: string; variants: unknown; fileRef: string | null }[]>`
    SELECT id, variants, "fileRef"
    FROM "MediaItem"
    WHERE "sessionId" = ${refSession.id}
      AND "motifTemplateId" IS NOT NULL
      AND "motifProvenance"->>'sourceMediaItemId' = ANY(${[...sameImageIds]}::text[])
  `;

  const itemIds = [...copies.map((c) => c.id), ...aligned.map((a) => a.id)];
  if (itemIds.length === 0) return [];

  const links = await prisma.personMediaLink.findMany({
    where: { personId, usage: "DETAIL", mediaItemId: { in: itemIds } },
    select: { mediaItemId: true, categoryId: true, createdAt: true, category: { select: { name: true } } },
  });
  const linkByItem = new Map(links.map((l) => [l.mediaItemId, l]));

  const uses: DetailUse[] = [];
  for (const [kind, rows] of [["copy", copies], ["aligned", aligned]] as const) {
    for (const r of rows) {
      const link = linkByItem.get(r.id);
      uses.push({
        mediaItemId: r.id,
        kind,
        categoryId: link?.categoryId ?? null,
        categoryName: link?.category?.name ?? null,
        linkedAt: link?.createdAt ?? null,
        thumbUrl: thumbOf(r.variants, r.fileRef),
      });
    }
  }
  return uses;
}

export type PersonDetailUse = {
  personId: string;
  personName: string; // Name (ICG-ID)
  categoryName: string;
  kind: DetailUseKind;
};

/** The lightbox's "Used in details": every person whose detail categories hold this image. */
export async function getDetailUsesAcrossPeople(sourceMediaItemId: string): Promise<PersonDetailUse[]> {
  const source = await prisma.mediaItem.findUnique({ where: { id: sourceMediaItemId }, select: { id: true, hash: true } });
  if (!source) return [];
  const sameImageIds = new Set<string>([source.id]);
  if (source.hash) {
    const sameHash = await prisma.mediaItem.findMany({ where: { hash: source.hash }, select: { id: true } });
    for (const s of sameHash) sameImageIds.add(s.id);
  }
  const ids = [...sameImageIds];
  const aligned = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "MediaItem"
    WHERE "motifTemplateId" IS NOT NULL
      AND "motifProvenance"->>'sourceMediaItemId' = ANY(${ids}::text[])
  `;
  const alignedIds = new Set(aligned.map((a) => a.id));
  const links = await prisma.personMediaLink.findMany({
    where: {
      usage: "DETAIL",
      categoryId: { not: null },
      mediaItem: { session: { type: "REFERENCE" } },
      OR: [
        { mediaItemId: { in: [...ids, ...alignedIds] } },
        { mediaItem: { copiedFromMediaItemId: { in: ids } } },
      ],
    },
    select: {
      personId: true,
      mediaItemId: true,
      category: { select: { name: true } },
      person: { select: { icgId: true, aliases: { where: { isCommon: true }, take: 1, select: { name: true } } } },
    },
  });
  const seen = new Set<string>();
  const out: PersonDetailUse[] = [];
  for (const l of links) {
    const kind: DetailUseKind = alignedIds.has(l.mediaItemId) ? "aligned" : "copy";
    const categoryName = l.category?.name ?? "";
    const key = `${l.personId}:${categoryName}:${kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      personId: l.personId,
      personName: getDisplayName(l.person.aliases[0]?.name ?? null, l.person.icgId),
      categoryName,
      kind,
    });
  }
  return out.sort((a, b) => a.personName.localeCompare(b.personName) || a.categoryName.localeCompare(b.categoryName));
}

/** Per source image: is it already a copy in / aligned into this category? (picker badges) */
export async function getCategoryUseMarks(
  personId: string,
  categoryId: string,
  sourceMediaItemIds: string[],
): Promise<Record<string, DetailUseKind[]>> {
  if (sourceMediaItemIds.length === 0) return {};
  const sources = await prisma.mediaItem.findMany({
    where: { id: { in: sourceMediaItemIds } },
    select: { id: true, hash: true },
  });
  const links = await prisma.personMediaLink.findMany({
    where: { personId, usage: "DETAIL", categoryId },
    select: {
      mediaItem: {
        select: { id: true, hash: true, copiedFromMediaItemId: true, motifTemplateId: true, motifProvenance: true },
      },
    },
  });
  // Hashes of the items an aligned image in this category was baked from.
  const alignedSourceIds = new Set<string>();
  const copyHashes = new Set<string>();
  const copyIds = new Set<string>();
  for (const { mediaItem: m } of links) {
    if (m.motifTemplateId) {
      const p = m.motifProvenance as { sourceMediaItemId?: unknown } | null;
      if (p && typeof p.sourceMediaItemId === "string") alignedSourceIds.add(p.sourceMediaItemId);
    } else {
      copyIds.add(m.id);
      if (m.copiedFromMediaItemId) copyIds.add(m.copiedFromMediaItemId);
      if (m.hash) copyHashes.add(m.hash);
    }
  }
  const alignedSourceHashes = new Set<string>();
  if (alignedSourceIds.size > 0) {
    const rows = await prisma.mediaItem.findMany({
      where: { id: { in: [...alignedSourceIds] }, hash: { not: null } },
      select: { hash: true },
    });
    for (const r of rows) if (r.hash) alignedSourceHashes.add(r.hash);
  }

  const marks: Record<string, DetailUseKind[]> = {};
  for (const s of sources) {
    const kinds: DetailUseKind[] = [];
    if (copyIds.has(s.id) || (s.hash && copyHashes.has(s.hash))) kinds.push("copy");
    if (alignedSourceIds.has(s.id) || (s.hash && alignedSourceHashes.has(s.hash))) kinds.push("aligned");
    if (kinds.length > 0) marks[s.id] = kinds;
  }
  return marks;
}

export type DetailDuplicateItem = {
  mediaItemId: string;
  thumbUrl: string;
  filename: string;
  linkedAt: Date;
  isRepresentative: boolean;
  // An Aligned image was baked from it — deleting it would break re-bakes.
  isAlignSource: boolean;
  // Its other uses for this person (e.g. PROFILE) — they go with it on delete.
  otherUsages: string[];
};

export type DetailDuplicateGroup = {
  categoryId: string;
  hash: string;
  items: DetailDuplicateItem[];
};

/** Same file twice or more in one detail category (copies only — not aligned bakes). */
export async function getDetailDuplicates(personId: string): Promise<DetailDuplicateGroup[]> {
  const links = await prisma.personMediaLink.findMany({
    where: { personId, usage: "DETAIL", categoryId: { not: null }, mediaItem: { hash: { not: null }, motifTemplateId: null } },
    select: {
      categoryId: true,
      createdAt: true,
      isRepresentative: true,
      mediaItem: { select: { id: true, hash: true, filename: true, variants: true, fileRef: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const byKey = new Map<string, typeof links>();
  for (const l of links) {
    const key = `${l.categoryId}:${l.mediaItem.hash}`;
    const list = byKey.get(key) ?? [];
    list.push(l);
    byKey.set(key, list);
  }
  const dupLinks = [...byKey.values()].filter((list) => list.length > 1);
  if (dupLinks.length === 0) return [];

  const itemIds = dupLinks.flat().map((l) => l.mediaItem.id);
  const [alignSources, otherLinks] = await Promise.all([
    prisma.$queryRaw<{ src: string }[]>`
      SELECT DISTINCT "motifProvenance"->>'sourceMediaItemId' AS src
      FROM "MediaItem"
      WHERE "motifTemplateId" IS NOT NULL
        AND "motifProvenance"->>'sourceMediaItemId' = ANY(${itemIds}::text[])
    `,
    prisma.personMediaLink.findMany({
      where: { personId, mediaItemId: { in: itemIds }, usage: { not: "DETAIL" } },
      select: { mediaItemId: true, usage: true },
    }),
  ]);
  const alignSourceIds = new Set(alignSources.map((a) => a.src));
  const usagesByItem = new Map<string, string[]>();
  for (const o of otherLinks) usagesByItem.set(o.mediaItemId, [...(usagesByItem.get(o.mediaItemId) ?? []), o.usage]);

  return dupLinks.map((list) => ({
    categoryId: list[0].categoryId as string,
    hash: list[0].mediaItem.hash as string,
    items: list.map((l) => ({
      mediaItemId: l.mediaItem.id,
      thumbUrl: thumbOf(l.mediaItem.variants, l.mediaItem.fileRef),
      filename: l.mediaItem.filename,
      linkedAt: l.createdAt,
      isRepresentative: l.isRepresentative,
      isAlignSource: alignSourceIds.has(l.mediaItem.id),
      otherUsages: usagesByItem.get(l.mediaItem.id) ?? [],
    })),
  }));
}

// Assign a photo to a person's detail category (the lightbox "D" sheet and the
// Details tab's "from another session"). A photo from elsewhere is copied into
// the reference session; one already there is linked directly (and may MOVE
// category — @@unique([personId, mediaItemId, usage])). Refuses with
// ALREADY_IN_CATEGORY when the same image is already in this category, unless
// forced; reuses an uncategorised copy instead of copying the files again.
export type AssignToDetailResult =
  | {
      success: true;
      assignedMediaItemId: string;
      copied: boolean;
      moved: boolean;
      movedFromCategoryId: string | null;
      personName: string;
      // Other detail categories that already hold this same image (for the toast).
      alsoIn: string[];
    }
  | { success: false; error: string; code?: undefined }
  // The same image is already in this category — nothing was added. Call again
  // with `force` to add it anyway ("Add again anyway").
  | { success: false; error: string; code: "ALREADY_IN_CATEGORY"; existing: DetailUse[]; personName: string };

export async function assignImageToDetailCategory(
  sourceMediaItemId: string,
  personId: string,
  categoryId: string,
  opts: {
    force?: boolean;
    // A reference-session photo already in another category is copied rather
    // than moved (the Details tab's "Save as copy" keeps it where it was).
    copyIfLinkedElsewhere?: boolean;
    // Body-feature categories also tie the link to one mark / modification.
    entity?: { field: "bodyMarkId" | "bodyModificationId" | "cosmeticProcedureId"; id: string };
  } = {},
): Promise<AssignToDetailResult> {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: {
      icgId: true,
      referenceSession: { select: { id: true } },
      aliases: { where: { isCommon: true }, take: 1, select: { name: true } },
    },
  });
  if (!person) return { success: false, error: "Person not found" };
  const personName = person.aliases[0]?.name ?? person.icgId;

  const refSessionId = person.referenceSession?.id ?? (await ensureReferenceSession(personId));

  const source = await prisma.mediaItem.findUnique({
    where: { id: sourceMediaItemId },
    select: { sessionId: true },
  });
  if (!source) return { success: false, error: "Source image not found" };

  // Is this same image already used for this person? (2026-11-12)
  const uses = await getDetailUsesOfImage(personId, sourceMediaItemId);
  const copyUses = uses.filter((u) => u.kind === "copy");
  const here = copyUses.filter((u) => u.categoryId === categoryId);
  if (here.length > 0 && !opts.force) {
    return {
      success: false,
      code: "ALREADY_IN_CATEGORY",
      error: "This photo is already in this category",
      existing: here,
      personName,
    };
  }
  const alsoIn = [
    ...new Set(
      uses.filter((u) => u.categoryId && u.categoryId !== categoryId && u.categoryName).map((u) => u.categoryName as string),
    ),
  ];

  let assignedMediaItemId = sourceMediaItemId;
  let copied = false;
  // Forced repeat of a reference-session photo already in this category: the
  // one DETAIL link per item can't hold it twice, so it takes a copy.
  const forcedSelfRepeat = source.sessionId === refSessionId && here.some((u) => u.mediaItemId === sourceMediaItemId);
  const keepElsewhere =
    !!opts.copyIfLinkedElsewhere &&
    source.sessionId === refSessionId &&
    uses.some((u) => u.mediaItemId === sourceMediaItemId && u.categoryId !== null && u.categoryId !== categoryId);
  if (forcedSelfRepeat || keepElsewhere) {
    assignedMediaItemId = await copyMediaToReferenceSession(sourceMediaItemId, refSessionId);
    copied = true;
  } else if (source.sessionId !== refSessionId) {
    // A copy already in the reference session without a detail category is
    // reused — no second set of files.
    const unlinked = copyUses.find((u) => u.categoryId === null);
    if (unlinked) {
      assignedMediaItemId = unlinked.mediaItemId;
    } else {
      assignedMediaItemId = await copyMediaToReferenceSession(sourceMediaItemId, refSessionId);
      copied = true;
    }
  }

  // Upsert the DETAIL link on the assigned item (copy = always new; direct =
  // may move an existing assignment to a different category).
  let moved = false;
  let movedFromCategoryId: string | null = null;
  const entityData = opts.entity ? { [opts.entity.field]: opts.entity.id } : {};
  const existing = await prisma.personMediaLink.findFirst({
    where: { personId, mediaItemId: assignedMediaItemId, usage: "DETAIL" },
    select: { id: true, categoryId: true },
  });
  if (existing) {
    if (existing.categoryId && existing.categoryId !== categoryId) {
      moved = true;
      movedFromCategoryId = existing.categoryId;
    }
    await prisma.personMediaLink.update({ where: { id: existing.id }, data: { categoryId, ...entityData } });
  } else {
    await prisma.personMediaLink.create({
      data: { personId, mediaItemId: assignedMediaItemId, usage: "DETAIL", categoryId, ...entityData },
    });
  }

  return { success: true, assignedMediaItemId, copied, moved, movedFromCategoryId, personName, alsoIn };
}
