/**
 * Backfill Person.claimedPhotosets / claimedVideos from the existing bio text.
 *
 * Imports already fold the biography (including the "… Y photosets, Z videos"
 * line) into Person.bio, but the structured fields were added later. This
 * parses each person's bio and fills the two fields where they're still null
 * AND the user hasn't hand-set them (claimedStatsUserSet = false). Covers is
 * derived at read time, never stored.
 *
 * Safe to re-run. Per tenant: point DATABASE_URL at the target DB.
 *   npx tsx scripts/backfill-claimed-stats.ts [--dry-run]
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { parseClaimedStats } from "../src/lib/services/import/parse-claimed-stats";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const connectionString = process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  const people = await prisma.person.findMany({
    where: { claimedStatsUserSet: false, bio: { not: null } },
    select: { id: true, bio: true, claimedPhotosets: true, claimedVideos: true },
  });
  console.log(`Scanning ${people.length} persons (bio present, not user-set)`);

  let updated = 0;
  for (const p of people) {
    const { photosets, videos } = parseClaimedStats(p.bio);
    // Only fill what's still empty; never clobber an existing value here.
    const nextPhotosets = p.claimedPhotosets ?? photosets;
    const nextVideos = p.claimedVideos ?? videos;
    if (nextPhotosets === p.claimedPhotosets && nextVideos === p.claimedVideos) {
      continue; // nothing new parsed
    }
    updated++;
    if (dryRun) {
      console.log(
        `  [dry] ${p.id}: photosets ${p.claimedPhotosets ?? "∅"}→${nextPhotosets ?? "∅"}, videos ${p.claimedVideos ?? "∅"}→${nextVideos ?? "∅"}`,
      );
      continue;
    }
    await prisma.person.update({
      where: { id: p.id },
      data: { claimedPhotosets: nextPhotosets, claimedVideos: nextVideos },
    });
  }

  console.log(`${dryRun ? "Would update" : "Updated"} ${updated} persons.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
