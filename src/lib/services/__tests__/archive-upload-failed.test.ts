import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { completeArchiveUpload } from "@/lib/services/archive-upload-service";
import { dismissArchiveUploadFailed, failedEntryIs, withoutArrived } from "@/lib/services/archive-upload-failed";
import { createMediaItemDirect } from "@/lib/services/media-service";
import { addExistingMediaToSet } from "@/lib/services/set-service";

// The agent's "did not upload" list clears itself (2026-10-17): "Sexy Candy" kept
// 52 entries ("…jpg (Can't reach database server …)") after every file had been
// uploaded by hand. Runs against the DEV database; rows carry RUN.

const RUN = `auf${Date.now().toString(36)}`;
const created = { sets: [] as string[], sessions: [] as string[], media: [] as string[] };
let sessionId = "";

async function setWithFailed(failed: string[]) {
  const set = await prisma.set.create({ data: { type: "photo", title: `${RUN} set`, archiveUploadFailed: failed } });
  created.sets.push(set.id);
  return set.id;
}

const failedOf = async (setId: string) =>
  (await prisma.set.findUniqueOrThrow({ where: { id: setId }, select: { archiveUploadFailed: true } })).archiveUploadFailed;

async function upload(setId: string | undefined, filename: string) {
  const m = await createMediaItemDirect({
    sessionId,
    setId,
    filename,
    mimeType: "image/jpeg",
    size: 1,
    originalWidth: 1,
    originalHeight: 1,
    variants: { master_4000: `${RUN}/${filename}` },
  });
  created.media.push(m.id);
  return m.id;
}

beforeAll(async () => {
  const session = await prisma.session.create({ data: { name: `${RUN} session` } });
  sessionId = session.id;
  created.sessions.push(session.id);
});

afterAll(async () => {
  await prisma.setTag.deleteMany({ where: { setId: { in: created.sets } } });
  await prisma.personMediaLink.deleteMany({ where: { mediaItemId: { in: created.media } } });
  await prisma.setMediaItem.deleteMany({ where: { setId: { in: created.sets } } });
  await prisma.mediaItem.deleteMany({ where: { id: { in: created.media } } });
  await prisma.setSession.deleteMany({ where: { setId: { in: created.sets } } });
  await prisma.set.deleteMany({ where: { id: { in: created.sets } } });
  await prisma.session.deleteMany({ where: { id: { in: created.sessions } } });
});

describe("matching an entry to a file", () => {
  it("knows the name before the reason, parentheses in the name included", () => {
    expect(failedEntryIs("a.jpg (Corrupt JPEG data)", "a.jpg")).toBe(true);
    expect(failedEntryIs("a (1).jpg (unsupported type)", "a (1).jpg")).toBe(true);
    expect(failedEntryIs("a.jpg", "a.jpg")).toBe(true);
    expect(failedEntryIs("a.jpg (x)", "a.jp")).toBe(false);
    expect(failedEntryIs("ba.jpg (x)", "a.jpg")).toBe(false);
  });

  it("keeps only the entries whose file has not arrived", () => {
    expect(withoutArrived(["a.jpg (x)", "b.jpg (y)", "c.tif (unsupported type)"], ["b.jpg", "z.jpg"])).toEqual([
      "a.jpg (x)",
      "c.tif (unsupported type)",
    ]);
  });
});

describe("the list clears itself", () => {
  it("an upload into the set takes its file's entry off", async () => {
    const setId = await setWithFailed(["001.jpg (\nCan't reach database server)", "002.jpg (\nCan't reach database server)"]);
    await upload(setId, "001.jpg");
    expect(await failedOf(setId)).toEqual(["002.jpg (\nCan't reach database server)"]);
    await upload(setId, "002.jpg");
    expect(await failedOf(setId)).toEqual([]);
  });

  it("adding an existing photo to the set counts too; other files stay listed", async () => {
    const setId = await setWithFailed(["003.jpg (x)", "004.jpg (y)"]);
    const loose = await upload(undefined, "003.jpg");
    await addExistingMediaToSet(setId, [loose]);
    expect(await failedOf(setId)).toEqual(["004.jpg (y)"]);
  });

  it("the agent's report leaves out files already uploaded by hand", async () => {
    const setId = await setWithFailed([]);
    await upload(setId, "005.jpg");
    await completeArchiveUpload(setId, ["005.jpg (Corrupt JPEG data)", "006.jpg (Corrupt JPEG data)"]);
    expect(await failedOf(setId)).toEqual(["006.jpg (Corrupt JPEG data)"]);
  });

  it("Dismiss clears the rest", async () => {
    const setId = await setWithFailed(["007.jpg (x)"]);
    await dismissArchiveUploadFailed(setId);
    expect(await failedOf(setId)).toEqual([]);
  });
});
