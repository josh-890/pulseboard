import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function buildLabel(name: string, birthdate: Date | null, baselineDate: Date | null): string {
  if (!birthdate || !baselineDate) return `${name}, initially`;
  const age = baselineDate.getUTCFullYear() - birthdate.getUTCFullYear();
  return `${name} at ${age}`;
}

async function main() {
  const baselines = await prisma.persona.findMany({
    where: { isBaseline: true },
    include: {
      person: {
        include: {
          aliases: { where: { type: "common" }, take: 1 },
        },
      },
    },
  });

  console.log(`Found ${baselines.length} baseline persona(s).`);

  let updated = 0;
  for (const bp of baselines) {
    const name = bp.person.aliases[0]?.name ?? bp.person.icgId;
    const newLabel = buildLabel(name, bp.person.birthdate, bp.date);

    if (bp.label !== newLabel) {
      await prisma.persona.update({
        where: { id: bp.id },
        data: { label: newLabel },
      });
      console.log(`  ${bp.label} → ${newLabel}`);
      updated++;
    }
  }

  console.log(`Updated ${updated} baseline label(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
