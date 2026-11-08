import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getLabelChannels, getLabelHeroStats, getLabels, setLabelRating, setLabelText } from "@/lib/services/label-service";
import { getLabelWall } from "@/lib/services/channel-wall-service";
import { LEAD_ROLE } from "@/lib/services/session-contributors";

// The label page (2026-11-08): numbers over the channels it OWNS (not every
// channel mapped to it), its channels as tiles, one wall of all their sets.
// DEV database; throwaway rows carry RUN.

const RUN = `lbp${Date.now().toString(36)}`;
const U = RUN.toUpperCase();
const ids: Record<string, string> = {};

beforeAll(async () => {
  const label = await prisma.label.create({ data: { name: `${RUN} Label` } });
  const elsewhere = await prisma.label.create({ data: { name: `${RUN} Elsewhere` } });
  ids.label = label.id;
  const big = await prisma.channel.create({ data: { name: `${RUN} Big`, labelId: label.id, importAliases: [`${RUN} big`] } });
  const small = await prisma.channel.create({ data: { name: `${RUN} Small`, labelId: label.id, closed: true } });
  // Mapped to the label as evidence, but owned by another — not the label's
  const mapped = await prisma.channel.create({ data: { name: `${RUN} Mapped`, labelId: elsewhere.id } });
  await prisma.channelLabelMap.create({ data: { channelId: mapped.id, labelId: label.id, confidence: 0.4 } });
  Object.assign(ids, { big: big.id, small: small.id, mapped: mapped.id });

  const role = await prisma.contributionRoleDefinition.findFirstOrThrow({ where: LEAD_ROLE });
  const p = await prisma.person.create({ data: { icgId: `${U}-A` } });
  ids.person = p.id;
  const set = async (title: string, channelId: string, type: "photo" | "video", date: string, externalId?: string) => {
    const s = await prisma.set.create({ data: { title: `${RUN} ${title}`, channelId, type, releaseDate: new Date(date), externalId } });
    await prisma.setParticipant.create({ data: { setId: s.id, personId: p.id, roleDefinitionId: role.id } });
  };
  await set("b1", big.id, "photo", "2014-01-01", `${U}-B1`);
  await set("b2", big.id, "video", "2019-01-01");
  await set("s1", small.id, "photo", "2011-01-01");
  await set("m1", mapped.id, "photo", "2001-01-01");
  await prisma.catalogueSet.create({ data: { coverId: `${U}-C1`, channelName: `${RUN} BIG`, title: "Catalogue", castIcgIds: [] } });
});

afterAll(async () => {
  await prisma.catalogueSet.deleteMany({ where: { coverId: { startsWith: U } } });
  await prisma.setParticipant.deleteMany({ where: { personId: ids.person } });
  await prisma.set.deleteMany({ where: { title: { startsWith: RUN } } });
  await prisma.person.deleteMany({ where: { icgId: { startsWith: U } } });
  await prisma.channelLabelMap.deleteMany({ where: { channelId: { in: [ids.big, ids.small, ids.mapped].filter(Boolean) } } });
  await prisma.channel.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.label.deleteMany({ where: { name: { startsWith: RUN } } });
});

describe("the label hero and list", () => {
  it("counts the channels it owns and their sets, not a merely mapped channel", async () => {
    expect(await getLabelHeroStats(ids.label)).toEqual({
      channels: 2,
      photoSets: 2,
      videoSets: 1,
      models: 1,
      firstYear: 2011,
      lastYear: 2019,
    });
    const listed = (await getLabels(RUN)).find((l) => l.id === ids.label);
    expect(listed?._count.ownedChannels).toBe(2);
  });

  it("lists its channels most sets first, with years and closed", async () => {
    const tiles = await getLabelChannels(ids.label);
    expect(tiles.map((t) => [t.brand.name, t.sets, t.videoSets, t.firstYear, t.lastYear, t.closed])).toEqual([
      [`${RUN} Big`, 2, 1, 2014, 2019, false],
      [`${RUN} Small`, 1, 0, 2011, 2011, true],
    ]);
  });

  it("keeps a rating and an About text", async () => {
    await setLabelRating(ids.label, 5);
    await setLabelText(ids.label, "description", "  A studio  ");
    expect(await prisma.label.findUniqueOrThrow({ where: { id: ids.label } })).toMatchObject({ rating: 5, description: "A studio" });
    await expect(setLabelRating(ids.label, 0)).rejects.toThrow();
  });
});

describe("the label wall", () => {
  it("joins its channels' walls, each tile marked with its channel", async () => {
    const wall = await getLabelWall(ids.label, "all");
    expect(wall.counts).toEqual({ set: 3, staged: 0, catalogue: 1 });
    expect(new Set(wall.rows.map((r) => r.channel?.brand.name))).toEqual(new Set([`${RUN} Big`, `${RUN} Small`]));
    expect(wall.rows.some((r) => r.title === `${RUN} m1`)).toBe(false);
  });
});
