import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getMediaItemOrigin } from "@/lib/services/media-origin-service";
import { BEHIND_CAMERA_ROLE, LEAD_ROLE } from "@/lib/services/session-contributors";
import { mediaOriginTarget } from "@/lib/media-origin-href";

// Where an image comes from (2026-10-18) — the way back from favorites and
// collections to its set and the people in it. Runs against the DEV database;
// throwaway rows carry RUN and are removed afterwards.

const RUN = `mor${Date.now().toString(36)}`;
const ids: Record<string, string> = {};
const media: string[] = [];

async function photo(key: string, sessionKey: string, data: { copiedFromMediaItemId?: string } = {}) {
  const m = await prisma.mediaItem.create({
    data: {
      sessionId: ids[sessionKey],
      mediaType: "PHOTO",
      filename: `${key}.jpg`,
      mimeType: "image/jpeg",
      size: 1,
      originalWidth: 4,
      originalHeight: 5,
      variants: { master_4000: `${RUN}/${key}.webp` },
      ...data,
    },
  });
  ids[key] = m.id;
  media.push(m.id);
}

beforeAll(async () => {
  const shown = await prisma.person.create({
    data: { icgId: `${RUN}-A`.toUpperCase(), aliases: { create: { name: `${RUN} Anna`, isCommon: true } } },
  });
  const other = await prisma.person.create({ data: { icgId: `${RUN}-B`.toUpperCase() } });
  const crew = await prisma.person.create({ data: { icgId: `${RUN}-C`.toUpperCase() } });
  ids.A = shown.id;
  ids.B = other.id;
  ids.C = crew.id;
  const onCamera = await prisma.contributionRoleDefinition.findFirstOrThrow({ where: LEAD_ROLE });
  const behind = await prisma.contributionRoleDefinition.findFirstOrThrow({ where: BEHIND_CAMERA_ROLE });

  const prod = await prisma.session.create({ data: { name: `${RUN} production` } });
  const ref = await prisma.session.create({ data: { name: `${RUN} reference`, type: "REFERENCE", personId: shown.id } });
  ids.prod = prod.id;
  ids.ref = ref.id;
  await prisma.sessionContribution.create({ data: { sessionId: prod.id, personId: shown.id, roleDefinitionId: onCamera.id } });
  await prisma.sessionContribution.create({ data: { sessionId: prod.id, personId: other.id, roleDefinitionId: onCamera.id } });
  await prisma.sessionContribution.create({ data: { sessionId: prod.id, personId: crew.id, roleDefinitionId: behind.id } });

  await photo("inSets", "prod");
  await photo("loose", "prod");
  await photo("copy", "ref", { copiedFromMediaItemId: ids.inSets });
  await photo("refOnly", "ref");
  // B is not in this one
  await prisma.mediaItemHiddenPerson.create({ data: { mediaItemId: ids.inSets, personId: other.id } });

  for (const [key, date] of [["later", "2020-01-01"], ["earlier", "2010-01-01"]] as const) {
    const set = await prisma.set.create({ data: { type: "photo", title: `${RUN} ${key}`, releaseDate: new Date(date) } });
    ids[`set:${key}`] = set.id;
    await prisma.setMediaItem.create({ data: { setId: set.id, mediaItemId: ids.inSets } });
  }
});

afterAll(async () => {
  await prisma.setMediaItem.deleteMany({ where: { mediaItemId: { in: media } } });
  await prisma.mediaItemHiddenPerson.deleteMany({ where: { mediaItemId: { in: media } } });
  await prisma.mediaItem.updateMany({ where: { id: { in: media } }, data: { copiedFromMediaItemId: null } });
  await prisma.mediaItem.deleteMany({ where: { id: { in: media } } });
  await prisma.sessionContribution.deleteMany({ where: { sessionId: { in: [ids.prod, ids.ref].filter(Boolean) } } });
  await prisma.set.deleteMany({ where: { title: { startsWith: RUN } } });
  await prisma.session.deleteMany({ where: { id: { in: [ids.prod, ids.ref].filter(Boolean) } } });
  const persons = [ids.A, ids.B, ids.C].filter(Boolean);
  await prisma.personAlias.deleteMany({ where: { personId: { in: persons } } });
  await prisma.person.deleteMany({ where: { id: { in: persons } } });
});

describe("getMediaItemOrigin", () => {
  it("names the sets (earliest first) and only the people on camera and not hidden", async () => {
    const origin = await getMediaItemOrigin(ids.inSets);
    expect(origin?.imageId).toBe(ids.inSets);
    expect(origin?.sets.map((s) => s.id)).toEqual([ids["set:earlier"], ids["set:later"]]);
    expect(origin?.people).toEqual([{ id: ids.A, name: `${RUN} Anna (${`${RUN}-A`.toUpperCase()})` }]);
    expect(origin?.session).toMatchObject({ id: ids.prod, type: "PRODUCTION" });
    expect(mediaOriginTarget(origin!)).toEqual({
      href: `/sets/${ids["set:earlier"]}?photo=${ids.inSets}`,
      label: `${RUN} earlier`,
      kind: "set",
    });
  });

  it("a reference copy points back through its source image", async () => {
    const origin = await getMediaItemOrigin(ids.copy);
    expect(origin?.imageId).toBe(ids.inSets);
    expect(origin?.sets).toHaveLength(2);
    expect(origin?.session.type).toBe("REFERENCE");
    expect(origin?.referencePerson?.id).toBe(ids.A);
  });

  it("without a set it leads to the reference person, or the session", async () => {
    const ref = await getMediaItemOrigin(ids.refOnly);
    expect(ref?.sets).toEqual([]);
    expect(mediaOriginTarget(ref!)).toMatchObject({ href: `/people/${ids.A}`, kind: "person" });

    const loose = await getMediaItemOrigin(ids.loose);
    expect(loose?.people.map((p) => p.id).sort()).toEqual([ids.A, ids.B].sort());
    expect(mediaOriginTarget(loose!)).toMatchObject({ href: `/sessions/${ids.prod}`, kind: "session" });
  });

  it("is null for an unknown image", async () => {
    expect(await getMediaItemOrigin(`${RUN}-missing`)).toBeNull();
  });
});
