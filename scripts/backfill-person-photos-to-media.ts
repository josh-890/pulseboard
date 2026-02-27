import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "crypto";

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

type PhotoVariants = {
  original: string;
  profile_128?: string;
  profile_256?: string;
  profile_512?: string;
  profile_768?: string;
  gallery_512?: string;
  gallery_1024?: string;
  gallery_1600?: string;
};

type PersonMediaUsage =
  | "PROFILE"
  | "REFERENCE"
  | "HEADSHOT"
  | "BODY_MARK"
  | "BODY_MODIFICATION"
  | "COSMETIC_PROCEDURE"
  | "PORTFOLIO";

function inferUsageFromTags(tags: string[]): PersonMediaUsage {
  const tagSet = new Set(tags.map((t) => t.toLowerCase()));
  if (tagSet.has("portrait") || tagSet.has("headshot")) return "HEADSHOT";
  if (tagSet.has("tattoo") || tagSet.has("body_mark")) return "BODY_MARK";
  if (tagSet.has("body_modification") || tagSet.has("piercing")) return "BODY_MODIFICATION";
  if (tagSet.has("cosmetic_procedure")) return "COSMETIC_PROCEDURE";
  if (tagSet.has("profile")) return "PROFILE";
  if (tagSet.has("portfolio")) return "PORTFOLIO";
  return "REFERENCE";
}

async function main() {
  // Get all non-deleted person photos
  const photos = await prisma.photo.findMany({
    where: {
      entityType: "person",
      deletedAt: null,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Found ${photos.length} person photo(s) to backfill.`);

  let created = 0;
  let skipped = 0;
  let noSession = 0;

  for (const photo of photos) {
    const personId = photo.entityId;

    // Find the person's reference session
    const refSession = await prisma.session.findFirst({
      where: { personId, status: "REFERENCE" },
      select: { id: true },
    });

    if (!refSession) {
      console.log(`  SKIP (no reference session): person ${personId}, photo ${photo.id}`);
      noSession++;
      continue;
    }

    // Idempotent check: skip if a MediaItem with same filename + sessionId exists
    const existing = await prisma.mediaItem.findFirst({
      where: {
        sessionId: refSession.id,
        filename: photo.filename,
      },
    });

    if (existing) {
      skipped++;
      continue;
    }

    const variants = (photo.variants ?? {}) as PhotoVariants;
    const usage = inferUsageFromTags(photo.tags);
    const mediaItemId = randomUUID();

    await prisma.$transaction(async (tx) => {
      await tx.mediaItem.create({
        data: {
          id: mediaItemId,
          sessionId: refSession.id,
          mediaType: "PHOTO",
          filename: photo.filename,
          mimeType: photo.mimeType,
          size: photo.size,
          originalWidth: photo.originalWidth,
          originalHeight: photo.originalHeight,
          variants: variants as unknown as Record<string, string>,
          caption: photo.caption,
          tags: photo.tags,
        },
      });

      await tx.personMediaLink.create({
        data: {
          personId,
          mediaItemId,
          usage,
          isFavorite: photo.isFavorite,
          sortOrder: photo.sortOrder,
        },
      });
    });

    created++;
    console.log(`  Created MediaItem for photo ${photo.id} → session ${refSession.id} (usage: ${usage})`);
  }

  console.log(`\nBackfill complete: ${created} created, ${skipped} skipped (already exist), ${noSession} skipped (no reference session).`);

  // Refresh dashboard stats
  try {
    await prisma.$queryRaw`REFRESH MATERIALIZED VIEW mv_dashboard_stats`;
    console.log("Refreshed mv_dashboard_stats.");
  } catch (e) {
    console.warn("Could not refresh mv_dashboard_stats:", e);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
