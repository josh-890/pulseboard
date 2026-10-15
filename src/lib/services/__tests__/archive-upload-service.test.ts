import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { computeSha256 } from "@/lib/image-hash";
import { completeArchiveUpload, getUploadWorklist, uploadArchiveImage } from "@/lib/services/archive-upload-service";

// The archive upload agent's queue (2026-10-10): promoted photo sets that never had
// images, resumable when the agent was interrupted. Storage is not touched here —
// these cases stop before the upload.

// Storage is mocked for the repair case: it needs an upload, not MinIO
const storage = vi.hoisted(() => ({ deleted: [] as unknown[] }));
vi.mock("@/lib/media-upload", () => ({
  uploadPhotoToStorage: async () => ({
    variants: { gallery_512: "new/gallery_512.webp" }, originalWidth: 4000, originalHeight: 6000, decodeIssue: null,
  }),
  deleteMediaFiles: async (list: unknown[]) => { storage.deleted.push(...list); },
}));
vi.mock("@/lib/image-hash", async (orig) => ({
  ...(await orig<typeof import("@/lib/image-hash")>()),
  computeDHash: async () => "0000000000000000",
}));

const RUN = `aus${Date.now().toString(36)}`;
const ids: Record<string, string> = {};
const created = { sets: [] as string[], sessions: [] as string[], folders: [] as string[], media: [] as string[] };

async function setWithFolder(key: string, folder: { isVideo?: boolean; stub?: boolean } = {}) {
  const session = await prisma.session.create({ data: { name: `${RUN} ${key}` } });
  const set = await prisma.set.create({ data: { type: "photo", title: `${RUN} ${key}` } });
  await prisma.setSession.create({ data: { setId: set.id, sessionId: session.id, isPrimary: true } });
  const f = await prisma.archiveFolder.create({
    data: {
      fullPath: `X:\\${RUN}\\${key}`,
      folderName: key,
      isVideo: folder.isVideo ?? false,
      scannedAt: new Date(),
      tenant: "default",
      stubSince: folder.stub ? new Date() : null,
    },
  });
  await prisma.archiveLink.create({ data: { archiveFolderId: f.id, setId: set.id, status: "CONFIRMED", tenant: "default" } });
  created.sets.push(set.id);
  created.sessions.push(session.id);
  created.folders.push(f.id);
  ids[key] = set.id;
  ids[`${key}Session`] = session.id;
}

async function linkImage(key: string, hash: string, isTransferredCover = false) {
  const m = await prisma.mediaItem.create({
    data: {
      sessionId: ids[`${key}Session`],
      mediaType: "PHOTO",
      filename: isTransferredCover ? "cover.jpg" : "x.jpg",
      mimeType: "image/jpeg",
      size: 1,
      originalWidth: 1,
      originalHeight: 1,
      hash,
      isTransferredCover,
    },
  });
  created.media.push(m.id);
  await prisma.setMediaItem.create({ data: { setId: ids[key], mediaItemId: m.id } });
}

beforeAll(async () => {
  await setWithFolder("empty");
  await setWithFolder("video", { isVideo: true });
  await setWithFolder("stub", { stub: true });
  await setWithFolder("filled");
  await linkImage("filled", "h-filled");
  await setWithFolder("resumed");
  // Promotion copies the staged set's cover in — that is not an upload
  await setWithFolder("promoted");
  await linkImage("promoted", "h-promoted-cover", true);
});

afterAll(async () => {
  await prisma.setMediaItem.deleteMany({ where: { setId: { in: created.sets } } });
  await prisma.mediaItem.deleteMany({ where: { id: { in: created.media } } });
  await prisma.archiveLink.deleteMany({ where: { archiveFolderId: { in: created.folders } } });
  await prisma.archiveFolder.deleteMany({ where: { id: { in: created.folders } } });
  await prisma.setSession.deleteMany({ where: { setId: { in: created.sets } } });
  await prisma.set.deleteMany({ where: { id: { in: created.sets } } });
  await prisma.session.deleteMany({ where: { id: { in: created.sessions } } });
});

const queued = async () => (await getUploadWorklist()).map((w) => w.setId).filter((id) => created.sets.includes(id));

describe("the queue", () => {
  it("holds empty photo sets only — not video sets, not stubs, not sets with images", async () => {
    expect((await queued()).sort()).toEqual([ids.empty, ids.resumed, ids.promoted].sort());
  });

  it("does not count the cover transferred at promotion as an upload", async () => {
    const set = await prisma.set.findUniqueOrThrow({ where: { id: ids.promoted } });
    expect(set.firstMediaAt).toBeNull();
    expect(await queued()).toContain(ids.promoted);
  });

  it("stamps the first real image in UTC, like every other timestamp", async () => {
    const before = Date.now();
    await linkImage("promoted", "h-promoted-real");
    const set = await prisma.set.findUniqueOrThrow({ where: { id: ids.promoted } });
    expect(Math.abs(set.firstMediaAt!.getTime() - before)).toBeLessThan(60_000);
    expect(await queued()).not.toContain(ids.promoted);
  });

  it("remembers a first image for good (trigger), even after it is removed", async () => {
    const set = await prisma.set.findUniqueOrThrow({ where: { id: ids.filled } });
    expect(set.firstMediaAt).not.toBeNull();
    await prisma.setMediaItem.deleteMany({ where: { setId: ids.filled } });
    expect(await queued()).not.toContain(ids.filled);
  });

  it("keeps a set the agent started until it reports done", async () => {
    await prisma.set.update({ where: { id: ids.resumed }, data: { archiveUploadStartedAt: new Date() } });
    await linkImage("resumed", "h-resumed");
    const item = (await getUploadWorklist({ setId: ids.resumed }))[0];
    expect(item).toMatchObject({ setId: ids.resumed, resume: true });

    await completeArchiveUpload(ids.resumed, ["bad.jpg (Corrupt JPEG data)"]);
    expect(await queued()).not.toContain(ids.resumed);
    const set = await prisma.set.findUniqueOrThrow({ where: { id: ids.resumed } });
    expect(set.archiveUploadFailed).toEqual(["bad.jpg (Corrupt JPEG data)"]);
  });
});

describe("uploadArchiveImage — before the upload", () => {
  it("refuses a set that already had images by hand", async () => {
    const r = await uploadArchiveImage({ setId: ids.filled, filename: "a.jpg", mimeType: "image/jpeg", sortOrder: 0, buffer: Buffer.from("x") });
    expect(r).toEqual({ status: "refused", reason: "set already has (or had) images" });
  });

  it("refuses a non-image type", async () => {
    const r = await uploadArchiveImage({ setId: ids.empty, filename: "a.tif", mimeType: "image/tiff", sortOrder: 0, buffer: Buffer.from("x") });
    expect(r.status).toBe("refused");
  });

  it("skips an image already in the set (a resumed run), and marks the run started", async () => {
    const buffer = Buffer.from(`${RUN}-same-bytes`);
    await linkImage("empty", computeSha256(buffer));
    // The trigger set firstMediaAt; a run the agent started is still allowed on
    await prisma.set.update({ where: { id: ids.empty }, data: { archiveUploadStartedAt: new Date() } });
    const r = await uploadArchiveImage({ setId: ids.empty, filename: "a.jpg", mimeType: "image/jpeg", sortOrder: 0, buffer });
    expect(r).toEqual({ status: "skipped", reason: "already-in-set" });
  });

  // 2026-10-14: a damaged file uploaded by hand through the browser is re-encoded
  // there, so its hash differs — a re-queued run must still not add it twice
  it("skips a file of the same name already in the set, even with other bytes", async () => {
    const r = await uploadArchiveImage({
      setId: ids.empty, filename: "x.jpg", mimeType: "image/jpeg", sortOrder: 0, buffer: Buffer.from(`${RUN}-other-bytes`),
    });
    expect(r).toEqual({ status: "skipped", reason: "already-in-set" });
  });

  // 2026-10-15: images over 10 MB arrived cut off (middleware body limit) and were
  // stored flagged damaged — a re-run replaces the flagged copy with the full file
  it("replaces a same-named copy still flagged damaged, and drops its old files", async () => {
    const m = await prisma.mediaItem.create({
      data: {
        sessionId: ids.emptySession, mediaType: "PHOTO", filename: "big.jpg", mimeType: "image/jpeg", size: 10485760,
        originalWidth: 4000, originalHeight: 6000, hash: "h-truncated", decodeIssue: "VipsJpeg: premature end of JPEG image",
        variants: { gallery_512: "old/gallery_512.webp" },
      },
    });
    created.media.push(m.id);
    await prisma.setMediaItem.create({ data: { setId: ids.empty, mediaItemId: m.id } });

    const buffer = Buffer.from(`${RUN}-full-file`);
    const r = await uploadArchiveImage({ setId: ids.empty, filename: "big.jpg", mimeType: "image/jpeg", sortOrder: 0, buffer });
    expect(r).toEqual({ status: "uploaded", mediaItemId: m.id, replaced: true });
    const after = await prisma.mediaItem.findUniqueOrThrow({ where: { id: m.id } });
    expect(after).toMatchObject({ decodeIssue: null, hash: computeSha256(buffer), size: buffer.length });
    expect(after.variants).toEqual({ gallery_512: "new/gallery_512.webp" });
    expect(storage.deleted).toEqual([{ gallery_512: "old/gallery_512.webp" }]);
    expect(await prisma.setMediaItem.count({ where: { setId: ids.empty, mediaItem: { filename: "big.jpg" } } })).toBe(1);
  });
});
