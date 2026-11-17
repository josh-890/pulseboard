import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

// No storage in tests: the deleted fixtures' fake keys are not in MinIO
vi.mock("@/lib/media-upload", () => ({ deleteMediaFiles: vi.fn(async () => {}) }));

import { createMediaItemDirect, getSetMediaGallery, getSessionMediaGallery } from "@/lib/services/media-service";
import { setArtInPhotos, setMediaRole } from "@/lib/services/cover-art-service";
import { deleteCoverDuplicates, findCoverDuplicates } from "@/lib/services/cover-art-cleanup-service";
import { getPersonShowcase } from "@/lib/services/person-showcase-service";

// Cover art (ADR-0040): arrival roles, redundant copies, photos-only consumers
// and the reviewed cleanup. Runs against the DEV database; throwaway rows carry
// RUN and are removed afterwards.
const RUN = `cva${Date.now().toString(36)}`;
const ids: Record<string, string> = {};

const variants = (k: string) => ({ master_4000: `${RUN}/${k}.webp`, gallery_512: `${RUN}/${k}_512.webp` });

async function arrive(k: string, filename: string, phash: string, width: number, extra: Record<string, unknown> = {}) {
  const r = await createMediaItemDirect({
    sessionId: ids.session!,
    setId: ids.set!,
    filename,
    mimeType: "image/jpeg",
    size: 1,
    originalWidth: width,
    originalHeight: Math.round(width * 1.5),
    variants: variants(k),
    phash,
    ...extra,
  });
  ids[k] = r.id;
  return r.id;
}

const exists = async (id: string) => (await prisma.mediaItem.count({ where: { id } })) === 1;
const roleOf = async (id: string) => (await prisma.mediaItem.findUniqueOrThrow({ where: { id } })).role;
const setCover = async () => (await prisma.set.findUniqueOrThrow({ where: { id: ids.set! } })).coverMediaItemId;

beforeAll(async () => {
  ids.person = (await prisma.person.create({ data: { icgId: `${RUN}-lead`.toUpperCase() } })).id;
  ids.session = (await prisma.session.create({ data: { name: `${RUN} session` } })).id;
  ids.set = (await prisma.set.create({ data: { type: "photo", title: `${RUN} set` } })).id;
  await prisma.setSession.create({ data: { setId: ids.set, sessionId: ids.session, isPrimary: true } });
  await prisma.sessionContribution.create({
    data: { sessionId: ids.session, personId: ids.person, roleDefinitionId: "crd_model" },
  });
});

afterAll(async () => {
  const media = await prisma.mediaItem.findMany({ where: { sessionId: ids.session }, select: { id: true } });
  const mids = media.map((m) => m.id);
  await prisma.set.updateMany({ where: { id: ids.set }, data: { coverMediaItemId: null } });
  await prisma.session.updateMany({ where: { id: ids.session }, data: { coverMediaItemId: null } });
  await prisma.personMediaLink.deleteMany({ where: { mediaItemId: { in: mids } } });
  await prisma.setMediaItem.deleteMany({ where: { setId: ids.set } });
  await prisma.mediaItem.deleteMany({ where: { id: { in: mids } } });
  await prisma.setSession.deleteMany({ where: { setId: ids.set } });
  await prisma.set.deleteMany({ where: { id: ids.set } });
  await prisma.sessionContribution.deleteMany({ where: { sessionId: ids.session } });
  await prisma.session.deleteMany({ where: { id: ids.session } });
  await prisma.person.deleteMany({ where: { id: ids.person } });
  await prisma.orphanedStorageKey.deleteMany({ where: { key: { startsWith: RUN } } });
});

describe("cover art", () => {
  it("arrivals: the transferred cover and Title-c.jpg are art, the rest photos", async () => {
    // The 512px stand-in carried over at promotion (a copy of photo 1)
    await arrive("standin", "cover.jpg", "00000000000000ff", 512, { isTransferredCover: true, provisionalCover: true });
    expect(await roleOf(ids.standin!)).toBe("COVER_ART");
    expect(await setCover()).toBe(ids.standin);

    // The publisher's cover, a crop of photo 54 (5 bits from it)
    await arrive("cfile", "2020-01-01-MA Test - Title-c.jpg", "f000000000000000", 600);
    expect(await roleOf(ids.cfile!)).toBe("COVER_ART");
    // A real picture takes over a stand-in's cover
    expect(await setCover()).toBe(ids.cfile);
    expect(await exists(ids.standin!)).toBe(true); // a different picture: stays
  });

  it("a photo that the stand-in copies replaces it; a crop of a photo stays", async () => {
    await arrive("p1", "Test - Title - 001.jpg", "00000000000000fe", 2000); // 1 bit from the stand-in
    expect(await roleOf(ids.p1!)).toBe("PHOTO");
    expect(await exists(ids.standin!)).toBe(false);

    await arrive("p54", "Test - Title - 054.jpg", "f00000000000001f", 2000); // 5 bits from the -c file
    expect(await exists(ids.cfile!)).toBe(true); // the publisher's crop stays art
    expect(await setCover()).toBe(ids.cfile);
  });

  it("two copies of the cover art: the larger one stays and takes the cover", async () => {
    await arrive("cfile2", "Title-c.jpg", "f000000000000001", 1200); // 1 bit from cfile, larger
    expect(await exists(ids.cfile!)).toBe(false);
    expect(await setCover()).toBe(ids.cfile2);
  });

  it("galleries, counts and the showcase see photos only; + photos lets art in", async () => {
    const photos = (await getSetMediaGallery(ids.set!)).map((i) => i.id).sort();
    expect(photos).toEqual([ids.p1, ids.p54].sort());
    expect((await getSetMediaGallery(ids.set!, null, "art")).map((i) => i.id)).toEqual([ids.cfile2]);
    expect((await getSessionMediaGallery(ids.session!, "art")).map((i) => i.id)).toEqual([ids.cfile2]);
    const count = await prisma.set.findUniqueOrThrow({
      where: { id: ids.set! },
      select: { _count: { select: { setMediaItems: { where: { mediaItem: { OR: [{ role: "PHOTO" }, { artInPhotos: true }] } } } } } },
    });
    expect(count._count.setMediaItems).toBe(2);

    const showcase = async () => (await getPersonShowcase(ids.person!, { size: 50 })).items.map((i) => i.id);
    expect(await showcase()).not.toContain(ids.cfile2);
    await setArtInPhotos(ids.cfile2!, true);
    expect(await showcase()).toContain(ids.cfile2);
    expect((await getSetMediaGallery(ids.set!)).map((i) => i.id)).toContain(ids.cfile2);
    await setArtInPhotos(ids.cfile2!, false);
  });

  it("This is cover art / Not cover art move a file between the photos and the slot", async () => {
    await setMediaRole([ids.p54!], "COVER_ART");
    expect((await getSetMediaGallery(ids.set!)).map((i) => i.id)).toEqual([ids.p1]);
    await setMediaRole([ids.p54!], "PHOTO");
    expect((await getSetMediaGallery(ids.set!)).map((i) => i.id).sort()).toEqual([ids.p1, ids.p54].sort());
  });

  it("the cleanup lists what the arrival left (a crop) and deletes only what it is given", async () => {
    // A stand-in that slipped in before the rule: art, 1 bit from photo 1
    const old = await prisma.mediaItem.create({
      data: {
        sessionId: ids.session!,
        mediaType: "PHOTO",
        filename: "cover.jpg",
        mimeType: "image/jpeg",
        size: 1,
        originalWidth: 512,
        originalHeight: 768,
        variants: variants("old"),
        phash: "00000000000000fc",
        role: "COVER_ART",
        isTransferredCover: true,
        setMediaItems: { create: { setId: ids.set! } },
      },
    });
    await prisma.session.update({ where: { id: ids.session! }, data: { coverMediaItemId: old.id } });

    const list = await findCoverDuplicates([old.id, ids.cfile2!]);
    const byId = new Map(list.map((c) => [c.id, [c.kind, c.keptId]]));
    expect(byId.get(old.id)).toEqual(["standIn", ids.p1]);
    // The publisher's crop of photo 54: listed, for you to judge (not pre-selected)
    expect(byId.get(ids.cfile2!)).toEqual(["crop", ids.p54]);

    expect(await deleteCoverDuplicates([old.id])).toBe(1);
    expect(await exists(old.id)).toBe(false);
    // The session's cover moved to the photo it copied
    expect((await prisma.session.findUniqueOrThrow({ where: { id: ids.session! } })).coverMediaItemId).toBe(ids.p1);
  });
});
