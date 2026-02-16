import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { rebuildSnapshot } from "../src/lib/services/persona-service";

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const people = await prisma.person.findMany({
    where: { deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  });

  console.log(`Backfilling snapshots for ${people.length} people...`);

  for (const person of people) {
    await rebuildSnapshot(person.id);
    console.log(`  ✓ ${person.firstName} ${person.lastName}`);
  }

  console.log("Done!");
}

main()
  .catch((e) => {
    console.error("Backfill failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
