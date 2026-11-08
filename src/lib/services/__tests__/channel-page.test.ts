import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  addTagsToEntity,
  getEntityTagIds,
  getSelectionTagCounts,
  removeTagsFromEntity,
  setEntityTags,
} from "@/lib/services/entity-tag-service";
import { getEffectiveTags } from "@/lib/services/tag-effective-service";
import { findTagMatchIds, resolveTagFilterParam } from "@/lib/services/tag-filter-service";
import { deleteTagDefinition, getTagUsageCountMap, mergeTagDefinitions } from "@/lib/services/tag-service";
import { getChannelHeroStats, setChannelRating, setChannelText } from "@/lib/services/channel-service";

// The channel page (2026-11-08) on the DEV database: the hero's numbers, your
// rating and texts, and tags on channels — written, read, filtered, merged.
// Throwaway rows named after RUN.

const RUN = `chp${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const ids: Record<string, string> = {};

beforeAll(async () => {
  const g = await prisma.tagGroup.create({ data: { name: RUN, slug: RUN, domain: "CONTENT" } });
  const person = await prisma.tagGroup.create({ data: { name: `${RUN}p`, slug: `${RUN}p`, domain: "PERSON" } });
  ids.group = g.id;
  ids.personGroup = person.id;
  const tag = async (groupId: string, name: string) =>
    (ids[name] = (await prisma.tagDefinition.create({ data: { groupId, name, slug: name, nameNorm: name } })).id);
  await tag(g.id, `${RUN}outdoor`);
  await tag(g.id, `${RUN}studio`);
  await tag(g.id, `${RUN}gone`);
  await tag(person.id, `${RUN}blonde`);
  ids.channel = (await prisma.channel.create({ data: { name: `${RUN} Channel` } })).id;
  ids.other = (await prisma.channel.create({ data: { name: `${RUN} Other` } })).id;
});

afterAll(async () => {
  await prisma.stagingSet.deleteMany({ where: { title: { startsWith: RUN } } });
  await prisma.set.deleteMany({ where: { title: { startsWith: RUN } } });
  await prisma.channel.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.tagAlias.deleteMany({ where: { tagDefinition: { name: { startsWith: RUN } } } });
  await prisma.tagDefinition.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.tagGroup.deleteMany({ where: { name: { startsWith: RUN } } });
});

describe("the channel hero", () => {
  it("counts photo and video sets and spans the years of promoted and staged sets", async () => {
    const empty = await getChannelHeroStats(ids.channel);
    expect(empty).toEqual({ photoSets: 0, videoSets: 0, models: 0, firstYear: null, lastYear: null });

    await prisma.set.create({ data: { type: "photo", title: `${RUN} a`, channelId: ids.channel, releaseDate: new Date("2016-05-01") } });
    await prisma.set.create({ data: { type: "video", title: `${RUN} b`, channelId: ids.channel, releaseDate: new Date("2019-02-01") } });
    await prisma.stagingSet.create({
      data: { title: `${RUN} staged`, channelName: RUN, channelId: ids.channel, participantIcgIds: [], releaseDate: new Date("2022-07-01") },
    });
    expect(await getChannelHeroStats(ids.channel)).toMatchObject({ photoSets: 1, videoSets: 1, firstYear: 2016, lastYear: 2022 });
  });

  it("keeps a rating of 1–5 and clears it; blank text clears the profile", async () => {
    await setChannelRating(ids.channel, 4);
    await expect(setChannelRating(ids.channel, 6)).rejects.toThrow();
    await setChannelText(ids.channel, "profile", "  **Soft light**, outdoors  ");
    let row = await prisma.channel.findUniqueOrThrow({ where: { id: ids.channel } });
    expect(row).toMatchObject({ rating: 4, profile: "**Soft light**, outdoors" });
    await setChannelRating(ids.channel, null);
    await setChannelText(ids.channel, "profile", "   ");
    row = await prisma.channel.findUniqueOrThrow({ where: { id: ids.channel } });
    expect(row).toMatchObject({ rating: null, profile: null });
  });
});

describe("tags on a channel", () => {
  it("adds, replaces and removes; refuses a person tag", async () => {
    await addTagsToEntity("CHANNEL", ids.channel, [ids[`${RUN}outdoor`]]);
    await addTagsToEntity("CHANNEL", ids.channel, [ids[`${RUN}outdoor`], ids[`${RUN}studio`]]);
    expect((await getEntityTagIds("CHANNEL", ids.channel)).sort()).toEqual([ids[`${RUN}outdoor`], ids[`${RUN}studio`]].sort());
    expect((await getEffectiveTags("CHANNEL", ids.channel)).map((t) => t.id).sort()).toEqual(
      [ids[`${RUN}outdoor`], ids[`${RUN}studio`]].sort(),
    );
    await expect(addTagsToEntity("CHANNEL", ids.channel, [ids[`${RUN}blonde`]])).rejects.toThrow(/cannot be applied/);

    await setEntityTags("CHANNEL", ids.channel, [ids[`${RUN}studio`]]);
    expect(await getEntityTagIds("CHANNEL", ids.channel)).toEqual([ids[`${RUN}studio`]]);
    await removeTagsFromEntity("CHANNEL", ids.channel, [ids[`${RUN}studio`]]);
    expect(await getEntityTagIds("CHANNEL", ids.channel)).toEqual([]);
  });

  it("is found by the tag filter and counted", async () => {
    await addTagsToEntity("CHANNEL", ids.channel, [ids[`${RUN}outdoor`]]);
    const f = await resolveTagFilterParam(`${RUN}outdoor`, "CHANNEL");
    expect(await findTagMatchIds("CHANNEL", f!.resolved)).toEqual([ids.channel]);
    expect(await getSelectionTagCounts("CHANNEL", [ids.channel, ids.other])).toEqual({ [ids[`${RUN}outdoor`]]: 1 });
    expect((await getTagUsageCountMap()).get(ids[`${RUN}outdoor`])).toBe(1);
  });

  it("follows a merge, and goes with a deleted tag", async () => {
    await addTagsToEntity("CHANNEL", ids.other, [ids[`${RUN}studio`], ids[`${RUN}outdoor`]]);
    await mergeTagDefinitions([ids[`${RUN}studio`]], ids[`${RUN}outdoor`]);
    expect(await getEntityTagIds("CHANNEL", ids.other)).toEqual([ids[`${RUN}outdoor`]]);

    await addTagsToEntity("CHANNEL", ids.other, [ids[`${RUN}gone`]]);
    await deleteTagDefinition(ids[`${RUN}gone`]);
    expect(await getEntityTagIds("CHANNEL", ids.other)).toEqual([ids[`${RUN}outdoor`]]);
  });
});
