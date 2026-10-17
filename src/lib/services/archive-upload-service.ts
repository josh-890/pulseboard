import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { computeDHash, computeSha256 } from "@/lib/image-hash";
import { deleteMediaFiles, uploadPhotoToStorage } from "@/lib/media-upload";
import type { PhotoVariants } from "@/lib/types";
import { createMediaItemDirect, replaceMediaItemFile } from "./media-service";
import { withoutArrived } from "./archive-upload-failed";

// The archive upload agent (scripts/archive-upload.ps1, 2026-10-10): fills a
// promoted photo set with the images of its archive folder, the same way a manual
// upload into the set does. Only sets that never had images are queued
// (`Set.firstMediaAt`, set by a trigger on the first SetMediaItem from any route);
// a set the agent started and did not finish stays queued so a re-run resumes it.
// A finished set comes back for just the images whose copy arrived incomplete
// (MediaItem.archiveRetry) — every run fetches them again until they are whole.
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
  /**
   * A finished set back in the queue only to fetch these files again (their copy
   * arrived incomplete): send just these, and do not report the set done again.
   * Null = a full pass over the folder.
   */
  retryFiles: string[] | null;
};

/** A copy to fetch again: marked, and still flagged damaged */
const RETRY = { archiveRetry: true, decodeIssue: { not: null } } as const;

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
        // Only while the copy is still flagged: a repair by an older server left
        // archiveRetry behind on clean images (2026-10-15)
        { archiveUploadStartedAt: { not: null }, setMediaItems: { some: { mediaItem: RETRY } } },
      ],
    },
    orderBy: [{ mediaPriority: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
    take: opts.limit && opts.limit > 0 ? opts.limit : undefined,
    select: {
      id: true,
      title: true,
      archiveUploadStartedAt: true,
      archiveUploadDoneAt: true,
      archiveLinks: {
        where: { status: "CONFIRMED" },
        select: { archiveFolder: { select: { fullPath: true, folderName: true, fileCount: true } } },
        take: 1,
      },
      setMediaItems: { where: { mediaItem: RETRY }, select: { mediaItem: { select: { filename: true } } } },
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
        retryFiles:
          s.archiveUploadDoneAt !== null && s.setMediaItems.length > 0
            ? s.setMediaItems.map((l) => l.mediaItem.filename)
            : null,
      },
    ];
  });
}

export type ArchiveImageResult =
  | { status: "uploaded"; mediaItemId: string; decodeIssue?: string; archiveRetry?: boolean; replaced?: boolean }
  | { status: "skipped"; reason: "already-in-set" }
  | { status: "refused"; reason: string };

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** The body the route received is shorter than the request declared */
export type IncompleteBody = { received: number; declared: number };

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

/**
 * One archive image into its set — the manual upload path without its duplicate
 * dialog: an image already in the set (same SHA-256, or the same file name — a
 * copy uploaded by hand through the browser is re-encoded, so its hash differs)
 * is skipped, which is what makes an interrupted or re-queued run safe to repeat.
 *
 * A damaged file (truncated / corrupt data) is stored decoded leniently and
 * flagged (MediaItem.decodeIssue) — you see at a glance what is there and what is
 * missing. A body that arrived incomplete (`incomplete`) is stored the same way
 * and also marked `archiveRetry`: the original is fine, so the next run sends it
 * again. A same-named copy still flagged damaged is not skipped but replaced with
 * this file, which is how such a copy repairs itself. Only a file that is not an
 * image at all throws and is reported by the agent.
 */
export async function uploadArchiveImage(input: {
  setId: string;
  filename: string;
  mimeType: string;
  sortOrder: number;
  buffer: Buffer;
  incomplete?: IncompleteBody;
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

  const hash = computeSha256(input.buffer);
  const existing = await prisma.setMediaItem.findFirst({
    where: { setId: input.setId, mediaItem: { OR: [{ hash }, { filename: input.filename }] } },
    select: { mediaItemId: true, mediaItem: { select: { hash: true, decodeIssue: true, variants: true } } },
  });
  // Repairing a flagged copy is allowed in any set — also one the agent finished
  const repair = existing !== null && existing.mediaItem.decodeIssue !== null && existing.mediaItem.hash !== hash;
  if (existing && !repair) return { status: "skipped", reason: "already-in-set" };

  const agentRun = set.archiveUploadStartedAt !== null && set.archiveUploadDoneAt === null;
  if (!repair && !agentRun) {
    // Only a set that never had images may be started — never fill a set you
    // have already worked on by hand
    if (set.firstMediaAt !== null) return { status: "refused", reason: "set already has (or had) images" };
    await prisma.set.update({ where: { id: input.setId }, data: { archiveUploadStartedAt: new Date() } });
  }

  const phash = await computeDHash(input.buffer);
  const stored = await uploadPhotoToStorage(input.buffer, input.mimeType, "session", sessionId, randomUUID(), {
    lenient: true,
  });
  const archiveRetry = input.incomplete !== undefined;
  const decodeIssue = input.incomplete
    ? `Arrived incomplete (${mb(input.incomplete.received)} of ${mb(input.incomplete.declared)} MB) — the next archive upload run fetches it again`
    : stored.decodeIssue;
  const file = {
    variants: stored.variants,
    size: input.buffer.length,
    originalWidth: stored.originalWidth,
    originalHeight: stored.originalHeight,
    hash,
    phash,
    filename: input.filename,
    mimeType: input.mimeType,
    decodeIssue,
    archiveRetry,
  };
  const flags = { ...(decodeIssue ? { decodeIssue } : {}), ...(archiveRetry ? { archiveRetry } : {}) };

  if (existing && repair) {
    await replaceMediaItemFile(existing.mediaItemId, file);
    await deleteMediaFiles([existing.mediaItem.variants as PhotoVariants]);
    return { status: "uploaded", mediaItemId: existing.mediaItemId, replaced: true, ...flags };
  }
  const item = await createMediaItemDirect({
    ...file,
    sessionId,
    setId: input.setId,
    sortOrder: input.sortOrder,
    usage: "PORTFOLIO",
  });
  return { status: "uploaded", mediaItemId: item.id, ...flags };
}

/** The workflow tag a finished agent upload carries until you have checked the set */
export const AUTO_UPLOAD_TODO_TAG = "auto-uploaded";

/**
 * The agent went through every file of the set; `failed` are the names it could
 * not upload. The set gets the to-do tag `auto-uploaded` (2026-10-16), so it shows
 * on the To-do tab of /tags and under `workflow:auto-uploaded` in the browsers until you remove it. Only
 * the first finish tags: a re-fetch run never calls this, so a to-do you closed
 * stays closed.
 */
export async function completeArchiveUpload(setId: string, failed: string[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // A file already in the set (uploaded by hand meanwhile) is no longer missing
    const inSet = await tx.mediaItem.findMany({
      where: { setMediaItems: { some: { setId } } },
      select: { filename: true },
    });
    const missing = withoutArrived(failed, inSet.map((m) => m.filename));
    await tx.set.update({
      where: { id: setId },
      data: { archiveUploadDoneAt: new Date(), archiveUploadFailed: missing.slice(0, 500) },
    });
    const group = await tx.tagGroup.upsert({
      where: { slug: "workflow" },
      create: {
        slug: "workflow",
        name: "Workflow",
        color: "#f97316",
        description: "To-do markers — remove when done; never inherited",
        kind: "WORKFLOW",
      },
      update: {},
    });
    const tag = await tx.tagDefinition.upsert({
      where: { groupId_slug: { groupId: group.id, slug: AUTO_UPLOAD_TODO_TAG } },
      create: {
        groupId: group.id,
        name: AUTO_UPLOAD_TODO_TAG,
        slug: AUTO_UPLOAD_TODO_TAG,
        nameNorm: AUTO_UPLOAD_TODO_TAG,
        description: "Filled by the archive upload agent — check and finish the set, then remove",
      },
      update: {},
    });
    await tx.setTag.createMany({
      data: [{ setId, tagDefinitionId: tag.id, source: "AUTO" }],
      skipDuplicates: true,
    });
  });
}
