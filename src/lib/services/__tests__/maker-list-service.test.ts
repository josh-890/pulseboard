import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { normalizeForSearch } from "@/lib/normalize";
import { getArtistTiles, getChannelTiles, getLabelTiles } from "@/lib/services/maker-list-service";

// The list pages as tiles (2026-11-08): numbers per maker, filters, sorting.
// DEV database; throwaway rows carry RUN.

const RUN = `mls${Date.now().toString(36)}`;
const ids: Record<string, string> = {};

beforeAll(async () => {
  const label = await prisma.label.create({ data: { name: `${RUN} Label`, rating: 4 } });
  ids.label = label.id;
  const big = await prisma.channel.create({ data: { name: `${RUN} Big`, labelId: label.id, tier: "PREMIUM", rating: 3 } });
  const small = await prisma.channel.create({ data: { name: `${RUN} Small`, labelId: label.id, tier: "LOW", rating: 5 } });
  Object.assign(ids, { big: big.id, small: small.id });
  for (const [title, channelId, type, date] of [
    ["b1", big.id, "photo", "2012-01-01"],
    ["b2", big.id, "video", "2015-01-01"],
    ["b3", big.id, "photo", "2016-01-01"],
    ["s1", small.id, "photo", "2020-01-01"],
  ] as const) {
    ids[title] = (await prisma.set.create({ data: { title: `${RUN} ${title}`, channelId, type, releaseDate: new Date(date) } })).id;
  }
  const artist = await prisma.artist.create({ data: { name: `${RUN} Shooter`, nameNorm: normalizeForSearch(`${RUN} Shooter`), nationality: "Germany" } });
  ids.artist = artist.id;
  await prisma.artistAlias.create({ data: { artistId: artist.id, alias: `${RUN} Alt`, aliasNorm: normalizeForSearch(`${RUN} Alt`) } });
  for (const s of ["b1", "s1"]) {
    await prisma.setCreditRaw.create({ data: { setId: ids[s], rawName: "x", resolutionStatus: "RESOLVED", resolvedArtistId: artist.id } });
  }
});

afterAll(async () => {
  await prisma.setCreditRaw.deleteMany({ where: { resolvedArtistId: ids.artist } });
  await prisma.set.deleteMany({ where: { title: { startsWith: RUN } } });
  await prisma.channel.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.label.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.artist.deleteMany({ where: { name: { startsWith: RUN } } });
});

describe("channel tiles", () => {
  it("count sets and years per channel, sort and filter", async () => {
    const bySets = await getChannelTiles({ q: RUN, sort: "sets" });
    expect(bySets.map((t) => [t.brand.name, t.sets, t.videoSets, t.firstYear, t.lastYear])).toEqual([
      [`${RUN} Big`, 3, 1, 2012, 2016],
      [`${RUN} Small`, 1, 0, 2020, 2020],
    ]);
    expect(bySets[0].context?.label).toBe(`${RUN} Label`);
    expect((await getChannelTiles({ q: RUN, sort: "rating" })).map((t) => t.id)).toEqual([ids.small, ids.big]);
    expect((await getChannelTiles({ q: RUN, sort: "newest" })).map((t) => t.id)).toEqual([ids.small, ids.big]);
    expect((await getChannelTiles({ q: RUN, tier: "PREMIUM", sort: "sets" })).map((t) => t.id)).toEqual([ids.big]);
    expect((await getChannelTiles({ q: RUN, minRating: 4, sort: "sets" })).map((t) => t.id)).toEqual([ids.small]);
  });
});

describe("label and artist tiles", () => {
  it("a label counts its owned channels and their sets; an artist the credited sets and channels, found by alias", async () => {
    const [label] = await getLabelTiles({ q: RUN, sort: "sets" });
    expect(label).toMatchObject({ id: ids.label, sets: 4, videoSets: 1, channels: 2, firstYear: 2012, lastYear: 2020, rating: 4 });
    const [artist] = await getArtistTiles({ q: `${RUN} Alt`, sort: "sets" });
    expect(artist).toMatchObject({ id: ids.artist, sets: 2, channels: 2, firstYear: 2012, lastYear: 2020, context: { label: "Germany" } });
  });
});
