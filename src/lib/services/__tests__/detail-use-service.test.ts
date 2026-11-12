import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  assignImageToDetailCategory,
  getCategoryUseMarks,
  getDetailDuplicates,
  getDetailUsesAcrossPeople,
  getDetailUsesOfImage,
} from "@/lib/services/detail-use-service";

// "Is this photo already in that detail category?" (2026-11-12). Runs against
// the DEV database; throwaway rows carry RUN and are removed afterwards. No path
// here copies files (MinIO): the copies are created by hand.

const RUN = `dus${Date.now().toString(36)}`;
const ids: Record<string, string> = {};
const media: string[] = [];

async function photo(key: string, sessionKey: string, data: Record<string, unknown> = {}) {
  const m = await prisma.mediaItem.create({
    data: {
      sessionId: ids[sessionKey],
      mediaType: "PHOTO",
      filename: `${key}.jpg`,
      mimeType: "image/jpeg",
      size: 1,
      originalWidth: 4,
      originalHeight: 5,
      variants: { master_4000: `${RUN}/${key}.webp` },
      ...data,
    },
  });
  ids[key] = m.id;
  media.push(m.id);
}

async function detail(personKey: string, itemKey: string, catKey: string) {
  await prisma.personMediaLink.create({
    data: { personId: ids[personKey], mediaItemId: ids[itemKey], usage: "DETAIL", categoryId: ids[catKey] },
  });
}

beforeAll(async () => {
  const a = await prisma.person.create({
    data: { icgId: `${RUN}-A`.toUpperCase(), aliases: { create: { name: `${RUN} Anna`, isCommon: true } } },
  });
  const b = await prisma.person.create({ data: { icgId: `${RUN}-B`.toUpperCase() } });
  ids.A = a.id;
  ids.B = b.id;
  ids.prod = (await prisma.session.create({ data: { name: `${RUN} production` } })).id;
  ids.refA = (await prisma.session.create({ data: { name: `${RUN} ref A`, type: "REFERENCE", personId: a.id } })).id;
  ids.refB = (await prisma.session.create({ data: { name: `${RUN} ref B`, type: "REFERENCE", personId: b.id } })).id;
  const group = await prisma.mediaCategoryGroup.create({ data: { name: `${RUN} group` } });
  ids.group = group.id;
  for (const k of ["catX", "catY", "catZ"]) {
    ids[k] = (await prisma.mediaCategory.create({ data: { groupId: group.id, name: `${RUN} ${k}`, slug: `${RUN}_${k}` } })).id;
  }
  ids.tpl = (
    await prisma.motifTemplate.create({ data: { name: `${RUN} tpl`, aspectW: 1, aspectH: 1, bakeLongSide: 100, keypoints: [] } })
  ).id;

  // The same file in two sets: src and srcTwin share a hash.
  await photo("src", "prod", { hash: `${RUN}-h1` });
  await photo("srcTwin", "prod", { hash: `${RUN}-h1` });
  await photo("other", "prod", { hash: `${RUN}-h2` });
  await photo("fresh", "prod", { hash: `${RUN}-h3` });
  await photo("loose", "prod", { hash: `${RUN}-h4` });
  // A's copy of src, in catX.
  await photo("copyX", "refA", { hash: `${RUN}-h1`, copiedFromMediaItemId: ids.src });
  await detail("A", "copyX", "catX");
  // An aligned bake from srcTwin, in catY.
  await photo("alignedY", "refA", {
    hash: `${RUN}-baked`,
    motifTemplateId: ids.tpl,
    motifProvenance: { version: 2, sourceMediaItemId: ids.srcTwin, keypoints: {} },
  });
  await detail("A", "alignedY", "catY");
  // B also has a copy of src — never counted for A.
  await photo("copyB", "refB", { hash: `${RUN}-h1`, copiedFromMediaItemId: ids.src });
  await detail("B", "copyB", "catX");
  // A copy of "loose" sitting in A's reference session with no category.
  await photo("looseCopy", "refA", { hash: `${RUN}-h4`, copiedFromMediaItemId: ids.loose });
  // A photo that lives only in A's reference session, in catZ.
  await photo("refOnly", "refA", { hash: `${RUN}-h5` });
  await detail("A", "refOnly", "catZ");
  // An existing duplicate: two copies of "other" in catZ.
  await photo("dup1", "refA", { hash: `${RUN}-h2`, copiedFromMediaItemId: ids.other });
  await photo("dup2", "refA", { hash: `${RUN}-h2`, copiedFromMediaItemId: ids.other });
  await detail("A", "dup1", "catZ");
  await detail("A", "dup2", "catZ");
  // dup1 is the source of an aligned image — never offered for deletion.
  await photo("alignedFromDup", "refA", {
    hash: `${RUN}-baked2`,
    motifTemplateId: ids.tpl,
    motifProvenance: { version: 2, sourceMediaItemId: ids.dup1, keypoints: {} },
  });
  // A photo to tie to a body mark.
  await photo("markPhoto", "refA", { hash: `${RUN}-h6` });
  ids.mark = (
    await prisma.bodyMark.create({ data: { personId: a.id, type: "tattoo", bodyRegion: "left_forearm" } })
  ).id;
});

afterAll(async () => {
  if (ids.mark) await prisma.personMediaLink.deleteMany({ where: { bodyMarkId: ids.mark } });
  if (ids.mark) await prisma.bodyMark.deleteMany({ where: { id: ids.mark } });
  await prisma.personMediaLink.deleteMany({ where: { mediaItemId: { in: media } } });
  await prisma.mediaItem.updateMany({ where: { id: { in: media } }, data: { copiedFromMediaItemId: null } });
  await prisma.mediaItem.deleteMany({ where: { id: { in: media } } });
  await prisma.motifTemplate.deleteMany({ where: { id: ids.tpl } });
  await prisma.mediaCategory.deleteMany({ where: { groupId: ids.group } });
  await prisma.mediaCategoryGroup.deleteMany({ where: { id: ids.group } });
  await prisma.session.deleteMany({ where: { id: { in: [ids.prod, ids.refA, ids.refB].filter(Boolean) } } });
  const persons = [ids.A, ids.B].filter(Boolean);
  await prisma.personAlias.deleteMany({ where: { personId: { in: persons } } });
  await prisma.person.deleteMany({ where: { id: { in: persons } } });
});

describe("getDetailUsesOfImage", () => {
  it("finds the copy (by provenance and by hash) and the aligned bake, only for this person", async () => {
    for (const key of ["src", "srcTwin"]) {
      const uses = await getDetailUsesOfImage(ids.A, ids[key]);
      const byItem = Object.fromEntries(uses.map((u) => [u.mediaItemId, u]));
      expect(Object.keys(byItem).sort()).toEqual([ids.copyX, ids.alignedY].sort());
      expect(byItem[ids.copyX]).toMatchObject({ kind: "copy", categoryId: ids.catX, categoryName: `${RUN} catX` });
      expect(byItem[ids.alignedY]).toMatchObject({ kind: "aligned", categoryId: ids.catY });
    }
  });

  it("is empty for a photo not used for this person", async () => {
    expect(await getDetailUsesOfImage(ids.A, ids.fresh)).toEqual([]);
  });
});

describe("getDetailUsesAcrossPeople", () => {
  it("names every person whose details hold the image, Name (ICG-ID)", async () => {
    const uses = (await getDetailUsesAcrossPeople(ids.src)).filter((u) => u.categoryName.startsWith(RUN));
    expect(uses).toEqual(
      expect.arrayContaining([
        { personId: ids.A, personName: `${RUN} Anna (${`${RUN}-A`.toUpperCase()})`, categoryName: `${RUN} catX`, kind: "copy" },
        { personId: ids.A, personName: `${RUN} Anna (${`${RUN}-A`.toUpperCase()})`, categoryName: `${RUN} catY`, kind: "aligned" },
        { personId: ids.B, personName: `${RUN}-B`.toUpperCase(), categoryName: `${RUN} catX`, kind: "copy" },
      ]),
    );
    expect(uses).toHaveLength(3);
  });
});

describe("getCategoryUseMarks", () => {
  it("marks source photos already in, or aligned into, the category", async () => {
    expect(await getCategoryUseMarks(ids.A, ids.catX, [ids.src, ids.srcTwin, ids.fresh])).toEqual({
      [ids.src]: ["copy"],
      [ids.srcTwin]: ["copy"],
    });
    expect(await getCategoryUseMarks(ids.A, ids.catY, [ids.src, ids.srcTwin])).toEqual({
      [ids.src]: ["aligned"],
      [ids.srcTwin]: ["aligned"],
    });
  });
});

describe("assignImageToDetailCategory", () => {
  it("refuses the same image in the same category, without adding anything", async () => {
    const before = await prisma.mediaItem.count({ where: { sessionId: ids.refA } });
    const res = await assignImageToDetailCategory(ids.srcTwin, ids.A, ids.catX);
    expect(res.success).toBe(false);
    expect(!res.success && res.code).toBe("ALREADY_IN_CATEGORY");
    expect(!res.success && res.code === "ALREADY_IN_CATEGORY" && res.existing.map((e) => e.mediaItemId)).toEqual([ids.copyX]);
    expect(await prisma.mediaItem.count({ where: { sessionId: ids.refA } })).toBe(before);
  });

  it("reuses an uncategorised copy instead of copying the files again", async () => {
    const before = await prisma.mediaItem.count({ where: { sessionId: ids.refA } });
    const res = await assignImageToDetailCategory(ids.loose, ids.A, ids.catX);
    expect(res).toMatchObject({ success: true, assignedMediaItemId: ids.looseCopy, copied: false, moved: false });
    expect(await prisma.mediaItem.count({ where: { sessionId: ids.refA } })).toBe(before);
  });

  it("names the other categories that already hold the image", async () => {
    // refOnly is in A's reference session (catZ); assigning it elsewhere moves it.
    const res = await assignImageToDetailCategory(ids.refOnly, ids.A, ids.catY);
    expect(res).toMatchObject({ success: true, moved: true, movedFromCategoryId: ids.catZ, alsoIn: [`${RUN} catZ`] });
  });
});

describe("getDetailDuplicates", () => {
  it("groups the same file twice in one category and flags an alignment source", async () => {
    const groups = (await getDetailDuplicates(ids.A)).filter((g) => g.hash.startsWith(RUN));
    expect(groups).toHaveLength(1);
    expect(groups[0].categoryId).toBe(ids.catZ);
    const byId = Object.fromEntries(groups[0].items.map((i) => [i.mediaItemId, i]));
    expect(Object.keys(byId).sort()).toEqual([ids.dup1, ids.dup2].sort());
    expect(byId[ids.dup1].isAlignSource).toBe(true);
    expect(byId[ids.dup2].isAlignSource).toBe(false);
  });
});

describe("assignImageToDetailCategory — options", () => {
  it("ties the link to a body mark", async () => {
    const res = await assignImageToDetailCategory(ids.markPhoto, ids.A, ids.catX, {
      entity: { field: "bodyMarkId", id: ids.mark },
    });
    expect(res).toMatchObject({ success: true, copied: false });
    const link = await prisma.personMediaLink.findFirst({ where: { personId: ids.A, mediaItemId: ids.markPhoto, usage: "DETAIL" } });
    expect(link).toMatchObject({ categoryId: ids.catX, bodyMarkId: ids.mark });
  });

  it("refuses a repeat into the same category without force", async () => {
    // markPhoto is now in catX. (The forced repeat copies files — MinIO — not run here.)
    const res = await assignImageToDetailCategory(ids.markPhoto, ids.A, ids.catX);
    expect(!res.success && res.code).toBe("ALREADY_IN_CATEGORY");
  });
});
