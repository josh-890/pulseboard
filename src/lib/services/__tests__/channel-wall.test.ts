import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getChannelModels, getChannelWall } from "@/lib/services/channel-wall-service";
import { LEAD_ROLE } from "@/lib/services/session-contributors";

// A channel's whole output (2026-11-08): your sets, staged sets, catalogue sets
// by import alias — one entry per CoverId — and everyone seen on it. DEV database;
// throwaway rows carry RUN.

const RUN = `cwl${Date.now().toString(36)}`;
const U = RUN.toUpperCase();
const ids: Record<string, string> = {};
const cover = (n: string) => `${U}-${n}`;

beforeAll(async () => {
  const channel = await prisma.channel.create({ data: { name: `${RUN} Channel`, importAliases: [`${RUN} feed`] } });
  const other = await prisma.channel.create({ data: { name: `${RUN} Other` } });
  ids.channel = channel.id;
  ids.other = other.id;
  const role = await prisma.contributionRoleDefinition.findFirstOrThrow({ where: LEAD_ROLE });
  const anna = await prisma.person.create({ data: { icgId: `${U}-A` } });
  ids.anna = anna.id;
  ids.contact = (await prisma.contact.create({ data: { icgId: `${U}-B`, name: "Bea" } })).id;

  const set = await prisma.set.create({
    data: { type: "photo", title: `${RUN} Have`, channelId: channel.id, externalId: cover("HAVE"), releaseDate: new Date("2020-01-01"), rating: 4 },
  });
  ids.set = set.id;
  await prisma.setParticipant.create({ data: { setId: set.id, personId: anna.id, roleDefinitionId: role.id } });

  const staged = (title: string, externalId: string, channelId: string, status: "PENDING" | "APPROVED" | "PROMOTED", cast: string[]) =>
    prisma.stagingSet.create({
      data: {
        title: `${RUN} ${title}`,
        channelName: `${RUN} feed`,
        channelId,
        externalId,
        status,
        participantIcgIds: cast,
        participants: cast.map((icgId) => ({ name: icgId === `${U}-B` ? "Bea" : "Anna", icgId })),
        releaseDate: new Date("2021-05-05"),
      },
    });
  await staged("Have (promoted)", cover("HAVE"), channel.id, "PROMOTED", [`${U}-A`]);
  ids.staged = (await staged("Waiting", cover("WAIT"), channel.id, "APPROVED", [`${U}-A`, `${U}-B`])).id;
  await staged("Elsewhere", cover("ELSE"), other.id, "PENDING", []);

  await prisma.catalogueSet.createMany({
    data: [
      { coverId: cover("HAVE"), channelName: `${RUN} FEED`, title: "Have", castIcgIds: [`${U}-A`] },
      { coverId: cover("WAIT"), channelName: ` ${RUN} feed `, title: "Waiting", castIcgIds: [`${U}-A`, `${U}-B`] },
      { coverId: cover("ONLY"), channelName: `${RUN} feed`, title: "Only in the catalogue", castIcgIds: [`${U}-B`, `${U}-C`], date: new Date("2012-03-03") },
      { coverId: cover("ELSE"), channelName: `${RUN} feed`, title: "Staged elsewhere", castIcgIds: [] },
      { coverId: cover("NOPE"), channelName: `${RUN} unrelated`, title: "Another channel", castIcgIds: [`${U}-A`] },
    ],
  });
});

afterAll(async () => {
  await prisma.catalogueSet.deleteMany({ where: { coverId: { startsWith: U } } });
  await prisma.stagingSet.deleteMany({ where: { title: { startsWith: RUN } } });
  await prisma.setParticipant.deleteMany({ where: { personId: ids.anna } });
  await prisma.set.deleteMany({ where: { title: { startsWith: RUN } } });
  await prisma.person.deleteMany({ where: { icgId: { startsWith: U } } });
  await prisma.contact.deleteMany({ where: { icgId: { startsWith: U } } });
  await prisma.channel.deleteMany({ where: { name: { startsWith: RUN } } });
});

describe("the channel wall", () => {
  it("library: your sets only", async () => {
    const wall = await getChannelWall(ids.channel, "library");
    expect(wall.rows.map((r) => r.title)).toEqual([`${RUN} Have`]);
    expect(wall.rows[0]).toMatchObject({ kind: "set", rating: 4, castIcgIds: [`${U}-A`] });
  });

  it("all: one entry per CoverId — yours, then staged, then what only the catalogue knows", async () => {
    const wall = await getChannelWall(ids.channel, "all");
    expect(wall.counts).toEqual({ set: 1, staged: 1, catalogue: 1 });
    const byKey = Object.fromEntries(wall.rows.map((r) => [r.key, r.kind]));
    expect(byKey).toEqual({ [cover("HAVE")]: "set", [cover("WAIT")]: "staged", [cover("ONLY")]: "catalogue" });
    const waiting = wall.rows.find((r) => r.kind === "staged")!;
    expect(waiting.href).toContain(`select=${ids.staged}`);
    expect(waiting.href).toContain("status=APPROVED");
    expect(wall.rows.find((r) => r.kind === "catalogue")).toMatchObject({ href: null, title: "Only in the catalogue" });
  });

  it("counts everyone on it: Persons first, then Contacts, then the unknown", async () => {
    const models = await getChannelModels(await getChannelWall(ids.channel, "all"));
    expect(models.map((m) => [m.icgId, m.kind, m.inLibrary, m.known])).toEqual([
      [`${U}-A`, "person", 1, 2],
      [`${U}-B`, "contact", 0, 2],
      [`${U}-C`, "unknown", 0, 1],
    ]);
  });

  it("gives each model the covers of her three newest sets that have one", async () => {
    const row = (key: string, date: string, coverUrl: string | null, cast: string[]) => ({
      key,
      kind: "set" as const,
      href: `/sets/${key}`,
      title: key,
      releaseDate: new Date(date),
      isVideo: false,
      coverUrl,
      coverFocalX: null,
      coverFocalY: null,
      rating: null,
      status: null,
      castIcgIds: cast,
      castNames: [],
    });
    const wall = {
      rows: [
        row("old", "2010-01-01", "u/old", [`${U}-A`]),
        row("new", "2024-01-01", "u/new", [`${U}-A`, `${U}-B`]),
        row("bare", "2023-01-01", null, [`${U}-A`]),
        row("mid", "2018-01-01", "u/mid", [`${U}-A`]),
        row("older", "2015-01-01", "u/older", [`${U}-A`]),
      ],
      counts: { set: 5, staged: 0, catalogue: 0 },
    };
    const models = await getChannelModels(wall);
    const covers = Object.fromEntries(models.map((m) => [m.icgId, m.covers.map((c) => c.url)]));
    expect(covers).toEqual({ [`${U}-A`]: ["u/new", "u/mid", "u/older"], [`${U}-B`]: ["u/new"] });
  });
});
