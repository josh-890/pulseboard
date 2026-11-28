import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { applyActToPhotos, undoApplyActToPhotos, unlinkActFromPhotos } from "@/lib/services/intensity-service";

// An act seen on photos (2026-11-28): ticking is linking — for each photo's
// session and each chosen person, their lead contribution gets the act (ticked
// if missing) and the photo as evidence; someone only appearing, or not in a
// photo's session, is skipped. Undo takes back only what the step added.
const RUN = `pin${Date.now().toString(36)}`;
const ids: Record<string, string> = {};

async function photo(key: string, sessionKey: string) {
  ids[key] = (
    await prisma.mediaItem.create({
      data: {
        sessionId: ids[sessionKey]!,
        mediaType: "PHOTO",
        filename: `${RUN}-${key}.jpg`,
        mimeType: "image/jpeg",
        size: 1,
        originalWidth: 1,
        originalHeight: 1,
        fileRef: `${RUN}-${key}.jpg`,
      },
    })
  ).id;
}

const actOf = (contributionId: string) =>
  prisma.contributionAct.findFirst({ where: { contributionId, actId: ids.act! }, select: { id: true, media: { select: { mediaItemId: true } } } });
const photosOf = async (contributionId: string) => ((await actOf(contributionId))?.media.map((m) => m.mediaItemId) ?? []).sort();

beforeAll(async () => {
  for (const who of ["anna", "bea", "guest"]) {
    ids[who] = (await prisma.person.create({ data: { icgId: `${RUN}-${who}`.toUpperCase(), sexAtBirth: "female" } })).id;
  }
  ids.s1 = (await prisma.session.create({ data: { name: `${RUN} s1` } })).id;
  ids.s2 = (await prisma.session.create({ data: { name: `${RUN} s2` } })).id;
  const c = async (key: string, s: string, who: string, role = "crd_model") =>
    (ids[key] = (await prisma.sessionContribution.create({ data: { sessionId: ids[s]!, personId: ids[who]!, roleDefinitionId: role } })).id);
  await c("c1anna", "s1", "anna");
  await c("c1bea", "s1", "bea");
  await c("c1guest", "s1", "guest", "crd_appearance");
  await c("c2anna", "s2", "anna");
  ids.scenario = (await prisma.intensityScenario.create({ data: { name: `${RUN} scenario`, sortOrder: 99 } })).id;
  ids.act = (await prisma.intensityAct.create({ data: { scenarioId: ids.scenario!, name: "act", level: 3 } })).id;
  await photo("m1", "s1");
  await photo("m2", "s1");
  await photo("m3", "s2");
});

afterAll(async () => {
  const sessions = [ids.s1, ids.s2].filter(Boolean) as string[];
  await prisma.sessionContribution.deleteMany({ where: { sessionId: { in: sessions } } });
  await prisma.mediaItem.deleteMany({ where: { sessionId: { in: sessions } } });
  await prisma.session.deleteMany({ where: { id: { in: sessions } } });
  await prisma.person.deleteMany({ where: { icgId: { startsWith: RUN.toUpperCase() } } });
  await prisma.intensityScenario.deleteMany({ where: { name: { startsWith: RUN } } });
});

describe("an act on photos", () => {
  it("ticks the act where it is missing and links the photo, in one step; Undo takes both back", async () => {
    const r = await applyActToPhotos([ids.anna!], ids.act!, [ids.m1!]);
    expect(r.skipped).toBe(0);
    expect(r.undo.createdActIds).toHaveLength(1);
    expect(await photosOf(ids.c1anna!)).toEqual([ids.m1]);
    // Bea was not chosen
    expect(await actOf(ids.c1bea!)).toBeNull();
    await undoApplyActToPhotos(r.undo);
    expect(await actOf(ids.c1anna!)).toBeNull();
  });

  it("keeps a tick that was there: only the photo is new, and Undo leaves the tick", async () => {
    await prisma.contributionAct.create({ data: { contributionId: ids.c1anna!, actId: ids.act! } });
    const r = await applyActToPhotos([ids.anna!], ids.act!, [ids.m2!]);
    expect(r.undo.createdActIds).toEqual([]);
    expect(r.undo.links).toHaveLength(1);
    // Again: nothing new
    const again = await applyActToPhotos([ids.anna!], ids.act!, [ids.m2!]);
    expect(again.undo).toEqual({ createdActIds: [], links: [] });
    await undoApplyActToPhotos(r.undo);
    expect(await actOf(ids.c1anna!)).not.toBeNull();
    expect(await photosOf(ids.c1anna!)).toEqual([]);
  });

  it("several people and photos of two sessions: each where they are a lead; the rest is skipped", async () => {
    const r = await applyActToPhotos([ids.anna!, ids.bea!, ids.guest!], ids.act!, [ids.m1!, ids.m3!]);
    expect(await photosOf(ids.c1anna!)).toEqual([ids.m1]);
    expect(await photosOf(ids.c1bea!)).toEqual([ids.m1]);
    expect(await photosOf(ids.c2anna!)).toEqual([ids.m3]);
    // Bea is not in s2, the guest only appears — 3 of the 6 pairs have no lead
    expect(r.skipped).toBe(3);
    expect(await actOf(ids.c1guest!)).toBeNull();
    // A photo never lands on another session's act
    expect(await photosOf(ids.c1anna!)).not.toContain(ids.m3);
    await undoApplyActToPhotos(r.undo);
    // Anna's tick in s1 was there before — it stays; the others go
    expect(await actOf(ids.c1anna!)).not.toBeNull();
    expect(await actOf(ids.c1bea!)).toBeNull();
    expect(await actOf(ids.c2anna!)).toBeNull();
  });

  it("unlinking takes the photo back and keeps the tick", async () => {
    await applyActToPhotos([ids.anna!], ids.act!, [ids.m1!, ids.m2!]);
    await unlinkActFromPhotos([ids.anna!], ids.act!, [ids.m1!]);
    expect(await photosOf(ids.c1anna!)).toEqual([ids.m2]);
    await unlinkActFromPhotos([ids.anna!], ids.act!, [ids.m2!]);
    expect(await actOf(ids.c1anna!)).not.toBeNull();
    expect(await photosOf(ids.c1anna!)).toEqual([]);
  });

  it("refuses an unknown act", async () => {
    await expect(applyActToPhotos([ids.anna!], "no-such-act", [ids.m1!])).rejects.toThrow();
  });
});
