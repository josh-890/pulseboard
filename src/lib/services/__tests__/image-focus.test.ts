import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  bulkHidePersons,
  bulkSetFocus,
  getFocusMarksForMedia,
  getShownSupportForMedia,
  setBackgroundPersons,
  setHiddenPersons,
  setShownSupport,
} from "@/lib/services/appearance-service";
import { getPersonShowcase } from "@/lib/services/person-showcase-service";

// Per-image focus (ADR-0039): a shown person is the focus of an image or only in
// the shot. Only the showcase reads it. Runs against the DEV database; throwaway
// rows carry RUN and are removed afterwards.
const RUN = `foc${Date.now().toString(36)}`;
const ids: Record<string, string> = {};
const photos: string[] = [];

async function photo(key: string) {
  const m = await prisma.mediaItem.create({
    data: {
      sessionId: ids.session!,
      mediaType: "PHOTO",
      filename: `${RUN}-${key}.jpg`,
      mimeType: "image/jpeg",
      size: 1,
      originalWidth: 4,
      originalHeight: 5,
      variants: { master_4000: `${RUN}/${key}.webp`, gallery_512: `${RUN}/${key}_512.webp` },
    },
  });
  ids[key] = m.id;
  photos.push(m.id);
}

const showcaseIds = async (personId: string) => (await getPersonShowcase(personId, { size: 50 })).items.map((i) => i.id);

beforeAll(async () => {
  for (const key of ["lead", "lead2", "guest"]) {
    ids[key] = (await prisma.person.create({ data: { icgId: `${RUN}-${key}`.toUpperCase() } })).id;
  }
  ids.session = (await prisma.session.create({ data: { name: `${RUN} session` } })).id;
  await prisma.sessionContribution.createMany({
    data: [
      { sessionId: ids.session, personId: ids.lead!, roleDefinitionId: "crd_model" },
      { sessionId: ids.session, personId: ids.lead2!, roleDefinitionId: "crd_model" },
      { sessionId: ids.session, personId: ids.guest!, roleDefinitionId: "crd_appearance" },
    ],
  });
  for (const key of ["p1", "p2", "p3", "p4"]) await photo(key);
});

afterAll(async () => {
  const persons = [ids.lead, ids.lead2, ids.guest].filter(Boolean) as string[];
  await prisma.mediaItemHiddenPerson.deleteMany({ where: { mediaItemId: { in: photos } } });
  await prisma.mediaItem.deleteMany({ where: { id: { in: photos } } }); // shown/background rows cascade
  await prisma.sessionContribution.deleteMany({ where: { personId: { in: persons } } });
  await prisma.session.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.person.deleteMany({ where: { id: { in: persons } } });
});

describe("per-image focus", () => {
  it("a lead only in the shot leaves their showcase, the other lead keeps the photo", async () => {
    expect(await showcaseIds(ids.lead!)).toContain(ids.p1);
    await setBackgroundPersons(ids.p1!, [ids.lead!]);
    const marks = await getFocusMarksForMedia([ids.p1!]);
    expect(marks.background.get(ids.p1!)).toEqual([ids.lead]);
    expect(await showcaseIds(ids.lead!)).not.toContain(ids.p1);
    expect(await showcaseIds(ids.lead2!)).toContain(ids.p1);
  });

  it("support is in their showcase only where marked as the focus", async () => {
    expect(await showcaseIds(ids.guest!)).toEqual([]);
    await setShownSupport(ids.p2!, [ids.guest!]); // in the shot
    expect(await showcaseIds(ids.guest!)).toEqual([]);
    await setShownSupport(ids.p2!, [ids.guest!], [ids.guest!]); // the focus
    expect(await showcaseIds(ids.guest!)).toEqual([ids.p2]);
    // Left out, the focus mark is kept
    await setShownSupport(ids.p2!, [ids.guest!]);
    expect((await getFocusMarksForMedia([ids.p2!])).focusSupport.get(ids.p2!)).toEqual([ids.guest]);
    // Not shown any more: no focus either
    await setShownSupport(ids.p2!, []);
    expect(await showcaseIds(ids.guest!)).toEqual([]);
  });

  it("hiding a lead clears their background mark; marking someone hidden as in the shot shows them", async () => {
    await setBackgroundPersons(ids.p3!, [ids.lead!]);
    await setHiddenPersons(ids.p3!, [ids.lead!]);
    expect((await getFocusMarksForMedia([ids.p3!])).background.get(ids.p3!)).toEqual([]);
    await setBackgroundPersons(ids.p3!, [ids.lead!]);
    expect((await getFocusMarksForMedia([ids.p3!])).background.get(ids.p3!)).toEqual([ids.lead]);
    expect(await prisma.mediaItemHiddenPerson.count({ where: { mediaItemId: ids.p3! } })).toBe(0);
    await setBackgroundPersons(ids.p3!, []);
  });

  it("bulk: background marks leads only, makes support shown not focus; focus undoes both; hide clears", async () => {
    const both = [ids.p3!, ids.p4!];
    await setHiddenPersons(ids.p4!, [ids.lead!]);
    await bulkSetFocus(both, [ids.lead!, ids.guest!], "background");
    let marks = await getFocusMarksForMedia(both);
    expect(marks.background.get(ids.p3!)).toEqual([ids.lead]);
    expect(marks.background.get(ids.p4!)).toEqual([ids.lead]); // shown again, in the shot
    expect((await getShownSupportForMedia(both)).get(ids.p4!)).toEqual([ids.guest]);
    expect(marks.focusSupport.get(ids.p4!)).toEqual([]);
    expect(await prisma.mediaItemHiddenPerson.count({ where: { mediaItemId: ids.p4! } })).toBe(0);

    await bulkSetFocus(both, [ids.lead!, ids.guest!], "focus");
    marks = await getFocusMarksForMedia(both);
    expect(marks.background.get(ids.p3!)).toEqual([]);
    expect(marks.focusSupport.get(ids.p3!)).toEqual([ids.guest]);
    expect(await showcaseIds(ids.guest!)).toEqual(expect.arrayContaining(both));

    await bulkSetFocus(both, [ids.lead!], "background");
    await bulkHidePersons(both, [ids.lead!, ids.guest!]);
    marks = await getFocusMarksForMedia(both);
    expect(marks.background.get(ids.p3!)).toEqual([]);
    expect(marks.focusSupport.get(ids.p3!)).toEqual([]);
  });
});
