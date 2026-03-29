/**
 * Backfill existing string[] tags → structured tag system.
 *
 * 1. Collect all unique tag strings from Person, Set, Project, MediaItem, Session
 * 2. Match to existing TagDefinition by slug; create missing ones in "Uncategorized" group
 * 3. Create join table rows (PersonTag, SetTag, ProjectTag, MediaItemTag, SessionTag) with source=IMPORT
 * 4. Verify counts match
 *
 * Safe to re-run (uses skipDuplicates / findFirst).
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL not set");

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function main() {
  console.log("Starting tag backfill...\n");

  // 1. Get or create the Uncategorized group
  let uncategorized = await prisma.tagGroup.findFirst({
    where: { slug: "uncategorized" },
  });
  if (!uncategorized) {
    uncategorized = await prisma.tagGroup.create({
      data: {
        name: "Uncategorized",
        slug: "uncategorized",
        color: "#9ca3af",
        sortOrder: 999,
      },
    });
    console.log("Created Uncategorized group");
  }

  // 2. Collect all unique tag strings from each entity type
  type EntityTag = { entityId: string; tag: string };

  const [personTags, setTags, projectTags, mediaItemTags, sessionTags] = await Promise.all([
    prisma.$queryRaw<EntityTag[]>`
      SELECT id as "entityId", unnest(tags) as tag FROM "Person" WHERE array_length(tags, 1) > 0
    `,
    prisma.$queryRaw<EntityTag[]>`
      SELECT id as "entityId", unnest(tags) as tag FROM "Set" WHERE array_length(tags, 1) > 0
    `,
    prisma.$queryRaw<EntityTag[]>`
      SELECT id as "entityId", unnest(tags) as tag FROM "Project" WHERE array_length(tags, 1) > 0
    `,
    prisma.$queryRaw<EntityTag[]>`
      SELECT id as "entityId", unnest(tags) as tag FROM "MediaItem" WHERE array_length(tags, 1) > 0
    `,
    prisma.$queryRaw<EntityTag[]>`
      SELECT id as "entityId", unnest(tags) as tag FROM "Session" WHERE array_length(tags, 1) > 0
    `,
  ]);

  console.log(`Found tags: Person=${personTags.length}, Set=${setTags.length}, Project=${projectTags.length}, MediaItem=${mediaItemTags.length}, Session=${sessionTags.length}`);

  // 3. Collect all unique tag names
  const allTagNames = new Set<string>();
  for (const row of [...personTags, ...setTags, ...projectTags, ...mediaItemTags, ...sessionTags]) {
    allTagNames.add(row.tag.toLowerCase().trim());
  }
  console.log(`Unique tag names: ${allTagNames.size}`);

  // 4. Resolve or create tag definitions
  const tagDefMap = new Map<string, string>(); // tag name (lowercase) → tagDefinitionId

  for (const tagName of allTagNames) {
    const slug = slugify(tagName);
    let tagDef = await prisma.tagDefinition.findFirst({
      where: { slug },
    });
    if (!tagDef) {
      // Determine scope based on which entity types use this tag
      const scope: string[] = [];
      if (personTags.some((r) => r.tag.toLowerCase().trim() === tagName)) scope.push("PERSON");
      if (sessionTags.some((r) => r.tag.toLowerCase().trim() === tagName)) scope.push("SESSION");
      if (mediaItemTags.some((r) => r.tag.toLowerCase().trim() === tagName)) scope.push("MEDIA_ITEM");
      if (setTags.some((r) => r.tag.toLowerCase().trim() === tagName)) scope.push("SET");
      if (projectTags.some((r) => r.tag.toLowerCase().trim() === tagName)) scope.push("PROJECT");

      tagDef = await prisma.tagDefinition.create({
        data: {
          groupId: uncategorized.id,
          name: tagName,
          slug,
          nameNorm: tagName,
          scope: scope.length > 0 ? scope : ["PERSON", "SESSION", "MEDIA_ITEM", "SET", "PROJECT"],
          sortOrder: 0,
        },
      });
      console.log(`  Created tag "${tagName}" in Uncategorized (scope: ${scope.join(",")})`);
    } else {
      console.log(`  Matched tag "${tagName}" → existing definition "${tagDef.name}" (${tagDef.id})`);
    }
    tagDefMap.set(tagName, tagDef.id);
  }

  // 5. Create join table rows
  let created = 0;

  // Person tags
  for (const row of personTags) {
    const tagDefId = tagDefMap.get(row.tag.toLowerCase().trim());
    if (!tagDefId) continue;
    await prisma.personTag.upsert({
      where: { personId_tagDefinitionId: { personId: row.entityId, tagDefinitionId: tagDefId } },
      create: { personId: row.entityId, tagDefinitionId: tagDefId, source: "IMPORT" },
      update: {},
    });
    created++;
  }

  // Set tags
  for (const row of setTags) {
    const tagDefId = tagDefMap.get(row.tag.toLowerCase().trim());
    if (!tagDefId) continue;
    await prisma.setTag.upsert({
      where: { setId_tagDefinitionId: { setId: row.entityId, tagDefinitionId: tagDefId } },
      create: { setId: row.entityId, tagDefinitionId: tagDefId, source: "IMPORT" },
      update: {},
    });
    created++;
  }

  // Project tags
  for (const row of projectTags) {
    const tagDefId = tagDefMap.get(row.tag.toLowerCase().trim());
    if (!tagDefId) continue;
    await prisma.projectTag.upsert({
      where: { projectId_tagDefinitionId: { projectId: row.entityId, tagDefinitionId: tagDefId } },
      create: { projectId: row.entityId, tagDefinitionId: tagDefId, source: "IMPORT" },
      update: {},
    });
    created++;
  }

  // MediaItem tags
  for (const row of mediaItemTags) {
    const tagDefId = tagDefMap.get(row.tag.toLowerCase().trim());
    if (!tagDefId) continue;
    await prisma.mediaItemTag.upsert({
      where: { mediaItemId_tagDefinitionId: { mediaItemId: row.entityId, tagDefinitionId: tagDefId } },
      create: { mediaItemId: row.entityId, tagDefinitionId: tagDefId, source: "IMPORT" },
      update: {},
    });
    created++;
  }

  // Session tags
  for (const row of sessionTags) {
    const tagDefId = tagDefMap.get(row.tag.toLowerCase().trim());
    if (!tagDefId) continue;
    await prisma.sessionTag.upsert({
      where: { sessionId_tagDefinitionId: { sessionId: row.entityId, tagDefinitionId: tagDefId } },
      create: { sessionId: row.entityId, tagDefinitionId: tagDefId, source: "IMPORT" },
      update: {},
    });
    created++;
  }

  console.log(`\nCreated/verified ${created} join table rows.`);

  // 6. Verify
  const [personCount, setCount, projectCount, mediaCount, sessionCount] = await Promise.all([
    prisma.personTag.count(),
    prisma.setTag.count(),
    prisma.projectTag.count(),
    prisma.mediaItemTag.count(),
    prisma.sessionTag.count(),
  ]);

  console.log(`\nVerification — join table counts:`);
  console.log(`  PersonTag: ${personCount}`);
  console.log(`  SetTag: ${setCount}`);
  console.log(`  ProjectTag: ${projectCount}`);
  console.log(`  MediaItemTag: ${mediaCount}`);
  console.log(`  SessionTag: ${sessionCount}`);
  console.log(`\nBackfill complete.`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
