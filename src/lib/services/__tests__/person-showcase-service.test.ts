import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getPersonKnownFor, getPersonShowcase } from "@/lib/services/person-showcase-service";
import { BEHIND_CAMERA_GROUP } from "@/lib/services/session-contributors";

// The Overview showcase (2026-10-16): iconic > ★ > outtake, then production photos
// at random; iconic fixed, the rest rotating by day. Runs against the DEV database;
// throwaway rows carry RUN and are removed afterwards.

const RUN = `psc${Date.now().toString(36)}`;
const ids: Record<string, string> = {};
const media: string[] = [];

async function photo(key: string, sessionKey: "prod" | "prod2" | "ref", data: { isFavorite?: boolean; decodeIssue?: string; isAnnotation?: boolean } = {}) {
  const m = await prisma.mediaItem.create({
    data: {
      sessionId: ids[sessionKey],
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

const tagged = (key: string, tag: "iconic" | "outtake", at: Date) =>
  prisma.mediaItemTag.create({ data: { mediaItemId: ids[key], tagDefinitionId: ids[`tag:${tag}`], createdAt: at } });

beforeAll(async () => {
  const group = await prisma.tagGroup.create({ data: { name: `${RUN} Judgment`, slug: `${RUN}-judgment` } });
  ids.group = group.id;
  for (const slug of ["iconic", "outtake"]) {
    const t = await prisma.tagDefinition.create({ data: { groupId: group.id, name: slug, slug, nameNorm: slug } });
    ids[`tag:${slug}`] = t.id;
  }

  const person = await prisma.person.create({ data: { icgId: `${RUN}-P`.toUpperCase() } });
  ids.P = person.id;
  const role = await prisma.contributionRoleDefinition.findFirstOrThrow({ where: { group: { name: { not: BEHIND_CAMERA_GROUP } } } });
  const prod = await prisma.session.create({ data: { name: `${RUN} production` } });
  const prod2 = await prisma.session.create({ data: { name: `${RUN} production 2` } });
  const ref = await prisma.session.create({ data: { name: `${RUN} reference`, type: "REFERENCE" } });
  ids.prod = prod.id;
  ids.prod2 = prod2.id;
  ids.ref = ref.id;
  for (const s of [prod, prod2, ref]) {
    await prisma.sessionContribution.create({ data: { sessionId: s.id, personId: person.id, roleDefinitionId: role.id } });
  }

  await photo("iconicOld", "prod");
  await photo("iconicNew", "prod");
  await photo("fav", "prod", { isFavorite: true });
  await photo("favAndOuttake", "prod", { isFavorite: true });
  await photo("outtake", "prod");
  await photo("refFav", "ref", { isFavorite: true }); // curated counts wherever it is
  await photo("refPlain", "ref"); // never part of the random fill
  for (let i = 0; i < 6; i++) await photo(`r${i}`, "prod");
  await photo("s0", "prod2");
  await photo("s1", "prod2");
  await photo("damaged", "prod", { isFavorite: true, decodeIssue: "Corrupt JPEG data" });
  await photo("annotation", "prod", { isFavorite: true, isAnnotation: true });
  await photo("hidden", "prod", { isFavorite: true });
  await prisma.mediaItemHiddenPerson.create({ data: { mediaItemId: ids.hidden, personId: person.id } });

  await tagged("iconicOld", "iconic", new Date("2026-01-01"));
  await tagged("iconicNew", "iconic", new Date("2026-02-01"));
  await tagged("favAndOuttake", "outtake", new Date());
  await tagged("outtake", "outtake", new Date());

  // The random fill takes two photos per set in turn: a big set and a small one
  for (const [key, photos] of [["big", ["r0", "r1", "r2", "r3", "r4", "r5"]], ["small", ["s0", "s1"]]] as const) {
    const set = await prisma.set.create({ data: { type: "photo", title: `${RUN} fill ${key}` } });
    ids[`set:${key}`] = set.id;
    await prisma.setParticipant.create({ data: { setId: set.id, personId: person.id, roleDefinitionId: role.id } });
    await prisma.setMediaItem.createMany({ data: photos.map((k) => ({ setId: set.id, mediaItemId: ids[k] })) });
  }

  // Known for: rated before unrated, then newest
  for (const [key, rating, date] of [
    ["old5", 5, "2015-01-01"],
    ["new3", 3, "2024-01-01"],
    ["newest", null, "2025-06-01"],
    ["older", null, "2019-06-01"],
  ] as const) {
    const set = await prisma.set.create({
      data: { type: "photo", title: `${RUN} ${key}`, rating, releaseDate: new Date(`${date}T00:00:00Z`) },
    });
    ids[key] = set.id;
    await prisma.setParticipant.create({ data: { setId: set.id, personId: person.id, roleDefinitionId: role.id } });
  }
});

afterAll(async () => {
  await prisma.setMediaItem.deleteMany({ where: { mediaItemId: { in: media } } });
  await prisma.mediaItemTag.deleteMany({ where: { mediaItemId: { in: media } } });
  await prisma.mediaItemHiddenPerson.deleteMany({ where: { mediaItemId: { in: media } } });
  await prisma.mediaItem.deleteMany({ where: { id: { in: media } } });
  if (ids.P) {
    await prisma.setParticipant.deleteMany({ where: { personId: ids.P } });
    await prisma.sessionContribution.deleteMany({ where: { personId: ids.P } });
  }
  await prisma.set.deleteMany({ where: { title: { startsWith: RUN } } });
  await prisma.session.deleteMany({ where: { id: { in: [ids.prod, ids.prod2, ids.ref].filter(Boolean) } } });
  if (ids.P) await prisma.person.delete({ where: { id: ids.P } });
  if (ids.group) {
    await prisma.tagDefinition.deleteMany({ where: { groupId: ids.group } });
    await prisma.tagGroup.delete({ where: { id: ids.group } });
  }
});

const keyOf = (id: string) => Object.entries(ids).find(([, v]) => v === id)?.[0];

describe("getPersonShowcase", () => {
  it("leads with iconic (newest tagged first), then ★, then outtake, then the random fill", async () => {
    const { items, curatedCount } = await getPersonShowcase(ids.P, { day: "2026-10-16" });
    const keys = items.map((i) => keyOf(i.id));
    expect(keys.slice(0, 2)).toEqual(["iconicNew", "iconicOld"]);
    expect(new Set(keys.slice(2, 5))).toEqual(new Set(["fav", "favAndOuttake", "refFav"]));
    expect(keys[5]).toBe("outtake");
    expect(new Set(keys.slice(6))).toEqual(new Set(["r0", "r1", "r2", "r3", "r4", "r5", "s0", "s1"]));
    expect(curatedCount).toBe(6);
    expect(items.map((i) => i.source).slice(0, 6)).toEqual(["iconic", "iconic", "favorite", "favorite", "favorite", "outtake"]);
  });

  it("leaves out damaged copies, edited copies, photos the person is hidden from, and plain reference photos", async () => {
    const keys = (await getPersonShowcase(ids.P, { day: "2026-10-16" })).items.map((i) => keyOf(i.id));
    for (const k of ["damaged", "annotation", "hidden", "refPlain"]) expect(keys).not.toContain(k);
  });

  it("rotates by day — the same all day, iconic stays in front", async () => {
    const a = (await getPersonShowcase(ids.P, { day: "2026-10-16" })).items.map((i) => i.id);
    const again = (await getPersonShowcase(ids.P, { day: "2026-10-16" })).items.map((i) => i.id);
    expect(again).toEqual(a);
    const days = await Promise.all(
      ["2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20"].map(async (day) =>
        (await getPersonShowcase(ids.P, { day })).items.map((i) => i.id),
      ),
    );
    for (const d of days) expect(d.slice(0, 2)).toEqual(a.slice(0, 2));
    expect(days.some((d) => d.join() !== a.join())).toBe(true);
  });

  it("fills two photos per set in turn — a small set is not crowded out by a big one", async () => {
    for (const day of ["2026-10-16", "2026-10-17", "2026-10-18"]) {
      const { items } = await getPersonShowcase(ids.P, { day });
      const firstRound = items.filter((i) => i.source === "random").slice(0, 4).map((i) => keyOf(i.id));
      expect(firstRound.filter((k) => k === "s0" || k === "s1")).toHaveLength(2);
      expect(firstRound.filter((k) => k?.startsWith("r"))).toHaveLength(2);
    }
  });

  it("caps the pool, curated first", async () => {
    const { items } = await getPersonShowcase(ids.P, { size: 3, day: "2026-10-16" });
    expect(items.map((i) => keyOf(i.id))[0]).toBe("iconicNew");
    expect(items).toHaveLength(3);
  });
});

describe("getPersonShowcase — random mode (Shuffle)", () => {
  const random = (seed: string) => getPersonShowcase(ids.P, { mode: "random", seed });

  it("ignores the marks for the choice but keeps them as chips, production photos only", async () => {
    const { items, setCount } = await random("seed-a");
    const keys = items.map((i) => keyOf(i.id));
    // Curated reference photo out, damaged / edited / hidden still out
    for (const k of ["refFav", "refPlain", "damaged", "annotation", "hidden"]) expect(keys).not.toContain(k);
    // Everything else from production is in, marks included
    expect(new Set(keys)).toEqual(
      new Set(["iconicOld", "iconicNew", "fav", "favAndOuttake", "outtake", "r0", "r1", "r2", "r3", "r4", "r5", "s0", "s1"]),
    );
    expect(items.find((i) => i.id === ids.iconicNew)?.source).toBe("iconic");
    expect(items.find((i) => i.id === ids.r0)?.source).toBe("random");
    expect(setCount).toBeGreaterThanOrEqual(2);
  });

  it("deals two per set in turn — the small set is in the first round", async () => {
    for (const seed of ["seed-a", "seed-b", "seed-c"]) {
      const keys = (await random(seed)).items.map((i) => keyOf(i.id));
      // Three groups: the big set, the small set, and the loose production photos (5 marked ones)
      const firstRound = keys.slice(0, 6);
      expect(firstRound.filter((k) => k === "s0" || k === "s1")).toHaveLength(2);
    }
  });

  it("the same seed gives the same deal, another seed another", async () => {
    const a = (await random("seed-a")).items.map((i) => i.id);
    expect((await random("seed-a")).items.map((i) => i.id)).toEqual(a);
    const others = await Promise.all(["seed-b", "seed-c", "seed-d"].map(async (s) => (await random(s)).items.map((i) => i.id)));
    expect(others.some((o) => o.join() !== a.join())).toBe(true);
  });
});

describe("getPersonKnownFor", () => {
  it("puts rated sets first, then the newest", async () => {
    const sets = await getPersonKnownFor(ids.P);
    expect(sets.map((s) => keyOf(s.id)).slice(0, 4)).toEqual(["old5", "new3", "newest", "older"]);
    expect(sets[0]).toMatchObject({ rating: 5, isVideo: false, coverUrl: null });
  });
});
