import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { normalizeForSearch } from "@/lib/normalize";
import {
  addArtistAlias,
  AliasRefused,
  artistCreditResolution,
  getWaitingCredits,
  linkCreditsToArtist,
  linkExactCredits,
} from "@/lib/services/artist-credit-service";
import { getArtistChannels, getArtistHeroStats } from "@/lib/services/artist-service";
import { BEHIND_CAMERA_ROLE, LEAD_ROLE } from "@/lib/services/session-contributors";

// Who a behind-camera credit is (2026-11-08): exact and unambiguous names link
// by themselves; similar ones wait to be decided. DEV database; rows carry RUN.

const RUN = `acr${Date.now().toString(36)}`;
const ids: Record<string, string> = {};

async function artist(key: string, name: string) {
  ids[key] = (await prisma.artist.create({ data: { name, nameNorm: normalizeForSearch(name) } })).id;
}

async function credit(key: string, rawName: string, roleId: string | null) {
  ids[key] = (
    await prisma.setCreditRaw.create({
      data: { setId: ids.set, rawName, nameNorm: normalizeForSearch(rawName), roleDefinitionId: roleId, resolutionStatus: "UNRESOLVED" },
    })
  ).id;
}

const statusOf = async (key: string) =>
  prisma.setCreditRaw.findUniqueOrThrow({ where: { id: ids[key] }, select: { resolutionStatus: true, resolvedArtistId: true } });

beforeAll(async () => {
  const behind = await prisma.contributionRoleDefinition.findFirstOrThrow({ where: BEHIND_CAMERA_ROLE });
  const lead = await prisma.contributionRoleDefinition.findFirstOrThrow({ where: LEAD_ROLE });
  ids.behind = behind.id;
  const channel = await prisma.channel.create({ data: { name: `${RUN} Channel` } });
  ids.channel = channel.id;
  ids.set = (await prisma.set.create({ data: { type: "photo", title: `${RUN} set`, channelId: channel.id, releaseDate: new Date("2019-06-01") } })).id;

  await artist("ann", `${RUN} Ann Lens`);
  await artist("twinA", `${RUN} Twin`);
  await artist("twinB", `${RUN} Twin`);
  await credit("exact", `${RUN} Ann Lens`, behind.id);
  await credit("similar", `${RUN} Anne Lense`, behind.id);
  await credit("onCamera", `${RUN} Ann Lens`, lead.id);
  await credit("twin", `${RUN} Twin`, behind.id);
  await credit("alias", `${RUN} A. Lens`, null);
});

afterAll(async () => {
  await prisma.setCreditRaw.deleteMany({ where: { rawName: { startsWith: RUN } } });
  await prisma.set.deleteMany({ where: { title: { startsWith: RUN } } });
  await prisma.channel.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.artist.deleteMany({ where: { name: { startsWith: RUN } } });
});

describe("a new credit from an import", () => {
  it("links only when the name is one artist's", async () => {
    expect(await artistCreditResolution(prisma, `${RUN} ann lens`)).toEqual({ resolutionStatus: "RESOLVED", resolvedArtistId: ids.ann });
    expect(await artistCreditResolution(prisma, `${RUN} Twin`)).toEqual({ resolutionStatus: "UNRESOLVED", resolvedArtistId: null });
    expect(await artistCreditResolution(prisma, `${RUN} Nobody`)).toMatchObject({ resolutionStatus: "UNRESOLVED" });
  });
});

describe("credits waiting for an artist", () => {
  it("lists the same name first, then similar — never an on-camera credit; flags a name two artists share", async () => {
    // (The shared RUN prefix makes every test name a little similar to every other)
    const waiting = await getWaitingCredits(ids.ann);
    expect(waiting[0]).toMatchObject({ creditId: ids.exact, exact: true, ambiguous: false });
    expect(waiting.find((w) => w.creditId === ids.similar)).toMatchObject({ exact: false });
    expect(waiting.some((w) => w.creditId === ids.onCamera)).toBe(false);
    const twin = await getWaitingCredits(ids.twinA);
    expect(twin[0]).toMatchObject({ creditId: ids.twin, exact: true, ambiguous: true });
  });

  it("an alias links the credits carrying exactly it; refuses the own name", async () => {
    await expect(addArtistAlias(ids.ann, `${RUN} Ann Lens`)).rejects.toBeInstanceOf(AliasRefused);
    const { linked } = await addArtistAlias(ids.ann, `${RUN} A. Lens`);
    expect(linked).toBe(1);
    expect(await statusOf("alias")).toEqual({ resolutionStatus: "RESOLVED", resolvedArtistId: ids.ann });
    expect(await artistCreditResolution(prisma, `${RUN} a. lens`)).toMatchObject({ resolvedArtistId: ids.ann });
  });

  it("links all exact ones but not an ambiguous or on-camera credit; picks per item", async () => {
    expect(await linkExactCredits(ids.ann)).toBe(1);
    expect(await statusOf("exact")).toMatchObject({ resolvedArtistId: ids.ann });
    expect(await statusOf("onCamera")).toMatchObject({ resolutionStatus: "UNRESOLVED" });
    expect(await linkExactCredits(ids.twinA)).toBe(0);
    // You decide: a similar name, by hand
    expect(await linkCreditsToArtist(ids.ann, [ids.similar, ids.onCamera])).toBe(1);
    expect(await statusOf("onCamera")).toMatchObject({ resolutionStatus: "UNRESOLVED" });
  });

  it("the hero counts the credited sets and roles; the channels they worked for", async () => {
    const stats = await getArtistHeroStats(ids.ann);
    expect(stats).toMatchObject({ photoSets: 1, videoSets: 0, channels: 1, firstYear: 2019, lastYear: 2019 });
    expect(stats.roles.length).toBeGreaterThan(0);
    expect((await getArtistChannels(ids.ann)).map((c) => [c.brand.name, c.sets])).toEqual([[`${RUN} Channel`, 1]]);
  });
});
