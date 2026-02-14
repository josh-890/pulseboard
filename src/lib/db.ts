import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { withSoftDelete } from "./prisma-extensions";

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });

function createClient() {
  const base = new PrismaClient({ adapter });
  return withSoftDelete(base);
}

type ExtendedPrismaClient = ReturnType<typeof createClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
