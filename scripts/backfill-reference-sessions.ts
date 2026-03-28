import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const persons = await prisma.person.findMany({
    where: {
      referenceSession: null,
    },
    include: {
      aliases: { where: { isCommon: true }, take: 1 },
    },
  });

  console.log(`Found ${persons.length} person(s) without a reference session.`);

  for (const p of persons) {
    const displayName = p.aliases[0]?.name ?? p.icgId;
    await prisma.session.create({
      data: {
        name: displayName,
        nameNorm: displayName.toLowerCase(),
        type: "REFERENCE",
        status: "CONFIRMED",
        personId: p.id,
      },
    });
    console.log(`  Created reference session for ${displayName} (${p.icgId})`);
  }

  console.log("Backfill complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
