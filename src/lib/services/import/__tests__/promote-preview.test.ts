import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { previewStagingSetPromote } from "@/lib/services/import/import-executor";
import { normalizeForSearch } from "@/lib/normalize";

// DB-integration test for the Career tab's promote preview: it must say what
// the real promote would do (new Set vs. enrich), and — unlike the real
// promote — never touch the cached match, not even a definitively stale one.
//
// Runs against the DEV database (vitest.config.ts loads .env); throwaway data is
// prefixed and wiped in afterEach.

const PREFIX = "PPV-TEST";

afterEach(async () => {
  await prisma.stagingSet.deleteMany({ where: { title: { startsWith: PREFIX } } });
  await prisma.set.deleteMany({ where: { title: { startsWith: PREFIX } } });
  await prisma.channel.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.label.deleteMany({ where: { name: { startsWith: PREFIX } } });
});

async function seed(opts: {
  name: string;
  status?: "APPROVED" | "PENDING";
  confidence?: number | null;
  withMatch?: boolean;
}) {
  const channel = await prisma.channel.create({ data: { name: `${PREFIX} ${opts.name} Channel` } });
  const matched =
    opts.withMatch === false
      ? null
      : await prisma.set.create({
          data: { title: `${PREFIX} ${opts.name} Set`, type: "photo", channelId: channel.id },
        });
  const title = `${PREFIX} ${opts.name}`;
  const staging = await prisma.stagingSet.create({
    data: {
      title,
      titleNorm: normalizeForSearch(title),
      channelName: channel.name,
      channelId: channel.id,
      isVideo: false,
      status: opts.status ?? "APPROVED",
      matchedSetId: matched?.id ?? null,
      matchConfidence: opts.confidence === undefined ? 1.0 : opts.confidence,
    },
  });
  return { staging, matched };
}

describe("previewStagingSetPromote", () => {
  it("names the set an exact match would enrich", async () => {
    const { staging, matched } = await seed({ name: "Exact" });
    const preview = await previewStagingSetPromote(staging.id);
    expect(preview).toEqual({
      kind: "enrich",
      matchedSetId: matched!.id,
      matchedTitle: matched!.title,
      undevelopedParticipants: [],
    });
  });

  it("creates new on a fuzzy match and keeps the suggestion", async () => {
    const { staging, matched } = await seed({ name: "Fuzzy", confidence: 0.7 });
    expect(await previewStagingSetPromote(staging.id)).toEqual({ kind: "create-new", undevelopedParticipants: [] });
    const after = await prisma.stagingSet.findUniqueOrThrow({ where: { id: staging.id } });
    expect(after.matchedSetId).toBe(matched!.id);
  });

  it("creates new on a cross-label match — without clearing the cache", async () => {
    // Guard 3: the real promote clears this stale match; the preview must not.
    const { staging, matched } = await seed({ name: "Cross" });
    const [labelA, labelB] = await Promise.all([
      prisma.label.create({ data: { name: `${PREFIX} Label A` } }),
      prisma.label.create({ data: { name: `${PREFIX} Label B` } }),
    ]);
    const otherChannel = await prisma.channel.create({
      data: { name: `${PREFIX} Cross Other Channel`, labelId: labelB.id },
    });
    await prisma.channel.update({ where: { id: staging.channelId! }, data: { labelId: labelA.id } });
    await prisma.set.update({ where: { id: matched!.id }, data: { channelId: otherChannel.id } });

    expect(await previewStagingSetPromote(staging.id)).toEqual({ kind: "create-new", undevelopedParticipants: [] });
    const after = await prisma.stagingSet.findUniqueOrThrow({ where: { id: staging.id } });
    expect(after.matchedSetId).toBe(matched!.id);
    expect(after.matchConfidence).toBe(1.0);
  });

  it("creates new when there is no match at all", async () => {
    const { staging } = await seed({ name: "None", withMatch: false, confidence: null });
    expect(await previewStagingSetPromote(staging.id)).toEqual({ kind: "create-new", undevelopedParticipants: [] });
  });

  it("names the participants who are not yet a Person", async () => {
    const { staging } = await seed({ name: "Cast", withMatch: false, confidence: null });
    const known = await prisma.person.findFirstOrThrow({ select: { icgId: true } });
    await prisma.stagingSet.update({
      where: { id: staging.id },
      data: {
        participants: [
          { name: "Known One", icgId: known.icgId },
          { name: `${PREFIX} Newcomer`, icgId: "ZZ-99@PPV" },
          { name: `${PREFIX} Name Only`, icgId: "" },
        ],
      },
    });
    const preview = await previewStagingSetPromote(staging.id);
    expect(preview).toEqual({
      kind: "create-new",
      undevelopedParticipants: [
        { name: `${PREFIX} Newcomer`, icgId: "ZZ-99@PPV" },
        { name: `${PREFIX} Name Only`, icgId: "" },
      ],
    });
  });

  it("refuses a set that is not approved", async () => {
    const { staging } = await seed({ name: "Pending", status: "PENDING" });
    const preview = await previewStagingSetPromote(staging.id);
    expect(preview.kind).toBe("not-promotable");
  });
});
