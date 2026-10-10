import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { computeDHash, computeSha256 } from "@/lib/image-hash";
import { uploadPhotoToStorage } from "@/lib/media-upload";
import { createMediaItemDirect } from "./media-service";

// The archive upload agent (scripts/archive-upload.ps1, 2026-10-10): fills a
// promoted photo set with the images of its archive folder, the same way a manual
// upload into the set does. Only sets that never had images are queued
// (`Set.firstMediaAt`, set by a trigger on the first SetMediaItem from any route);
// a set the agent started and did not finish stays queued so a re-run resumes it.
// Stub folders (a known-incomplete copy, ADR-0032) and video sets are left out.

export type UploadWorkItem = {
  setId: string;
  title: string;
  folderPath: string;
  folderName: string;
  /** Images the scan counted in the folder */
  fileCount: number | null;
  /** The agent started this set before and did not finish — resume */
  resume: boolean;
};

/** Sets waiting for their archive images, oldest promotion first */
export async function getUploadWorklist(opts: { setId?: string; limit?: number } = {}): Promise<UploadWorkItem[]> {
  const sets = await prisma.set.findMany({
    where: {
      ...(opts.setId ? { id: opts.setId } : {}),
      sessionLinks: { some: { isPrimary: true } },
      archiveLinks: {
        some: { status: "CONFIRMED", archiveFolder: { isVideo: false, missingOnDisk: false, stubSince: null } },
      },
      OR: [
        // The staging cover copied in at promotion does not count as an upload
        { firstMediaAt: null, setMediaItems: { none: { mediaItem: { isTransferredCover: false } } } },
        { archiveUploadStartedAt: { not: null }, archiveUploadDoneAt: null },
      ],
    },
    orderBy: [{ mediaPriority: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
    take: opts.limit && opts.limit > 0 ? opts.limit : undefined,
    select: {
      id: true,
      title: true,
      archiveUploadStartedAt: true,
      archiveLinks: {
        where: { status: "CONFIRMED" },
        select: { archiveFolder: { select: { fullPath: true, folderName: true, fileCount: true } } },
        take: 1,
      },
    },
  });
  return sets.flatMap((s) => {
    const folder = s.archiveLinks[0]?.archiveFolder;
    if (!folder) return [];
    return [
      {
        setId: s.id,
        title: s.title,
        folderPath: folder.fullPath,
        folderName: folder.folderName,
        fileCount: folder.fileCount,
        resume: s.archiveUploadStartedAt !== null,
      },
    ];
  });
}

export type ArchiveImageResult =
  | { status: "uploaded"; mediaItemId: string }
  | { status: "skipped"; reason: "already-in-set" }
  | { status: "refused"; reason: string };

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * One archive image into its set — the manual upload path without its duplicate
 * dialog: an image already in the set (same SHA-256) is skipped, which is what
 * makes an interrupted run safe to repeat. Sharp stays strict; a file it cannot
 * decode throws and is reported by the agent, never "repaired" here.
 */
export async function uploadArchiveImage(input: {
  setId: string;
  filename: string;
  mimeType: string;
  sortOrder: number;
  buffer: Buffer;
}): Promise<ArchiveImageResult> {
  if (!IMAGE_TYPES.has(input.mimeType)) return { status: "refused", reason: `not an image type: ${input.mimeType}` };
  const set = await prisma.set.findUnique({
    where: { id: input.setId },
    select: {
      firstMediaAt: true,
      archiveUploadStartedAt: true,
      archiveUploadDoneAt: true,
      sessionLinks: { where: { isPrimary: true }, select: { sessionId: true }, take: 1 },
    },
  });
  if (!set) return { status: "refused", reason: "set not found" };
  const sessionId = set.sessionLinks[0]?.sessionId;
  if (!sessionId) return { status: "refused", reason: "set has no primary session" };
  const agentRun = set.archiveUploadStartedAt !== null && set.archiveUploadDoneAt === null;
  if (!agentRun) {
    // Only a set that never had images may be started — never fill a set you
    // have already worked on by hand
    if (set.firstMediaAt !== null) return { status: "refused", reason: "set already has (or had) images" };
    await prisma.set.update({ where: { id: input.setId }, data: { archiveUploadStartedAt: new Date() } });
  }

  const hash = computeSha256(input.buffer);
  const existing = await prisma.setMediaItem.findFirst({
    where: { setId: input.setId, mediaItem: { hash } },
    select: { mediaItemId: true },
  });
  if (existing) return { status: "skipped", reason: "already-in-set" };

  const phash = await computeDHash(input.buffer);
  const stored = await uploadPhotoToStorage(input.buffer, input.mimeType, "session", sessionId, randomUUID());
  const item = await createMediaItemDirect({
    sessionId,
    setId: input.setId,
    filename: input.filename,
    mimeType: input.mimeType,
    size: input.buffer.length,
    originalWidth: stored.originalWidth,
    originalHeight: stored.originalHeight,
    variants: stored.variants,
    sortOrder: input.sortOrder,
    usage: "PORTFOLIO",
    hash,
    phash,
  });
  return { status: "uploaded", mediaItemId: item.id };
}

/** The agent went through every file of the set; `failed` are the names it could not upload */
export async function completeArchiveUpload(setId: string, failed: string[]): Promise<void> {
  await prisma.set.update({
    where: { id: setId },
    data: { archiveUploadDoneAt: new Date(), archiveUploadFailed: failed.slice(0, 500) },
  });
}
