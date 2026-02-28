/**
 * Clean up test data created by Playwright e2e tests.
 *
 * Usage:
 *   npx tsx scripts/cleanup-test-data.ts          # clean dev DB
 *   PROD=1 npx tsx scripts/cleanup-test-data.ts   # clean production DB
 */
import { config } from "dotenv";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: process.env.PROD === "1" ? ".env.production" : ".env" });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const now = new Date();
  const db = process.env.PROD === "1" ? "production" : "dev";
  console.log(`Cleaning test data from ${db} database...\n`);

  // --- Persons ---
  const testPersons = await prisma.personAlias.findMany({
    where: { name: { startsWith: "Test Person " }, deletedAt: null },
    select: { personId: true, name: true },
  });
  console.log(`Found ${testPersons.length} test person(s)`);
  for (const alias of testPersons) {
    const refSession = await prisma.session.findFirst({
      where: { personId: alias.personId, deletedAt: null },
    });
    if (refSession) {
      await prisma.session.update({
        where: { id: refSession.id },
        data: { deletedAt: now },
      });
      console.log(`  Deleted reference session: ${refSession.name}`);
    }
    await prisma.personAlias.updateMany({
      where: { personId: alias.personId },
      data: { deletedAt: now },
    });
    await prisma.person.update({
      where: { id: alias.personId },
      data: { deletedAt: now },
    });
    console.log(`  Deleted person: ${alias.name} (${alias.personId})`);
  }

  // --- Labels ---
  const testLabels = await prisma.label.findMany({
    where: { name: { startsWith: "Test Label " }, deletedAt: null },
    select: { id: true, name: true },
  });
  console.log(`Found ${testLabels.length} test label(s)`);
  for (const label of testLabels) {
    await prisma.label.update({ where: { id: label.id }, data: { deletedAt: now } });
    console.log(`  Deleted label: ${label.name}`);
  }

  // --- Networks ---
  const testNetworks = await prisma.network.findMany({
    where: { name: { startsWith: "Test Network " }, deletedAt: null },
    select: { id: true, name: true },
  });
  console.log(`Found ${testNetworks.length} test network(s)`);
  for (const network of testNetworks) {
    await prisma.network.update({ where: { id: network.id }, data: { deletedAt: now } });
    console.log(`  Deleted network: ${network.name}`);
  }

  // --- Projects ---
  const testProjects = await prisma.project.findMany({
    where: { name: { startsWith: "Test Project " }, deletedAt: null },
    select: { id: true, name: true },
  });
  console.log(`Found ${testProjects.length} test project(s)`);
  for (const project of testProjects) {
    await prisma.project.update({ where: { id: project.id }, data: { deletedAt: now } });
    console.log(`  Deleted project: ${project.name}`);
  }

  // --- Sets (includes "Credit Set" from credit test) ---
  const testSets = await prisma.set.findMany({
    where: {
      OR: [
        { title: { startsWith: "Test Set " } },
        { title: { startsWith: "Credit Set " } },
      ],
      deletedAt: null,
    },
    select: { id: true, title: true },
  });
  console.log(`Found ${testSets.length} test set(s)`);
  for (const set of testSets) {
    await prisma.setCreditRaw.updateMany({
      where: { setId: set.id, deletedAt: null },
      data: { deletedAt: now },
    });
    const links = await prisma.setSession.findMany({
      where: { setId: set.id },
      select: { sessionId: true },
    });
    await prisma.setSession.deleteMany({ where: { setId: set.id } });
    for (const link of links) {
      const session = await prisma.session.findUnique({ where: { id: link.sessionId } });
      if (session && session.status === "DRAFT" && !session.deletedAt) {
        await prisma.session.update({ where: { id: session.id }, data: { deletedAt: now } });
        console.log(`  Deleted auto session: ${session.name}`);
      }
    }
    await prisma.set.update({ where: { id: set.id }, data: { deletedAt: now } });
    console.log(`  Deleted set: ${set.title}`);
  }

  // --- Sessions ---
  const testSessions = await prisma.session.findMany({
    where: { name: { startsWith: "Test Session " }, deletedAt: null },
    select: { id: true, name: true },
  });
  console.log(`Found ${testSessions.length} test session(s)`);
  for (const session of testSessions) {
    await prisma.session.update({ where: { id: session.id }, data: { deletedAt: now } });
    console.log(`  Deleted session: ${session.name}`);
  }

  // --- Activity log entries ---
  const deletedActivities = await prisma.activity.deleteMany({
    where: {
      OR: [
        { title: { contains: "Test " } },
        { title: { contains: "Credit Set " } },
      ],
    },
  });
  console.log(`Deleted ${deletedActivities.count} test activity entries`);

  // --- Refresh dashboard stats ---
  await prisma.$queryRawUnsafe("REFRESH MATERIALIZED VIEW mv_dashboard_stats");
  console.log("Refreshed mv_dashboard_stats");

  console.log("\nCleanup complete.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); process.exit(1); });
