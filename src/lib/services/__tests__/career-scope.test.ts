import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getCareerFacetCounts, getCareerTimeline } from "@/lib/services/career-service";

// The Career tab's Library scope (2026-10-12): promoted sets, approved staged
// sets, and any staged set with a confirmed archive folder — the pipeline's
// pending / in-review sets without a folder only under "All".

const RUN = `csc${Date.now().toString(36)}`;
const ids: Record<string, string> = {};

beforeAll(async () => {
  const person = await prisma.person.create({ data: { icgId: `${RUN}-p` } });
  ids.person = person.id;
  const staged = (key: string, status: "PENDING" | "REVIEWING" | "APPROVED") =>
    prisma.stagingSet.create({
      data: { title: `${RUN} ${key}`, channelName: RUN, participantIcgIds: [person.icgId!], status },
    });
  ids.approved = (await staged("approved", "APPROVED")).id;
  ids.pending = (await staged("pending", "PENDING")).id;
  ids.reviewingLinked = (await staged("reviewing-linked", "REVIEWING")).id;
  ids.pendingSuggested = (await staged("pending-suggested", "PENDING")).id;
  const folder = (key: string) =>
    prisma.archiveFolder.create({
      data: { fullPath: `X:\\${RUN}\\${key}`, folderName: key, isVideo: false, scannedAt: new Date(), tenant: "default" },
    });
  ids.f1 = (await folder("a")).id;
  ids.f2 = (await folder("b")).id;
  await prisma.archiveLink.create({
    data: { archiveFolderId: ids.f1, stagingSetId: ids.reviewingLinked, status: "CONFIRMED", tenant: "default" },
  });
  // Only a confirmed link counts
  await prisma.archiveLink.create({
    data: { archiveFolderId: ids.f2, stagingSetId: ids.pendingSuggested, status: "SUGGESTED", tenant: "default" },
  });
});

afterAll(async () => {
  // By the run prefix, so a failed setup still cleans up
  await prisma.archiveLink.deleteMany({ where: { stagingSet: { channelName: RUN } } });
  await prisma.archiveFolder.deleteMany({ where: { id: { in: [ids.f1, ids.f2].filter(Boolean) } } });
  await prisma.stagingSet.deleteMany({ where: { channelName: RUN } });
  await prisma.person.deleteMany({ where: { icgId: `${RUN}-p` } });
});

const stagedIds = async (scope: "library" | "all", statuses?: ("pending" | "reviewing")[]) =>
  (await getCareerTimeline(ids.person, { scope, statuses }))
    .flatMap((r) => (r.kind === "staged" ? [r.stagingSetId] : []))
    .sort();

describe("career scope", () => {
  it("Library: approved, and any set with a confirmed archive folder", async () => {
    expect(await stagedIds("library")).toEqual([ids.approved, ids.reviewingLinked].sort());
  });

  it("All: the whole pipeline", async () => {
    expect(await stagedIds("all")).toEqual(
      [ids.approved, ids.pending, ids.reviewingLinked, ids.pendingSuggested].sort(),
    );
  });

  it("the status filter narrows within the scope", async () => {
    expect(await stagedIds("library", ["reviewing"])).toEqual([ids.reviewingLinked]);
    expect(await stagedIds("library", ["pending"])).toEqual([]);
  });

  it("status counts follow the scope", async () => {
    const counts = await getCareerFacetCounts(ids.person, { scope: "library" });
    expect(counts.status).toEqual({ approved: 1, reviewing: 1 });
  });
});
