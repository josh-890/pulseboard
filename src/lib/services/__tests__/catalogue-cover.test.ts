import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { minioClient, getMinioBucket } from "@/lib/minio";
import { normalizeForSearch } from "@/lib/normalize";
import {
  deliverCover,
  getCoverRequest,
  listWantedCovers,
  reportCoversNotFound,
  requestCovers,
  retryCoverRequests,
} from "@/lib/services/catalogue-cover-service";

// ADR-0038 S7 on the DEV database and MinIO: covers on request — asked for,
// delivered strictly decoded, or reported missing. Throwaway rows: staged sets
// titled CVR-TEST…, cast ZZ-90@…, catalogue folders ZCVR|…

const P = "CVR-TEST";
const created: string[] = [];

async function stagedSet(n: string, opts: { cover?: string; icg?: string } = {}) {
  const icg = opts.icg ?? `ZZ-90@${n}`;
  const s = await prisma.stagingSet.create({
    data: {
      title: `${P} ${n}`,
      titleNorm: normalizeForSearch(`${P} ${n}`),
      channelName: "Test Channel",
      externalId: `${P}-${n}-${Date.now()}`,
      subjectIcgId: icg,
      participants: [{ name: n, icgId: icg }],
      participantIcgIds: [icg],
      coverImageUrl: opts.cover ?? null,
    },
  });
  created.push(s.id);
  return s;
}

const folder = (n: string) =>
  prisma.catalogueFolder.create({
    data: { path: `ZCVR|${n}`, icgId: `ZZ-90@${n}`, name: n, kind: "contact", signature: "s", firstRunId: "test", lastRunId: "test" },
  });

afterEach(async () => {
  if (created.length) {
    const bucket = getMinioBucket();
    for (const id of created) {
      const listed = await minioClient.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `staging/${id}/` }));
      const keys = (listed.Contents ?? []).map((o) => ({ Key: o.Key! }));
      if (keys.length) await minioClient.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys } }));
    }
    await prisma.stagingSet.deleteMany({ where: { id: { in: created } } });
    created.length = 0;
  }
  await prisma.catalogueFolder.deleteMany({ where: { path: { startsWith: "ZCVR|" } } });
});

describe("asking for covers", () => {
  it("wants a cover for a set without one of ours, from her catalogue folder; skips one that has it", async () => {
    await folder("AAA");
    const open = await stagedSet("AAA");
    const harvested = await stagedSet("AAA", { cover: "https://example.com/cover.jpg" });
    const ours = await stagedSet("AAA", { cover: "http://minio/bucket/staging/x/cover-1.jpg" });
    const nobody = await stagedSet("BBB");

    const { wanted } = await requestCovers([open.id, harvested.id, ours.id, nobody.id], "develop");
    expect(wanted).toBe(2);
    expect(await getCoverRequest(open.id)).toMatchObject({ status: "WANTED" });
    expect(await getCoverRequest(harvested.id)).toMatchObject({ status: "WANTED" });
    expect(await getCoverRequest(ours.id)).toBeNull();
    expect(await getCoverRequest(nobody.id)).toMatchObject({ status: "NOT_FOUND" });
    const listed = (await listWantedCovers()).find((w) => w.stagingSetId === open.id);
    expect(listed).toMatchObject({ coverId: open.externalId, folderPaths: ["ZCVR|AAA"] });

    // Asking again changes nothing
    expect((await requestCovers([open.id], "opened")).wanted).toBe(0);
  });
});

describe("delivering", () => {
  it("stores a good cover, refuses a damaged one with the reason, and a missing one can be asked again", async () => {
    await folder("CCC");
    const good = await stagedSet("CCC");
    const bad = await stagedSet("CCC");
    const gone = await stagedSet("CCC");
    await requestCovers([good.id, bad.id, gone.id], "opened");

    const jpeg = await sharp({ create: { width: 400, height: 600, channels: 3, background: "#336699" } }).jpeg().toBuffer();
    expect(await deliverCover(good.id, "cover.jpg", jpeg)).toEqual({ status: "DELIVERED" });
    expect((await prisma.stagingSet.findUniqueOrThrow({ where: { id: good.id } })).coverImageUrl).toContain(`/staging/${good.id}/cover-`);

    const truncated = jpeg.subarray(0, Math.floor(jpeg.length / 2));
    expect((await deliverCover(bad.id, "broken.jpg", truncated)).status).toBe("FAILED");
    expect((await getCoverRequest(bad.id))?.detail).toMatch(/broken\.jpg: damaged image/);
    expect((await prisma.stagingSet.findUniqueOrThrow({ where: { id: bad.id } })).coverImageUrl).toBeNull();

    expect(await reportCoversNotFound([{ stagingSetId: gone.id, detail: "no file" }])).toBe(1);
    expect(await getCoverRequest(gone.id)).toMatchObject({ status: "NOT_FOUND", detail: "no file" });
    expect(await retryCoverRequests()).toBeGreaterThanOrEqual(2);
    expect(await getCoverRequest(gone.id)).toMatchObject({ status: "WANTED" });
  });
});

describe("the agent (catalogue-load --covers) against the dev server", () => {
  const agent = path.join(process.cwd(), "dist-agents", "catalogue-load.mjs");
  const reachable = fs.existsSync(agent) && Boolean(process.env.ARCHIVE_API_KEY);

  it.skipIf(!reachable)("finds the cover by its CoverId in _meta\\_Cover and delivers it", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cvr-catalogue-"));
    try {
      await folder("DDD");
      const want = await stagedSet("DDD");
      const notThere = await stagedSet("DDD");
      await requestCovers([want.id, notThere.id], "develop");
      const coverDir = path.join(root, "ZCVR|DDD", "_meta", "_Cover");
      fs.mkdirSync(coverDir, { recursive: true });
      const jpeg = await sharp({ create: { width: 300, height: 450, channels: 3, background: "#884422" } }).jpeg().toBuffer();
      fs.writeFileSync(path.join(coverDir, `2016-07-08-${want.externalId}.jpg`), jpeg);
      // A CoverId that only contains the wanted one is not it
      fs.writeFileSync(path.join(coverDir, `${notThere.externalId}9.jpg`), jpeg);

      const out = execFileSync(
        "node",
        [agent, "--covers", "--catalogue", root, "--base-url", process.env.E2E_BASE_URL ?? "http://localhost:3000"],
        { encoding: "utf8", env: { ...process.env } },
      );
      expect(out).toMatch(/covers 1 delivered, 1 not found/);
      expect(await getCoverRequest(want.id)).toMatchObject({ status: "DELIVERED" });
      expect(await getCoverRequest(notThere.id)).toMatchObject({ status: "NOT_FOUND" });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});
