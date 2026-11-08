import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getMakerFaces, getMakerKnownFor, getMakerShowcase } from "@/lib/services/maker-showcase-service";
import { LEAD_ROLE } from "@/lib/services/session-contributors";

// The work of a channel, a label, an artist (2026-11-08): the person showcase's
// ranking over the maker's sets, Known for, and the faces seen most. DEV
// database; throwaway rows carry RUN.

const RUN = `msc${Date.now().toString(36)}`;
const ids: Record<string, string> = {};
const media: string[] = [];

async function photo(key: string, data: { isFavorite?: boolean; decodeIssue?: string } = {}) {
  const m = await prisma.mediaItem.create({
    data: {
      sessionId: ids.session,
      mediaType: "PHOTO",
      filename: `${key}.jpg`,
      mimeType: "image/jpeg",
      size: 1,
      originalWidth: 4,
      originalHeight: 5,
      variants: { master_4000: `${RUN}/${key}.webp`, gallery_512: `${RUN}/${key}_512.webp` },
      ...data,
    },
  });
  ids[key] = m.id;
  media.push(m.id);
}

beforeAll(async () => {
  const group = await prisma.tagGroup.create({ data: { name: `${RUN} Judgment`, slug: `${RUN}-judgment` } });
  ids.group = group.id;
  const iconic = await prisma.tagDefinition.create({ data: { groupId: group.id, name: "iconic", slug: "iconic", nameNorm: "iconic" } });

  const label = await prisma.label.create({ data: { name: `${RUN} Label` } });
  const channel = await prisma.channel.create({ data: { name: `${RUN} Channel`, labelId: label.id } });
  const other = await prisma.channel.create({ data: { name: `${RUN} Other`, labelId: label.id } });
  const artist = await prisma.artist.create({ data: { name: `${RUN} Artist`, nameNorm: `${RUN} artist` } });
  Object.assign(ids, { label: label.id, channel: channel.id, other: other.id, artist: artist.id });

  const role = await prisma.contributionRoleDefinition.findFirstOrThrow({ where: LEAD_ROLE });
  ids.session = (await prisma.session.create({ data: { name: `${RUN} session` } })).id;
  const anna = await prisma.person.create({ data: { icgId: `${RUN}-A`.toUpperCase() } });
  const bea = await prisma.person.create({ data: { icgId: `${RUN}-B`.toUpperCase() } });
  Object.assign(ids, { anna: anna.id, bea: bea.id });

  await photo("iconic");
  await photo("fav", { isFavorite: true });
  for (let i = 0; i < 6; i++) await photo(`big${i}`);
  await photo("small0");
  await photo("small1");
  await photo("damaged", { isFavorite: true, decodeIssue: "Corrupt JPEG data" });
  await photo("elsewhere", { isFavorite: true });
  await prisma.mediaItemTag.create({ data: { mediaItemId: ids.iconic, tagDefinitionId: iconic.id } });

  const set = async (key: string, channelId: string, photos: string[], cast: string[], rating: number | null, date: string) => {
    const s = await prisma.set.create({ data: { type: "photo", title: `${RUN} ${key}`, channelId, rating, releaseDate: new Date(date) } });
    ids[`set:${key}`] = s.id;
    await prisma.setMediaItem.createMany({ data: photos.map((k) => ({ setId: s.id, mediaItemId: ids[k] })) });
    for (const p of cast) await prisma.setParticipant.create({ data: { setId: s.id, personId: ids[p], roleDefinitionId: role.id } });
  };
  await set("big", channel.id, ["iconic", "fav", "damaged", "big0", "big1", "big2", "big3", "big4", "big5"], ["anna", "bea"], 3, "2018-01-01");
  await set("small", channel.id, ["small0", "small1"], ["anna"], 5, "2016-01-01");
  await set("other", other.id, ["elsewhere"], ["bea"], null, "2020-01-01");
  await prisma.setCreditRaw.create({
    data: { setId: ids["set:small"], rawName: `${RUN} Artist`, nameNorm: `${RUN} artist`, resolutionStatus: "RESOLVED", resolvedArtistId: artist.id },
  });
});

afterAll(async () => {
  await prisma.setMediaItem.deleteMany({ where: { mediaItemId: { in: media } } });
  await prisma.mediaItemTag.deleteMany({ where: { mediaItemId: { in: media } } });
  await prisma.mediaItem.deleteMany({ where: { id: { in: media } } });
  await prisma.setParticipant.deleteMany({ where: { personId: { in: [ids.anna, ids.bea].filter(Boolean) } } });
  await prisma.setCreditRaw.deleteMany({ where: { rawName: { startsWith: RUN } } });
  await prisma.set.deleteMany({ where: { title: { startsWith: RUN } } });
  await prisma.session.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.person.deleteMany({ where: { id: { in: [ids.anna, ids.bea].filter(Boolean) } } });
  await prisma.channel.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.label.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.artist.deleteMany({ where: { name: { startsWith: RUN } } });
  if (ids.group) {
    await prisma.tagDefinition.deleteMany({ where: { groupId: ids.group } });
    await prisma.tagGroup.delete({ where: { id: ids.group } });
  }
});

const keyOf = (id: string) => Object.entries(ids).find(([, v]) => v === id)?.[0];

describe("a channel's showcase", () => {
  it("leads with iconic, then ★, then fills from its sets — never a damaged photo, nor another channel's", async () => {
    const { items, curatedCount, setCount } = await getMakerShowcase({ kind: "channel", id: ids.channel }, { day: "2026-11-08" });
    const keys = items.map((i) => keyOf(i.id));
    expect(keys.slice(0, 2)).toEqual(["iconic", "fav"]);
    expect(items[0].source).toBe("iconic");
    expect(curatedCount).toBe(2);
    expect(setCount).toBe(2);
    expect(keys).not.toContain("damaged");
    expect(keys).not.toContain("elsewhere");
    expect(items).toHaveLength(10);
  });

  it("random: two per set in turn, so the small set shows early", async () => {
    const { items, mode } = await getMakerShowcase({ kind: "channel", id: ids.channel }, { mode: "random", seed: "x" });
    expect(mode).toBe("random");
    const firstFour = items.slice(0, 4).map((i) => keyOf(i.id));
    expect(firstFour.filter((k) => k?.startsWith("small"))).toHaveLength(2);
  });
});

describe("a label's and an artist's showcase", () => {
  it("a label draws on all its channels; an artist on the sets crediting them", async () => {
    const label = await getMakerShowcase({ kind: "label", id: ids.label });
    expect(label.items.map((i) => keyOf(i.id))).toContain("elsewhere");
    const artist = await getMakerShowcase({ kind: "artist", id: ids.artist });
    expect(new Set(artist.items.map((i) => keyOf(i.id)))).toEqual(new Set(["small0", "small1"]));
  });
});

describe("known for and faces", () => {
  it("rated first, then newest; faces by how many of its sets they lead", async () => {
    const known = await getMakerKnownFor({ kind: "channel", id: ids.channel });
    expect(known.map((s) => keyOf(s.id))).toEqual(["set:small", "set:big"]);
    expect(known[0].channelBrand?.name).toBe(`${RUN} Channel`);

    const faces = await getMakerFaces({ kind: "channel", id: ids.channel });
    expect(faces.map((f) => [keyOf(f.personId), f.sets])).toEqual([
      ["anna", 2],
      ["bea", 1],
    ]);
    const labelFaces = await getMakerFaces({ kind: "label", id: ids.label });
    expect(labelFaces.map((f) => [keyOf(f.personId), f.sets])).toEqual([
      ["anna", 2],
      ["bea", 2],
    ]);
  });
});
