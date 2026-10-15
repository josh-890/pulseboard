import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { normalizeForSearch } from "@/lib/normalize";
import { findStagingCandidatesForFolder, matchReasons } from "@/lib/services/folder-match-service";
import { createStagingSetFromFolder, linkFolderToCandidate } from "@/lib/services/attribution-confirm-service";

// The last check before a folder becomes a new staged set (2026-10-16): the staged
// sets it could already be, and linking to the one the operator picks. Runs
// against the DEV database; throwaway rows carry RUN and are removed afterwards.

const RUN = `FMS${Date.now().toString(36)}`;
const TENANT = "test";
const SHORT = RUN.toUpperCase().slice(0, 12);
const created = { folders: [] as string[], staging: [] as string[], channels: [] as string[] };
let channelId = "";

async function folder(name: string, date: string, opts: { isVideo?: boolean; copy?: string } = {}) {
  const f = await prisma.archiveFolder.create({
    data: {
      fullPath: `X:\\${RUN}${opts.copy ?? ""}\\${date}-${SHORT} Sophia - ${name}`,
      folderName: `${date}-${SHORT} Sophia - ${name}`,
      parsedTitle: name,
      parsedShortName: SHORT,
      parsedDate: new Date(`${date}T00:00:00Z`),
      isVideo: opts.isVideo ?? false,
      scannedAt: new Date(),
      tenant: TENANT,
    },
  });
  created.folders.push(f.id);
  return f;
}

async function staged(title: string, date: string | null, opts: { channel?: boolean; cast?: string[]; status?: "PENDING" | "APPROVED" } = {}) {
  const s = await prisma.stagingSet.create({
    data: {
      title,
      titleNorm: normalizeForSearch(title),
      channelName: opts.channel === false ? `${RUN} Other` : `${RUN} Channel`,
      channelId: opts.channel === false ? null : channelId,
      releaseDate: date ? new Date(`${date}T00:00:00Z`) : null,
      participants: (opts.cast ?? []).map((name) => ({ name })),
      participantNamesNorm: (opts.cast ?? []).map((n) => normalizeForSearch(n)).join(" "),
      status: opts.status ?? "PENDING",
    },
  });
  created.staging.push(s.id);
  return s;
}

beforeAll(async () => {
  const ch = await prisma.channel.create({ data: { name: `${RUN} Channel`, shortName: SHORT } });
  channelId = ch.id;
  created.channels.push(ch.id);
});

afterAll(async () => {
  await prisma.archiveLink.deleteMany({ where: { archiveFolderId: { in: created.folders } } });
  await prisma.archiveFolderReview.deleteMany({ where: { archiveFolderId: { in: created.folders } } });
  await prisma.archiveFolder.deleteMany({ where: { id: { in: created.folders } } });
  await prisma.stagingSet.deleteMany({ where: { OR: [{ id: { in: created.staging } }, { channelId }] } });
  await prisma.channel.deleteMany({ where: { id: { in: created.channels } } });
});

describe("matchReasons", () => {
  it("names every signal, strongest first", () => {
    expect(matchReasons({ suggested: true, sim: 1, day: 0, chan: true, person: true })).toEqual([
      "suggested", "same-title", "same-date", "same-channel", "same-person",
    ]);
    expect(matchReasons({ suggested: false, sim: 0.5, day: 2, chan: false, person: false })).toEqual([
      "similar-title", "near-date",
    ]);
    expect(matchReasons({ suggested: false, sim: 0.2, day: null, chan: true, person: false })).toEqual(["same-channel"]);
  });
});

describe("findStagingCandidatesForFolder", () => {
  it("lists the suggestion first, then the exact twin, and leaves unrelated sets out", async () => {
    const f = await folder(`${RUN} Best of part 19`, "2020-01-28");
    const twin = await staged(`${RUN} Best of part 19`, "2020-01-28");
    const guess = await staged(`${RUN} Best of part 24`, "2020-03-23", { cast: ["Katya Clover"] });
    const unrelated = await staged(`${RUN} Something Else Entirely`, "2015-05-05", { channel: false });
    await prisma.archiveLink.create({
      data: { archiveFolderId: f.id, stagingSetId: guess.id, status: "SUGGESTED", confidence: "MEDIUM", tenant: TENANT },
    });

    const { folder: info, candidates } = await findStagingCandidatesForFolder(f.id);
    const ids = candidates.map((c) => c.id);
    expect(info.releaseDate).toBe("2020-01-28");
    expect(ids[0]).toBe(guess.id);
    expect(ids).toContain(twin.id);
    expect(ids).not.toContain(unrelated.id);
    const t = candidates.find((c) => c.id === twin.id)!;
    expect(t.reasons).toEqual(expect.arrayContaining(["same-title", "same-date", "same-channel"]));
    expect(t.dayDistance).toBe(0);
    expect(candidates[0].participants).toEqual(["Katya Clover"]);
  });

  it("finds a set by the person in the folder name, a few days off", async () => {
    const f = await folder(`${RUN} Morning Light`, "2021-04-10");
    const s = await staged(`${RUN} Sunrise`, "2021-04-12", { cast: ["Sophia"] });
    const { candidates } = await findStagingCandidatesForFolder(f.id);
    const c = candidates.find((x) => x.id === s.id);
    expect(c?.reasons).toEqual(expect.arrayContaining(["near-date", "same-person"]));
  });

  it("marks a set that already has its folder", async () => {
    const other = await folder(`${RUN} Taken`, "2022-02-02", { copy: "-copy" });
    const f = await folder(`${RUN} Taken`, "2022-02-02");
    const s = await staged(`${RUN} Taken`, "2022-02-02");
    await prisma.archiveLink.create({
      data: { archiveFolderId: other.id, stagingSetId: s.id, status: "CONFIRMED", confirmedAt: new Date(), tenant: TENANT },
    });
    const { candidates } = await findStagingCandidatesForFolder(f.id);
    expect(candidates.find((c) => c.id === s.id)?.linkedFolderName).toBe(other.folderName);
    await expect(linkFolderToCandidate(f.id, s.id)).rejects.toThrow(`That set already has its folder: ${other.folderName}`);
  });
});

describe("choosing", () => {
  it("links the folder to the picked candidate, replacing the suggestion", async () => {
    const f = await folder(`${RUN} Pick Me`, "2023-03-03");
    const guess = await staged(`${RUN} Wrong Guess`, "2023-03-04");
    const right = await staged(`${RUN} Pick Me`, "2023-03-03");
    await prisma.archiveLink.create({
      data: { archiveFolderId: f.id, stagingSetId: guess.id, status: "SUGGESTED", confidence: "HIGH", tenant: TENANT },
    });
    await linkFolderToCandidate(f.id, right.id);
    const link = await prisma.archiveLink.findUniqueOrThrow({ where: { archiveFolderId: f.id } });
    expect(link).toMatchObject({ stagingSetId: right.id, status: "CONFIRMED", confidence: null });
  });

  it("creates a new set when the operator chose so, despite an exact twin", async () => {
    const f = await folder(`${RUN} Twin`, "2024-04-04");
    const twin = await staged(`${RUN} Twin`, "2024-04-04");
    const res = await createStagingSetFromFolder(f.id, { participants: [], createNew: true });
    created.staging.push(res.stagingSetId);
    expect(res.linkedExisting).toBe(false);
    expect(res.stagingSetId).not.toBe(twin.id);
  });
});
