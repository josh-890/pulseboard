import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// Controlled relationship-role vocabulary. Asymmetric pairs are seeded as two
// entries (each authorable from its own side); the inverse renders on the
// counterpart's page. Categories use the RelationshipType enum.
const ROLES: {
  slug: string;
  name: string;
  inverseName: string;
  isSymmetric: boolean;
  category: "familial" | "personal" | "professional" | "other";
}[] = [
  { slug: "sibling", name: "Sibling", inverseName: "Sibling", isSymmetric: true, category: "familial" },
  { slug: "parent", name: "Parent", inverseName: "Child", isSymmetric: false, category: "familial" },
  { slug: "child", name: "Child", inverseName: "Parent", isSymmetric: false, category: "familial" },
  { slug: "relative", name: "Relative", inverseName: "Relative", isSymmetric: true, category: "familial" },
  { slug: "spouse", name: "Spouse", inverseName: "Spouse", isSymmetric: true, category: "personal" },
  { slug: "partner", name: "Partner", inverseName: "Partner", isSymmetric: true, category: "personal" },
  { slug: "ex-partner", name: "Ex-partner", inverseName: "Ex-partner", isSymmetric: true, category: "personal" },
  { slug: "friend", name: "Friend", inverseName: "Friend", isSymmetric: true, category: "personal" },
  { slug: "mentor", name: "Mentor", inverseName: "Mentee", isSymmetric: false, category: "professional" },
  { slug: "mentee", name: "Mentee", inverseName: "Mentor", isSymmetric: false, category: "professional" },
  { slug: "manager", name: "Manager", inverseName: "Report", isSymmetric: false, category: "professional" },
  { slug: "colleague", name: "Colleague", inverseName: "Colleague", isSymmetric: true, category: "professional" },
];

async function main() {
  console.log(`Seeding RelationshipRole with ${ROLES.length} roles…`);
  for (let i = 0; i < ROLES.length; i++) {
    const r = ROLES[i];
    await prisma.relationshipRole.upsert({
      where: { slug: r.slug },
      create: { ...r, sortOrder: i },
      update: {
        name: r.name,
        inverseName: r.inverseName,
        isSymmetric: r.isSymmetric,
        category: r.category,
        sortOrder: i,
      },
    });
  }
  const n = await prisma.relationshipRole.count();
  console.log(`Done. RelationshipRole rows: ${n}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
