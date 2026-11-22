import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { applyComposition, getComposerCatalog } from "@/lib/services/composer-service";
import { setRelevance } from "@/lib/services/composer-relevance-service";
import { relevanceOf } from "@/lib/composer";

// ADR-0043 against the DEV database and its seeded Composer catalogue: person
// lanes (photo tags + attribution), and relevance rows read into the catalogue.

const RUN = `lane${Date.now().toString(36)}`;
let sessionId = "";
let photo = "";
const persons: string[] = [];
let kneeling = "";
let standing = "";
let fullBody = "";

beforeAll(async () => {
  const tag = async (slug: string) => (await prisma.tagDefinition.findFirstOrThrow({ where: { slug }, select: { id: true } })).id;
  [kneeling, standing, fullBody] = [await tag("kneeling"), await tag("standing"), await tag("full-body")];
  sessionId = (await prisma.session.create({ data: { name: `${RUN} session` } })).id;
  photo = (
    await prisma.mediaItem.create({
      data: { sessionId, mediaType: "PHOTO", filename: `${RUN}.jpg`, mimeType: "image/jpeg", size: 1, originalWidth: 1, originalHeight: 1, fileRef: "x" },
    })
  ).id;
  for (const k of ["anna", "bea"]) persons.push((await prisma.person.create({ data: { icgId: `${RUN}-${k}` } })).id);
});

afterAll(async () => {
  await prisma.mediaItemTagPerson.deleteMany({ where: { mediaItemId: photo } });
  await prisma.mediaItemTag.deleteMany({ where: { mediaItemId: photo } });
  await prisma.mediaItem.delete({ where: { id: photo } });
  await prisma.session.delete({ where: { id: sessionId } });
  await prisma.person.deleteMany({ where: { id: { in: persons } } });
  await prisma.tagRelevance.deleteMany({ where: { contextTagId: fullBody, targetKind: "TAG", targetId: kneeling } });
});

describe("person lanes", () => {
  it("adds per person: one photo tag, one attribution each", async () => {
    const [anna, bea] = persons;
    await applyComposition([photo], [kneeling], [], anna);
    await applyComposition([photo], [standing], [], bea);
    const r = await applyComposition([photo], [kneeling], [], bea);
    expect(r.tags[photo].sort()).toEqual([kneeling, standing].sort());
    expect(r.persons[photo][anna]).toEqual([kneeling]);
    expect(r.persons[photo][bea].sort()).toEqual([kneeling, standing].sort());
  });

  it("a person's remove keeps the photo tag while someone else holds it; the last one takes it", async () => {
    const [anna, bea] = persons;
    let r = await applyComposition([photo], [], [kneeling], anna);
    expect(r.tags[photo]).toContain(kneeling); // Bea still kneels
    expect(r.persons[photo][anna]).toBeUndefined();
    r = await applyComposition([photo], [], [kneeling], bea);
    expect(r.tags[photo]).not.toContain(kneeling);
  });

  it("a photo-level remove takes every attribution with it", async () => {
    const r = await applyComposition([photo], [], [standing]);
    expect(r.tags[photo]).toEqual([]);
    expect(await prisma.mediaItemTagPerson.count({ where: { mediaItemId: photo } })).toBe(0);
  });
});

describe("relevance rows", () => {
  it("are read into the catalogue and answer relevanceOf", async () => {
    await setRelevance(fullBody, "TAG", kneeling, "IMPOSSIBLE");
    let catalog = await getComposerCatalog();
    expect(relevanceOf(catalog, [fullBody], { kind: "TAG", id: kneeling })).toBe("IMPOSSIBLE");
    await setRelevance(fullBody, "TAG", kneeling, null);
    catalog = await getComposerCatalog();
    expect(relevanceOf(catalog, [fullBody], { kind: "TAG", id: kneeling })).not.toBe("IMPOSSIBLE");
  });
});
