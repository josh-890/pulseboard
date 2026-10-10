import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { computeSha256 } from "@/lib/image-hash";
import { completeArchiveUpload, getUploadWorklist, uploadArchiveImage } from "@/lib/services/archive-upload-service";

// The archive upload agent's queue (2026-10-10): promoted photo sets that never had
// images, resumable when the agent was interrupted. Storage is not touched here —
// these cases stop before the upload.

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

async function linkImage(key: string, hash: string) {
  const m = await prisma.mediaItem.create({
    data: { sessionId: ids[`${key}Session`], mediaType: "PHOTO", filename: "x.jpg", mimeType: "image/jpeg", size: 1, originalWidth: 1, originalHeight: 1, hash },
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
    expect((await queued()).sort()).toEqual([ids.empty, ids.resumed].sort());
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
});
