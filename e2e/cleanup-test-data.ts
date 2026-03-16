/**
 * Hard-delete test artifacts left behind by Playwright E2E tests.
 * Matches entities with names like "Test Person ...", "Test Label ...", "Credit Set ...", etc.
 *
 * Usage:
 *   npx tsx e2e/cleanup-test-data.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function cleanupTestData() {
  console.log("Cleaning up test data...\n");

  await prisma.$transaction(async (tx) => {
    // --- Sets created by tests (title LIKE 'Test Set %' OR 'Credit Set %') ---
    // Junction tables first (no deletedAt — hard-delete)
    let r = await tx.$executeRaw`
      DELETE FROM "SetMediaItem" WHERE "setId" IN (
        SELECT id FROM "Set" WHERE title LIKE 'Test Set %' OR title LIKE 'Credit Set %'
      )`;
    if (r) console.log(`  SetMediaItem (test sets): ${r}`);

    r = await tx.$executeRaw`
      DELETE FROM "SetSession" WHERE "setId" IN (
        SELECT id FROM "Set" WHERE title LIKE 'Test Set %' OR title LIKE 'Credit Set %'
      )`;
    if (r) console.log(`  SetSession (test sets): ${r}`);

    r = await tx.$executeRaw`
      DELETE FROM "SetParticipant" WHERE "setId" IN (
        SELECT id FROM "Set" WHERE title LIKE 'Test Set %' OR title LIKE 'Credit Set %'
      )`;
    if (r) console.log(`  SetParticipant (test sets): ${r}`);

    r = await tx.$executeRaw`
      DELETE FROM "SetLabelEvidence" WHERE "setId" IN (
        SELECT id FROM "Set" WHERE title LIKE 'Test Set %' OR title LIKE 'Credit Set %'
      )`;
    if (r) console.log(`  SetLabelEvidence (test sets): ${r}`);

    // Soft-deletable tables
    r = await tx.$executeRaw`
      DELETE FROM "SetCreditRaw" WHERE "setId" IN (
        SELECT id FROM "Set" WHERE title LIKE 'Test Set %' OR title LIKE 'Credit Set %'
      )`;
    if (r) console.log(`  SetCreditRaw (test sets): ${r}`);

    // Clear cover references before deleting sets
    r = await tx.$executeRaw`
      UPDATE "Set" SET "coverMediaItemId" = NULL
      WHERE (title LIKE 'Test Set %' OR title LIKE 'Credit Set %') AND "coverMediaItemId" IS NOT NULL`;

    r = await tx.$executeRaw`
      DELETE FROM "Set" WHERE title LIKE 'Test Set %' OR title LIKE 'Credit Set %'`;
    if (r) console.log(`  Set: ${r}`);

    // --- Sessions created by tests ---
    // Also delete auto-created DRAFT sessions for test sets
    r = await tx.$executeRaw`
      DELETE FROM "ContributionSkill" WHERE "contributionId" IN (
        SELECT id FROM "SessionContribution" WHERE "sessionId" IN (
          SELECT id FROM "Session" WHERE name LIKE 'Test Session %'
        )
      )`;
    if (r) console.log(`  ContributionSkill (test sessions): ${r}`);

    r = await tx.$executeRaw`
      DELETE FROM "SessionContribution" WHERE "sessionId" IN (
        SELECT id FROM "Session" WHERE name LIKE 'Test Session %'
      )`;
    if (r) console.log(`  SessionContribution (test sessions): ${r}`);

    // Delete MediaItems belonging to test sessions
    r = await tx.$executeRaw`
      DELETE FROM "PersonMediaLink" WHERE "mediaItemId" IN (
        SELECT id FROM "MediaItem" WHERE "sessionId" IN (
          SELECT id FROM "Session" WHERE name LIKE 'Test Session %'
        )
      )`;
    if (r) console.log(`  PersonMediaLink (test session media): ${r}`);

    r = await tx.$executeRaw`
      DELETE FROM "MediaItem" WHERE "sessionId" IN (
        SELECT id FROM "Session" WHERE name LIKE 'Test Session %'
      )`;
    if (r) console.log(`  MediaItem (test sessions): ${r}`);

    r = await tx.$executeRaw`
      DELETE FROM "Session" WHERE name LIKE 'Test Session %'`;
    if (r) console.log(`  Session: ${r}`);

    // --- Projects ---
    r = await tx.$executeRaw`
      DELETE FROM "ProjectLabel" WHERE "projectId" IN (
        SELECT id FROM "Project" WHERE name LIKE 'Test Project %'
      )`;
    if (r) console.log(`  ProjectLabel (test projects): ${r}`);

    r = await tx.$executeRaw`
      DELETE FROM "Project" WHERE name LIKE 'Test Project %'`;
    if (r) console.log(`  Project: ${r}`);

    // --- Labels ---
    r = await tx.$executeRaw`
      DELETE FROM "ChannelLabelMap" WHERE "labelId" IN (
        SELECT id FROM "Label" WHERE name LIKE 'Test Label %'
      )`;
    if (r) console.log(`  ChannelLabelMap (test labels): ${r}`);

    r = await tx.$executeRaw`
      DELETE FROM "LabelNetwork" WHERE "labelId" IN (
        SELECT id FROM "Label" WHERE name LIKE 'Test Label %'
      )`;
    if (r) console.log(`  LabelNetworkLink (test labels): ${r}`);

    r = await tx.$executeRaw`
      DELETE FROM "ProjectLabel" WHERE "labelId" IN (
        SELECT id FROM "Label" WHERE name LIKE 'Test Label %'
      )`;
    if (r) console.log(`  ProjectLabel (test labels): ${r}`);

    r = await tx.$executeRaw`
      DELETE FROM "SetLabelEvidence" WHERE "labelId" IN (
        SELECT id FROM "Label" WHERE name LIKE 'Test Label %'
      )`;
    if (r) console.log(`  SetLabelEvidence (test labels): ${r}`);

    r = await tx.$executeRaw`
      DELETE FROM "Label" WHERE name LIKE 'Test Label %'`;
    if (r) console.log(`  Label: ${r}`);

    // --- Networks ---
    r = await tx.$executeRaw`
      DELETE FROM "LabelNetwork" WHERE "networkId" IN (
        SELECT id FROM "Network" WHERE name LIKE 'Test Network %'
      )`;
    if (r) console.log(`  LabelNetworkLink (test networks): ${r}`);

    r = await tx.$executeRaw`
      DELETE FROM "Network" WHERE name LIKE 'Test Network %'`;
    if (r) console.log(`  Network: ${r}`);

    // --- Persons (matched by alias) ---
    const testPersonIds = await tx.$queryRaw<{ personId: string }[]>`
      SELECT DISTINCT "personId" FROM "PersonAlias" WHERE name LIKE 'Test Person %'`;

    if (testPersonIds.length > 0) {
      const ids = testPersonIds.map((r) => r.personId);

      for (const id of ids) {
        // Get persona IDs for cascading
        const personaIds = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "Persona" WHERE "personId" = ${id}`;
        const pIds = personaIds.map((p) => p.id);

        if (pIds.length > 0) {
          for (const pId of pIds) {
            await tx.$executeRaw`DELETE FROM "BodyMarkEvent" WHERE "personaId" = ${pId}`;
            await tx.$executeRaw`DELETE FROM "BodyModificationEvent" WHERE "personaId" = ${pId}`;
            await tx.$executeRaw`DELETE FROM "CosmeticProcedureEvent" WHERE "personaId" = ${pId}`;
            await tx.$executeRaw`DELETE FROM "PersonaPhysical" WHERE "personaId" = ${pId}`;
            await tx.$executeRaw`DELETE FROM "PersonDigitalIdentity" WHERE "personaId" = ${pId}`;
            await tx.$executeRaw`DELETE FROM "PersonSkillEvent" WHERE "personaId" = ${pId}`;
          }
          await tx.$executeRaw`DELETE FROM "Persona" WHERE "personId" = ${id}`;
        }

        // Body marks (events already deleted via persona cascade above)
        await tx.$executeRaw`DELETE FROM "BodyMark" WHERE "personId" = ${id}`;
        await tx.$executeRaw`DELETE FROM "BodyModification" WHERE "personId" = ${id}`;
        await tx.$executeRaw`DELETE FROM "CosmeticProcedure" WHERE "personId" = ${id}`;

        // Relationships
        await tx.$executeRaw`
          DELETE FROM "RelationshipEvent" WHERE "relationshipId" IN (
            SELECT id FROM "PersonRelationship" WHERE "personAId" = ${id} OR "personBId" = ${id}
          )`;
        await tx.$executeRaw`DELETE FROM "PersonRelationship" WHERE "personAId" = ${id} OR "personBId" = ${id}`;

        // Education, awards, interests
        await tx.$executeRaw`DELETE FROM "PersonEducation" WHERE "personId" = ${id}`;
        await tx.$executeRaw`DELETE FROM "PersonAward" WHERE "personId" = ${id}`;
        await tx.$executeRaw`DELETE FROM "PersonInterest" WHERE "personId" = ${id}`;

        // Digital identities & skills (person-level, not persona-level)
        await tx.$executeRaw`DELETE FROM "PersonDigitalIdentity" WHERE "personId" = ${id}`;
        await tx.$executeRaw`
          DELETE FROM "SkillEventMedia" WHERE "skillEventId" IN (
            SELECT id FROM "PersonSkillEvent" WHERE "personSkillId" IN (
              SELECT id FROM "PersonSkill" WHERE "personId" = ${id}
            )
          )`;
        await tx.$executeRaw`
          DELETE FROM "PersonSkillEvent" WHERE "personSkillId" IN (
            SELECT id FROM "PersonSkill" WHERE "personId" = ${id}
          )`;
        await tx.$executeRaw`DELETE FROM "PersonSkill" WHERE "personId" = ${id}`;

        // Media collections
        await tx.$executeRaw`
          DELETE FROM "MediaCollectionItem" WHERE "collectionId" IN (
            SELECT id FROM "MediaCollection" WHERE "personId" = ${id}
          )`;
        await tx.$executeRaw`DELETE FROM "MediaCollection" WHERE "personId" = ${id}`;

        // Participation + media links
        await tx.$executeRaw`DELETE FROM "PersonMediaLink" WHERE "personId" = ${id}`;
        await tx.$executeRaw`DELETE FROM "SetCreditRaw" WHERE "resolvedPersonId" = ${id}`;
        await tx.$executeRaw`
          DELETE FROM "ContributionSkill" WHERE "contributionId" IN (
            SELECT id FROM "SessionContribution" WHERE "personId" = ${id}
          )`;
        await tx.$executeRaw`DELETE FROM "SessionContribution" WHERE "personId" = ${id}`;
        await tx.$executeRaw`DELETE FROM "SetParticipant" WHERE "personId" = ${id}`;
        await tx.$executeRaw`
          DELETE FROM "PersonAliasChannel" WHERE "aliasId" IN (
            SELECT id FROM "PersonAlias" WHERE "personId" = ${id}
          )`;
        await tx.$executeRaw`DELETE FROM "PersonAlias" WHERE "personId" = ${id}`;

        // Reference session (cascade its media first)
        await tx.$executeRaw`
          DELETE FROM "MediaItem" WHERE "sessionId" IN (
            SELECT id FROM "Session" WHERE "personId" = ${id}
          )`;
        await tx.$executeRaw`DELETE FROM "Session" WHERE "personId" = ${id}`;

        // Finally, the person
        await tx.$executeRaw`DELETE FROM "Person" WHERE id = ${id}`;
      }
      console.log(`  Person (full cascade): ${ids.length}`);
    }

    // --- Orphan DRAFT sessions auto-created by set creation tests ---
    // These sessions are created automatically when a set is created without an existing session
    // They have no name pattern but we can find them by checking sessions with no sets, no participants,
    // and status DRAFT that aren't seed sessions
    r = await tx.$executeRaw`
      DELETE FROM "Session"
      WHERE status = 'DRAFT'
        AND id NOT LIKE 'seed-%'
        AND id NOT IN (SELECT "sessionId" FROM "SetSession")
        AND id NOT IN (SELECT "sessionId" FROM "SessionContribution")
        AND id NOT IN (SELECT "sessionId" FROM "MediaItem" WHERE "sessionId" IS NOT NULL)
    `;
    if (r) console.log(`  Session (orphan drafts): ${r}`);
  });

  // Refresh materialized views
  await prisma.$executeRaw`REFRESH MATERIALIZED VIEW mv_dashboard_stats`;
  await prisma.$executeRaw`REFRESH MATERIALIZED VIEW mv_person_current_state`;
  await prisma.$executeRaw`REFRESH MATERIALIZED VIEW mv_person_affiliations`;

  console.log("\nTest data cleanup complete.");
}

cleanupTestData()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
