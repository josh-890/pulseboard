import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createMediaItemDirect } from "@/lib/services/media-service";
import { normalizeForSearch } from "@/lib/normalize";

// The cover a set gets at promotion is a 512 px thumbnail carried over from the
// staged set — nobody chose it. The auto-assign rule only ever fired on an empty
// slot, so that stand-in stayed the cover for good: uploading the folder's own
// images afterwards left the set showing a thumbnail as its first gallery item
// and its cover, with the full-size original sitting right beside it.
//
// Runs against the DEV database (vitest.config.ts loads .env); throwaway rows are
// prefixed and wiped in afterEach.

const PREFIX = "PCV-TEST";

const variants = { master_4000: "session/x/y/master_4000.webp" };

afterEach(async () => {
  const sets = await prisma.set.findMany({
    where: { title: { startsWith: PREFIX } },
    select: { id: true },
  });
  const setIds = sets.map((s) => s.id);
  if (setIds.length) {
    await prisma.set.updateMany({ where: { id: { in: setIds } }, data: { coverMediaItemId: null } });
    await prisma.setMediaItem.deleteMany({ where: { setId: { in: setIds } } });
    await prisma.set.deleteMany({ where: { id: { in: setIds } } });
  }
  const sessions = await prisma.session.findMany({
    where: { name: { startsWith: PREFIX } },
    select: { id: true },
  });
  const sessionIds = sessions.map((s) => s.id);
  if (sessionIds.length) {
    await prisma.mediaItem.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.session.deleteMany({ where: { id: { in: sessionIds } } });
  }
});

async function seed(name: string) {
  const session = await prisma.session.create({
    data: { name: `${PREFIX} ${name}`, nameNorm: normalizeForSearch(`${PREFIX} ${name}`) },
  });
  const set = await prisma.set.create({
    data: { title: `${PREFIX} ${name}`, titleNorm: normalizeForSearch(`${PREFIX} ${name}`), type: "photo" },
  });
  return { sessionId: session.id, setId: set.id };
}

const add = (ids: { sessionId: string; setId: string }, filename: string, provisionalCover = false) =>
  createMediaItemDirect({
    sessionId: ids.sessionId,
    setId: ids.setId,
    filename,
    mimeType: "image/jpeg",
    size: 1000,
    originalWidth: 512,
    originalHeight: 768,
    variants,
    provisionalCover,
  });

const coverOf = (setId: string) =>
  prisma.set.findUniqueOrThrow({
    where: { id: setId },
    select: { coverMediaItemId: true, coverIsProvisional: true },
  });

describe("provisional set cover", () => {
  it("lets the first real image take the place of a transferred cover", async () => {
    const ids = await seed("takeover");
    const transferred = await add(ids, "cover.jpg", true);

    let cover = await coverOf(ids.setId);
    expect(cover.coverMediaItemId).toBe(transferred.id);
    expect(cover.coverIsProvisional).toBe(true);

    const uploaded = await add(ids, "set-001.jpg");

    cover = await coverOf(ids.setId);
    expect(cover.coverMediaItemId).toBe(uploaded.id);
    // Taking the place over settles it — the second upload must not steal it.
    expect(cover.coverIsProvisional).toBe(false);

    const second = await add(ids, "set-002.jpg");
    expect((await coverOf(ids.setId)).coverMediaItemId).toBe(uploaded.id);
    expect(second.id).not.toBe(uploaded.id);
  });

  it("leaves a chosen cover alone", async () => {
    const ids = await seed("chosen");
    const first = await add(ids, "set-001.jpg");
    await add(ids, "set-002.jpg");

    const cover = await coverOf(ids.setId);
    expect(cover.coverMediaItemId).toBe(first.id);
    expect(cover.coverIsProvisional).toBe(false);
  });

  it("does not let one stand-in displace another", async () => {
    const ids = await seed("two-standins");
    const first = await add(ids, "cover.jpg", true);
    await add(ids, "cover.jpg", true);

    const cover = await coverOf(ids.setId);
    expect(cover.coverMediaItemId).toBe(first.id);
    expect(cover.coverIsProvisional).toBe(true);
  });
});
