import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getMarkTags, setMediaFavorite, type MarkTags } from "@/lib/services/media-mark-service";
import {
  addTagsToEntity,
  bulkAddTagsToEntities,
  bulkRemoveTagsFromEntities,
  removeTagsFromEntity,
  setEntityTags,
} from "@/lib/services/entity-tag-service";

// The photo marks iconic / outtake (2026-10-16) are the Judgment group's tags of
// that name — created there when missing. Runs against the DEV database.

const RUN = `mms${Date.now().toString(36)}`;

const photos: string[] = [];
let sessionId = "";
let marks: MarkTags;

beforeAll(async () => {
  marks = await getMarkTags();
  const session = await prisma.session.create({ data: { name: `${RUN} session` } });
  sessionId = session.id;
  for (let i = 0; i < 2; i++) {
    const m = await prisma.mediaItem.create({
      data: { sessionId, mediaType: "PHOTO", filename: `${RUN}-${i}.jpg`, mimeType: "image/jpeg", size: 1, originalWidth: 1, originalHeight: 1, variants: {} },
    });
    photos.push(m.id);
  }
});

afterAll(async () => {
  await prisma.mediaItemTag.deleteMany({ where: { mediaItemId: { in: photos } } });
  await prisma.mediaItem.deleteMany({ where: { id: { in: photos } } });
  if (sessionId) await prisma.session.delete({ where: { id: sessionId } });
  const groups = await prisma.tagGroup.findMany({ where: { slug: { startsWith: RUN } }, select: { id: true } });
  await prisma.tagDefinition.deleteMany({ where: { groupId: { in: groups.map((g) => g.id) } } });
  await prisma.tagGroup.deleteMany({ where: { slug: { startsWith: RUN } } });
});

describe("getMarkTags", () => {
  it("gives the Judgment group's iconic and outtake, the same on every call", async () => {
    const a = await getMarkTags();
    const b = await getMarkTags();
    expect(a.iconic).toMatchObject({ slug: "iconic", group: { slug: "judgment" } });
    expect(a.outtake).toMatchObject({ slug: "outtake", group: { slug: "judgment" } });
    expect(b.iconic.id).toBe(a.iconic.id);
    expect(b.outtake.id).toBe(a.outtake.id);
  });

  it("prefers the Judgment tag over a same-named tag in another group", async () => {
    const other = await prisma.tagGroup.create({ data: { name: `${RUN} Other`, slug: `${RUN}-other` } });
    await prisma.tagDefinition.create({ data: { groupId: other.id, name: "iconic", slug: "iconic", nameNorm: "iconic" } });
    const { iconic } = await getMarkTags();
    expect(iconic.group.slug).toBe("judgment");
  });
});

// outtake < ★ < iconic (2026-10-17), enforced wherever a mark changes
describe("mark tiers on the server", () => {
  const [a, b] = [0, 1].map((i) => () => photos[i]);
  async function marksOf(id: string) {
    const m = await prisma.mediaItem.findUniqueOrThrow({
      where: { id },
      select: { isFavorite: true, mediaItemTags: { select: { tagDefinition: { select: { slug: true } } } } },
    });
    const slugs = m.mediaItemTags.map((t) => t.tagDefinition.slug);
    return { iconic: slugs.includes("iconic"), favorite: m.isFavorite, outtake: slugs.includes("outtake") };
  }

  beforeEach(async () => {
    await prisma.mediaItemTag.deleteMany({ where: { mediaItemId: { in: photos } } });
    await prisma.mediaItem.updateMany({ where: { id: { in: photos } }, data: { isFavorite: false } });
  });

  it("iconic makes a favorite and an outtake; clearing outtake clears both again", async () => {
    await addTagsToEntity("MEDIA_ITEM", a(), [marks.iconic.id]);
    expect(await marksOf(a())).toEqual({ iconic: true, favorite: true, outtake: true });
    await removeTagsFromEntity("MEDIA_ITEM", a(), [marks.outtake.id]);
    expect(await marksOf(a())).toEqual({ iconic: false, favorite: false, outtake: false });
  });

  it("★ sets outtake; un-★ clears iconic but keeps outtake", async () => {
    await setMediaFavorite([a()], true);
    expect(await marksOf(a())).toEqual({ iconic: false, favorite: true, outtake: true });
    await addTagsToEntity("MEDIA_ITEM", a(), [marks.iconic.id]);
    await setMediaFavorite([a()], false);
    expect(await marksOf(a())).toEqual({ iconic: false, favorite: false, outtake: true });
  });

  it("removing iconic leaves the lower marks; outtake alone sets nothing higher", async () => {
    await addTagsToEntity("MEDIA_ITEM", a(), [marks.iconic.id]);
    await removeTagsFromEntity("MEDIA_ITEM", a(), [marks.iconic.id]);
    expect(await marksOf(a())).toEqual({ iconic: false, favorite: true, outtake: true });
    await addTagsToEntity("MEDIA_ITEM", b(), [marks.outtake.id]);
    expect(await marksOf(b())).toEqual({ iconic: false, favorite: false, outtake: true });
  });

  it("works for a selection, and for a full replace of the tags", async () => {
    await bulkAddTagsToEntities("MEDIA_ITEM", photos, [marks.iconic.id]);
    for (const id of photos) expect(await marksOf(id)).toEqual({ iconic: true, favorite: true, outtake: true });
    await bulkRemoveTagsFromEntities("MEDIA_ITEM", photos, [marks.outtake.id]);
    for (const id of photos) expect(await marksOf(id)).toEqual({ iconic: false, favorite: false, outtake: false });

    await setEntityTags("MEDIA_ITEM", a(), [marks.iconic.id]);
    expect(await marksOf(a())).toEqual({ iconic: true, favorite: true, outtake: true });
  });
});
