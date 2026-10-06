import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  addTagsToEntity,
  bulkAddTagsToEntities,
  bulkRemoveTagsFromEntities,
  getEntityTagIds,
  getSelectionTagCounts,
  removeTagsFromEntity,
} from "@/lib/services/entity-tag-service";
import { updateTagDefinition, updateTagGroup } from "@/lib/services/tag-service";
import { findTagMatchIds, resolveTagFilterParam } from "@/lib/services/tag-filter-service";
import {
  absorbFolderTagsIntoSets,
  getFolderTagViews,
  getTagWrites,
  reconcileFolderTagsFromScan,
  resolveDiskTagName,
  stagingSetIdsForTagQuery,
} from "@/lib/services/archive-tag-service";

// ADR-0034 end to end against the dev DB: a folder's `#` markers reach the app,
// app changes become writes, unknown names are taught, and the tags follow the
// folder onto its Set — with no marker ever deleted by an owner change.

const RUN = `tat${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const ids: Record<string, string> = {};
const path = (n: string) => `X:\\${RUN}\\${n}`;
const scan = (fullPath: string, tagMarkers: string[] | string) => reconcileFolderTagsFromScan([{ fullPath, tagMarkers }]);
const folderTags = (id: string) => getEntityTagIds("ARCHIVE_FOLDER", id);
const writeFor = async (fullPath: string) => (await getTagWrites()).find((w) => w.fullPath === fullPath);

beforeAll(async () => {
  const g = await prisma.tagGroup.create({ data: { name: RUN, slug: RUN, domain: "CONTENT" } });
  const gx = await prisma.tagGroup.create({ data: { name: `${RUN}x`, slug: `${RUN}x`, domain: "CONTENT", isExclusive: true } });
  ids.group = g.id;
  ids.groupX = gx.id;
  const tag = async (groupId: string, name: string) =>
    (ids[name] = (await prisma.tagDefinition.create({ data: { groupId, name, slug: name, nameNorm: name } })).id);
  await tag(g.id, `${RUN}beach`);
  await tag(g.id, `${RUN}pool`);
  await tag(gx.id, `${RUN}in`);
  await tag(gx.id, `${RUN}out`);
  const folder = async (n: string) =>
    (ids[n] = (
      await prisma.archiveFolder.create({
        data: { fullPath: path(n), folderName: n, isVideo: false, scannedAt: new Date(), tenant: "default" },
      })
    ).id);
  await folder("f1");
  await folder("f2");
  await folder("f3");
  await folder("f4");
  await folder("f5");
  await folder("f6");
  ids.set2 = (await prisma.set.create({ data: { type: "photo", title: `${RUN} set2` } })).id;
  ids.staged = (await prisma.stagingSet.create({ data: { title: `${RUN} staged`, channelName: RUN, participantIcgIds: [] } })).id;
  ids.set = (await prisma.set.create({ data: { type: "photo", title: `${RUN} set` } })).id;
});

afterAll(async () => {
  const folderIds = [ids.f1, ids.f2, ids.f3, ids.f4, ids.f5, ids.f6];
  await prisma.archiveLink.deleteMany({ where: { archiveFolderId: { in: folderIds } } });
  await prisma.stagingSet.deleteMany({ where: { id: ids.staged } });
  // By id: `startsWith` is a LIKE, and the backslash in the path is its escape character
  await prisma.archiveFolder.deleteMany({ where: { id: { in: folderIds } } });
  await prisma.setTag.deleteMany({ where: { setId: { in: [ids.set, ids.set2] } } });
  await prisma.set.deleteMany({ where: { id: { in: [ids.set, ids.set2] } } });
  const groups = [ids.group, ids.groupX];
  await prisma.tagAlias.deleteMany({ where: { tagDefinition: { groupId: { in: groups } } } });
  await prisma.tagDefinition.deleteMany({ where: { groupId: { in: groups } } });
  await prisma.tagGroup.deleteMany({ where: { id: { in: groups } } });
});

describe("disk → app", () => {
  it("adopts markers, accepts a single bare string, and forgets a deleted marker", async () => {
    await scan(path("f1"), [`#${RUN}beach.txt`, `#${RUN}pool`]);
    expect((await folderTags(ids.f1)).sort()).toEqual([ids[`${RUN}beach`], ids[`${RUN}pool`]].sort());

    await scan(path("f1"), `#${RUN}beach`); // PowerShell's collapsed one-element array
    expect(await folderTags(ids.f1)).toEqual([ids[`${RUN}beach`]]);
  });

  it("keeps unknown markers as warnings and leaves a conflicting exclusive group untouched", async () => {
    await scan(path("f2"), [`#${RUN}in`, `#${RUN}out`, "#nonsense-marker"]);
    const f = await prisma.archiveFolder.findUniqueOrThrow({ where: { id: ids.f2 } });
    expect(f.tagMarkersUnknown).toEqual(["#nonsense-marker"]);
    expect(f.tagMarkersConflicts.sort()).toEqual([`#${RUN}in`, `#${RUN}out`].sort());
    expect(await folderTags(ids.f2)).toEqual([]);
  });
});

describe("app → disk", () => {
  it("lists a write for a tag set in the app, keeping unknown markers", async () => {
    await addTagsToEntity("ARCHIVE_FOLDER", ids.f2, [ids[`${RUN}pool`]]);
    const w = await writeFor(path("f2"));
    expect(w?.want).toContain(`#${RUN}pool`);
    expect(w?.want).toContain("#nonsense-marker");
    expect(w?.want).toEqual(expect.arrayContaining([`#${RUN}in`, `#${RUN}out`]));
  });

  it("settles once the scan reports the written markers", async () => {
    await scan(path("f2"), [`#${RUN}in`, `#${RUN}out`, "#nonsense-marker", `#${RUN}pool`]);
    expect(await writeFor(path("f2"))).toBeUndefined();
    expect(await folderTags(ids.f2)).toEqual([ids[`${RUN}pool`]]);
  });

  it("asks to remove the marker of a tag removed in the app", async () => {
    await removeTagsFromEntity("ARCHIVE_FOLDER", ids.f2, [ids[`${RUN}pool`]]);
    const w = await writeFor(path("f2"));
    expect(w?.want).not.toContain(`#${RUN}pool`);
  });
});

describe("unknown names", () => {
  it("teaches the name as an alias and adopts it on the folder", async () => {
    const n = await resolveDiskTagName("#nonsense-marker", { aliasOfTagId: ids[`${RUN}beach`] });
    expect(n).toBe(1);
    expect(await folderTags(ids.f2)).toContain(ids[`${RUN}beach`]);
    const f = await prisma.archiveFolder.findUniqueOrThrow({ where: { id: ids.f2 } });
    expect(f.tagMarkersUnknown).toEqual([]);
    // Next scan with the same marker: recognised through the alias, no change
    await scan(path("f2"), [`#${RUN}in`, `#${RUN}out`, "#nonsense-marker"]);
    expect(await folderTags(ids.f2)).toContain(ids[`${RUN}beach`]);
  });

  it("adds no alias when the picked tag already has the marker's name", async () => {
    await prisma.archiveFolder.update({ where: { id: ids.f1 }, data: { tagMarkersUnknown: [`#${RUN}pool`] } });
    expect(await resolveDiskTagName(`#${RUN}pool`, { aliasOfTagId: ids[`${RUN}pool`] })).toBe(1);
    expect(await prisma.tagAlias.count({ where: { tagDefinitionId: ids[`${RUN}pool`] } })).toBe(0);
    expect(await folderTags(ids.f1)).toContain(ids[`${RUN}pool`]);
  });
});

describe("folder → set", () => {
  it("moves the folder's tags to the Set when linked, and later markers land on the Set", async () => {
    await scan(path("f3"), [`#${RUN}beach`]);
    await prisma.archiveLink.create({ data: { archiveFolderId: ids.f3, setId: ids.set, status: "CONFIRMED", tenant: "default" } });
    await absorbFolderTagsIntoSets([ids.f3]);
    expect(await folderTags(ids.f3)).toEqual([]);
    expect(await getEntityTagIds("SET", ids.set)).toEqual([ids[`${RUN}beach`]]);

    await scan(path("f3"), [`#${RUN}beach`, `#${RUN}pool`]);
    expect((await getEntityTagIds("SET", ids.set)).sort()).toEqual([ids[`${RUN}beach`], ids[`${RUN}pool`]].sort());

    const view = (await getFolderTagViews([ids.f3])).get(ids.f3);
    expect(view?.owner).toEqual({ type: "SET", id: ids.set });
    expect(view?.tags.map((t) => t.id).sort()).toEqual([ids[`${RUN}beach`], ids[`${RUN}pool`]].sort());
  });

  it("an unlink never deletes markers: the next scan re-adopts them on the folder", async () => {
    await prisma.archiveLink.deleteMany({ where: { archiveFolderId: ids.f3 } });
    expect(await writeFor(path("f3"))).toBeUndefined();
    await scan(path("f3"), [`#${RUN}beach`, `#${RUN}pool`]);
    expect((await folderTags(ids.f3)).sort()).toEqual([ids[`${RUN}beach`], ids[`${RUN}pool`]].sort());
    expect(await writeFor(path("f3"))).toBeUndefined();
  });
});

describe("renames never strip tags", () => {
  it("a renamed group: its qualified markers still resolve by name", async () => {
    await scan(path("f4"), [`#${RUN}=${RUN}beach`]);
    expect(await folderTags(ids.f4)).toEqual([ids[`${RUN}beach`]]);
    await updateTagGroup(ids.group, { name: `${RUN}renamed` });
    await scan(path("f4"), [`#${RUN}=${RUN}beach`]);
    expect(await folderTags(ids.f4)).toEqual([ids[`${RUN}beach`]]);
  });

  it("a renamed tag keeps its old name as alias, so its marker still resolves", async () => {
    await updateTagDefinition(ids[`${RUN}beach`], { name: `${RUN}shore` });
    expect(await prisma.tagAlias.count({ where: { tagDefinitionId: ids[`${RUN}beach`], name: `${RUN}beach` } })).toBe(1);
    await scan(path("f4"), [`#${RUN}=${RUN}beach`]);
    expect(await folderTags(ids.f4)).toEqual([ids[`${RUN}beach`]]);
  });

  it("an unresolvable marker holds the tag instead of dropping it", async () => {
    await prisma.tagAlias.deleteMany({ where: { tagDefinitionId: ids[`${RUN}beach`] } });
    await scan(path("f4"), [`#${RUN}=${RUN}beach`]);
    expect(await folderTags(ids.f4)).toEqual([ids[`${RUN}beach`]]);
    const f = await prisma.archiveFolder.findUniqueOrThrow({ where: { id: ids.f4 } });
    expect(f.tagMarkersUnknown).toEqual([`#${RUN}=${RUN}beach`]);
    expect(await writeFor(path("f4"))).toBeUndefined();
  });
});

describe("stage 2: filter and bulk across folder and Set", () => {
  // f5 owns its tags; f6 is confirmed to set2, so its tags live on set2; the
  // staged set is confirmed to f5.
  const pool = () => ids[`${RUN}pool`];
  const match = async (text: string) => {
    const f = await resolveTagFilterParam(text, "ARCHIVE_FOLDER");
    return (await findTagMatchIds("ARCHIVE_FOLDER", f!.resolved)).filter((id) => id === ids.f5 || id === ids.f6).sort();
  };

  beforeAll(async () => {
    await prisma.archiveLink.create({ data: { archiveFolderId: ids.f6, setId: ids.set2, status: "CONFIRMED", tenant: "default" } });
    await prisma.archiveLink.create({ data: { archiveFolderId: ids.f5, stagingSetId: ids.staged, status: "CONFIRMED", tenant: "default" } });
  });

  it("bulk add routes a set-linked folder to its Set, counts per folder", async () => {
    await bulkAddTagsToEntities("ARCHIVE_FOLDER", [ids.f5, ids.f6], [pool()]);
    expect(await folderTags(ids.f5)).toEqual([pool()]);
    expect(await folderTags(ids.f6)).toEqual([]);
    expect(await getEntityTagIds("SET", ids.set2)).toEqual([pool()]);
    expect((await getSelectionTagCounts("ARCHIVE_FOLDER", [ids.f5, ids.f6]))[pool()]).toBe(2);
  });

  it("the folder filter sees the Set's tags of a linked folder", async () => {
    const name = (await prisma.tagDefinition.findUniqueOrThrow({ where: { id: pool() } })).slug;
    expect(await match(name)).toEqual([ids.f5, ids.f6].sort());
    expect(await match(`-${name}`)).toEqual([]);
  });

  it("a staged set matches through its folder", async () => {
    const name = (await prisma.tagDefinition.findUniqueOrThrow({ where: { id: pool() } })).slug;
    expect(await stagingSetIdsForTagQuery(name)).toContain(ids.staged);
    expect(await stagingSetIdsForTagQuery("")).toBeNull();
  });

  it("bulk remove reaches both owners", async () => {
    await bulkRemoveTagsFromEntities("ARCHIVE_FOLDER", [ids.f5, ids.f6], [pool()]);
    expect(await folderTags(ids.f5)).toEqual([]);
    expect(await getEntityTagIds("SET", ids.set2)).toEqual([]);
  });
});
