#!/usr/bin/env tsx
/**
 * Read-only audit: find ArchiveFolder records whose stored `isVideo` flag disagrees
 * with the configured root their `fullPath` actually sits under.
 *
 * These appear when a folder is moved across the photo↔video branch: the sidecar-move
 * and update ingest paths historically did not flip `isVideo`. (Fixed going forward —
 * a re-scan now heals them; this audit just sizes the current backlog.)
 *
 * Usage (per tenant, read-only):
 *   DATABASE_URL=<tenant db url> npx tsx scripts/audit-archive-isvideo-root.ts
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { parseRoots } from "../src/lib/services/archive-service";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const norm = (p: string) => p.replace(/[/\\]$/, "").toLowerCase();
const underAny = (fullPath: string, roots: string[]) =>
  roots.some((r) => fullPath.toLowerCase().startsWith(norm(r) + "\\") || fullPath.toLowerCase().startsWith(norm(r) + "/"));

async function main() {
  const [photoRaw, videoRaw] = await Promise.all([
    prisma.setting.findUnique({ where: { key: "archive.photosetRoot" } }),
    prisma.setting.findUnique({ where: { key: "archive.videosetRoot" } }),
  ]);
  const photoRoots = parseRoots(photoRaw?.value ?? null);
  const videoRoots = parseRoots(videoRaw?.value ?? null);

  console.log("Photoset roots:", photoRoots);
  console.log("Videoset roots:", videoRoots);

  const folders = await prisma.archiveFolder.findMany({
    where: { missingOnDisk: false },
    select: {
      fullPath: true,
      isVideo: true,
      chanFolderName: true,
      archiveLink: { select: { status: true, setId: true, stagingSetId: true } },
    },
  });

  const shouldBeVideoButPhoto = []; // under a video root but isVideo=false
  const shouldBePhotoButVideo = []; // under a photo root but isVideo=true
  let unrooted = 0;

  for (const f of folders) {
    const inVideo = underAny(f.fullPath, videoRoots);
    const inPhoto = underAny(f.fullPath, photoRoots);
    if (inVideo && !f.isVideo) shouldBeVideoButPhoto.push(f);
    else if (inPhoto && f.isVideo) shouldBePhotoButVideo.push(f);
    else if (!inVideo && !inPhoto) unrooted++;
  }

  const sample = (arr: typeof folders) =>
    arr.slice(0, 15).forEach((f) =>
      console.log(
        `    [${f.archiveLink?.status ?? "—"}] ${f.chanFolderName ?? "(no chan)"} :: ${f.fullPath}`,
      ),
    );

  console.log(`\nTotal on-disk folders scanned: ${folders.length}`);
  console.log(`\n⚠ Under VIDEO root but isVideo=false: ${shouldBeVideoButPhoto.length}`);
  sample(shouldBeVideoButPhoto);
  console.log(`\n⚠ Under PHOTO root but isVideo=true: ${shouldBePhotoButVideo.length}`);
  sample(shouldBePhotoButVideo);
  console.log(`\n(Folders not under any configured root: ${unrooted})`);
  console.log(`\nFix: deploy the isVideo-on-move change, then run a full scan — both ingest`);
  console.log(`paths now write isVideo from the walked root, so these self-heal.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("Audit failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
