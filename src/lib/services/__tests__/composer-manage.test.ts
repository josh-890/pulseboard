import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { minioClient, getMinioBucket } from "@/lib/minio";
import {
  clearComposerDrawing,
  createComposerCombination,
  createComposerFacet,
  createComposerSection,
  deleteComposerSection,
  detachComposerFacet,
  createComposerValue,
  getComposerManageData,
  reorderComposer,
  setComposerConfusables,
  setComposerDrawing,
  setComposerValueParents,
  updateComposerFacet,
  updateComposerValue,
} from "@/lib/services/composer-manage-service";
import { setRelevance } from "@/lib/services/composer-relevance-service";
import { addTagExample } from "@/lib/services/tag-example-service";

// Settings → Composer (ADR-0043, R4) against the DEV database, on a throwaway
// path of its own: the guards, the order, parents and named forms, look-alikes,
// the facet's settings, and a line drawing (an SVG never stored as such).

const RUN = `cm${Date.now().toString(36)}`;
let pathId = "";
let facetId = "";
let otherGroupId = "";
let sessionId = "";
let photo = "";
const tags: Record<string, string> = {};
const createdGroups: string[] = [];

beforeAll(async () => {
  const facet = await prisma.tagGroup.create({ data: { name: `${RUN} facet`, slug: `${RUN}-facet` } });
  const other = await prisma.tagGroup.create({ data: { name: `${RUN} loose`, slug: `${RUN}-loose` } });
  facetId = facet.id;
  otherGroupId = other.id;
  const path = await prisma.composerPath.create({
    data: { name: `${RUN} path`, sortOrder: 999, sections: { create: { name: "Only", groups: { create: { groupId: facetId } } } } },
  });
  pathId = path.id;
  sessionId = (await prisma.session.create({ data: { name: `${RUN} session` } })).id;
  photo = (
    await prisma.mediaItem.create({
      data: { sessionId, mediaType: "PHOTO", filename: `${RUN}.jpg`, mimeType: "image/jpeg", size: 1, originalWidth: 1000, originalHeight: 1000, fileRef: "x" },
    })
  ).id;
  for (const [i, k] of ["a", "b", "c"].entries())
    tags[k] = (await prisma.tagDefinition.create({ data: { groupId: facetId, name: `${RUN}-${k}`, slug: `${RUN}-${k}`, sortOrder: i } })).id;
});

afterAll(async () => {
  await prisma.tagExample.deleteMany({ where: { mediaItemId: photo } });
  await prisma.mediaItem.deleteMany({ where: { id: photo } });
  await prisma.session.deleteMany({ where: { id: sessionId } });
  const ids = (await prisma.tagDefinition.findMany({ where: { groupId: { in: [facetId, otherGroupId, ...createdGroups] } }, select: { id: true } })).map((t) => t.id);
  await prisma.tagRelevance.deleteMany({ where: { OR: [{ contextTagId: { in: ids } }, { targetId: { in: [...ids, facetId, pathId] } }] } });
  await prisma.tagConfusable.deleteMany({ where: { OR: [{ tagAId: { in: ids } }, { tagBId: { in: ids } }] } });
  await prisma.tagExtraParent.deleteMany({ where: { OR: [{ tagId: { in: ids } }, { parentId: { in: ids } }] } });
  await prisma.tagAlias.deleteMany({ where: { tagDefinitionId: { in: ids } } });
  await prisma.tagDefinition.updateMany({ where: { id: { in: ids } }, data: { parentId: null } });
  await prisma.tagDefinition.deleteMany({ where: { id: { in: ids } } });
  await prisma.composerPath.delete({ where: { id: pathId } });
  await prisma.tagGroup.deleteMany({ where: { id: { in: [facetId, otherGroupId, ...createdGroups] } } });
  const bucket = getMinioBucket();
  for (const id of Object.values(tags)) {
    const listed = await minioClient.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `composer/drawings/${id}-` }));
    const keys = (listed.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
    if (keys.length) await minioClient.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys } }));
  }
});

describe("the tree", () => {
  it("adds a value at the facet's end; a group no section shows is refused", async () => {
    const d = await createComposerValue(facetId, `${RUN}-d`);
    tags.d = d.id;
    const group = await prisma.tagDefinition.findMany({ where: { groupId: facetId }, orderBy: { sortOrder: "asc" }, select: { id: true } });
    expect(group.at(-1)?.id).toBe(d.id);
    await expect(createComposerValue(otherGroupId, `${RUN}-x`)).rejects.toThrow(/not a Composer facet/);
  });

  it("reorders values; a list that does not match the facet is refused", async () => {
    const order = [tags.c, tags.a, tags.b, tags.d];
    await reorderComposer("value", facetId, order);
    const rows = await prisma.tagDefinition.findMany({ where: { groupId: facetId }, orderBy: { sortOrder: "asc" }, select: { id: true } });
    expect(rows.map((r) => r.id)).toEqual(order);
    await expect(reorderComposer("value", facetId, [tags.a, tags.b])).rejects.toThrow(/does not match/);
  });

  it("a facet's choice, default and framing; bad numbers refused", async () => {
    await updateComposerFacet(facetId, { choice: "ONE", defaultLevel: "IMPOSSIBLE", framingFill: 0.6, tileAspect: "3:4" });
    const g = await prisma.tagGroup.findUniqueOrThrow({ where: { id: facetId } });
    expect([g.composerChoice, g.composerDefault, g.framingFill, g.tileAspect]).toEqual(["ONE", "IMPOSSIBLE", 0.6, "3:4"]);
    await updateComposerFacet(facetId, { framingFill: null, tileAspect: null });
    expect((await prisma.tagGroup.findUniqueOrThrow({ where: { id: facetId } })).framingFill).toBeNull();
    await expect(updateComposerFacet(facetId, { framingFill: 1.5 })).rejects.toThrow();
    await expect(updateComposerFacet(facetId, { tileAspect: "7:5" })).rejects.toThrow(/tile shape/);
  });

  it("an example is cut to the facet's own framing, and again when it changes", async () => {
    const box = { x: 0.4, y: 0.4, w: 0.2, h: 0.2 };
    await updateComposerFacet(facetId, { framingFill: 0.5, tileAspect: "1:1" });
    await addTagExample(tags.b, photo, box);
    const crop = async () => (await prisma.tagExample.findFirstOrThrow({ where: { tagId: tags.b, mediaItemId: photo } })).cropW;
    expect(await crop()).toBeCloseTo(0.4); // the subject fills half the tile
    await updateComposerFacet(facetId, { framingFill: 0.8 });
    expect(await crop(), "a changed rule cuts the example again").toBeCloseTo(0.25);
    await updateComposerFacet(facetId, { framingFill: null, tileAspect: null });
  });

  it("a region link must name the body-region catalogue", async () => {
    await updateComposerValue(tags.a, { regionCatalogId: "thigh_l" });
    expect((await prisma.tagDefinition.findUniqueOrThrow({ where: { id: tags.a } })).regionCatalogId).toBe("thigh_l");
    await expect(updateComposerValue(tags.a, { regionCatalogId: "nowhere" })).rejects.toThrow(/Unknown body region/);
    await updateComposerValue(tags.a, { regionCatalogId: null });
  });
});

describe("sections and facets", () => {
  it("adds a section at the path's end, and a facet set up like its neighbours", async () => {
    const section = await createComposerSection(pathId, `${RUN} named`);
    await expect(createComposerSection(pathId, `${RUN} named`)).rejects.toThrow(/already has a section/);
    const { id } = await createComposerFacet(section.id, `${RUN} Named expressions`, "MANY");
    createdGroups.push(id);
    const g = await prisma.tagGroup.findUniqueOrThrow({ where: { id } });
    const sibling = await prisma.tagGroup.findUniqueOrThrow({ where: { id: facetId } });
    expect([g.domain, g.typicalLevel, g.composerChoice]).toEqual([sibling.domain, sibling.typicalLevel, "MANY"]);
    await expect(createComposerFacet(section.id, `${RUN} Named expressions`), "already a facet").rejects.toThrow(/already a facet/);
    // A loose tag group of that name is taken in, not duplicated
    const other = await prisma.tagGroup.findUniqueOrThrow({ where: { id: otherGroupId } });
    expect((await createComposerFacet(section.id, other.name)).id).toBe(otherGroupId);
    await expect(deleteComposerSection(section.id), "only an empty section goes").rejects.toThrow(/facets first/);
    await detachComposerFacet(section.id, otherGroupId);
    await detachComposerFacet(section.id, id);
    expect(await prisma.tagGroup.count({ where: { id } }), "the group stays").toBe(1);
    await deleteComposerSection(section.id);
    expect(await prisma.composerSection.count({ where: { id: section.id } })).toBe(0);
  });
});

describe("relations", () => {
  it("parents in order: the first is the tree parent, the rest further parents; cycles refused", async () => {
    await setComposerValueParents(tags.c, [tags.a, tags.b]);
    const c = await prisma.tagDefinition.findUniqueOrThrow({ where: { id: tags.c }, include: { extraParents: true } });
    expect(c.parentId).toBe(tags.a);
    expect(c.extraParents.map((p) => p.parentId)).toEqual([tags.b]);
    // Swapping the order moves b to the front without it sitting in both places
    await setComposerValueParents(tags.c, [tags.b, tags.a]);
    const swapped = await prisma.tagDefinition.findUniqueOrThrow({ where: { id: tags.c }, include: { extraParents: true } });
    expect([swapped.parentId, swapped.extraParents.map((p) => p.parentId)]).toEqual([tags.b, [tags.a]]);
    await expect(setComposerValueParents(tags.a, [tags.c])).rejects.toThrow();
    await setComposerValueParents(tags.c, []);
  });

  it("a named form is a new value whose parents are its parts", async () => {
    const form = await createComposerCombination(facetId, `${RUN}-form`, [tags.a, tags.b]);
    expect(form.parentIds).toEqual([tags.a, tags.b]);
    await expect(createComposerCombination(facetId, `${RUN}-one`, [tags.a])).rejects.toThrow(/two parts/);
  });

  it("look-alikes are kept both ways and replaced as a whole", async () => {
    await setComposerConfusables(tags.a, [tags.b, tags.d]);
    let data = await getComposerManageData();
    expect(data.confusables[tags.a]?.sort()).toEqual([tags.b, tags.d].sort());
    expect(data.confusables[tags.b]).toEqual([tags.a]);
    await setComposerConfusables(tags.b, []);
    data = await getComposerManageData();
    expect(data.confusables[tags.a]).toEqual([tags.d]);
  });

  it("a relevance cell needs a real target and level", async () => {
    await setRelevance(tags.a, "GROUP", facetId, "TYPICAL");
    await expect(setRelevance(tags.a, "GROUP", "no-such-group", "TYPICAL")).rejects.toThrow(/Unknown relevance target/);
    await setRelevance(tags.a, "GROUP", facetId, null);
    expect(await prisma.tagRelevance.count({ where: { contextTagId: tags.a } })).toBe(0);
  });
});

describe("line drawings", () => {
  it("an SVG is rendered to a WebP; a script in it is never stored; clearing removes it", async () => {
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="80"><script>alert(1)</script><path d="M20 5 L20 75" stroke="black" stroke-width="4"/></svg>`,
    );
    const { url } = await setComposerDrawing(tags.a, svg);
    const key = (await prisma.tagDefinition.findUniqueOrThrow({ where: { id: tags.a } })).drawingKey!;
    expect(key).toMatch(new RegExp(`^composer/drawings/${tags.a}-\\d+\\.webp$`));
    expect(url).toContain(key);
    const obj = await minioClient.send(new GetObjectCommand({ Bucket: getMinioBucket(), Key: key }));
    const body = Buffer.from(await obj.Body!.transformToByteArray());
    const meta = await sharp(body).metadata();
    expect(meta.format).toBe("webp");
    expect(body.includes("alert")).toBe(false);
    await expect(setComposerDrawing(tags.a, Buffer.from("not an image"))).rejects.toThrow();
    await clearComposerDrawing(tags.a);
    expect((await prisma.tagDefinition.findUniqueOrThrow({ where: { id: tags.a } })).drawingKey).toBeNull();
  });
});
