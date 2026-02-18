import { PrismaClient } from "@/generated/prisma/client";

const softDeleteOverrides = {
  async findMany({ args, query }: { args: { where?: Record<string, unknown> }; query: (args: unknown) => Promise<unknown> }) {
    args.where = { ...args.where, deletedAt: null };
    return query(args);
  },
  async findFirst({ args, query }: { args: { where?: Record<string, unknown> }; query: (args: unknown) => Promise<unknown> }) {
    args.where = { ...args.where, deletedAt: null };
    return query(args);
  },
  async findUnique({ args, query }: { args: { where: Record<string, unknown> }; query: (args: unknown) => Promise<unknown> }) {
    args.where = { ...args.where, deletedAt: null };
    return query(args);
  },
  async count({ args, query }: { args: { where?: Record<string, unknown> }; query: (args: unknown) => Promise<unknown> }) {
    args.where = { ...args.where, deletedAt: null };
    return query(args);
  },
};

export function withSoftDelete(prisma: PrismaClient) {
  return prisma.$extends({
    query: {
      person: softDeleteOverrides,
      project: softDeleteOverrides,
      projectMember: softDeleteOverrides,
      activity: softDeleteOverrides,
      traitCategory: softDeleteOverrides,
      persona: softDeleteOverrides,
      personaTrait: softDeleteOverrides,
      personSnapshot: softDeleteOverrides,
      photo: softDeleteOverrides,
      // Setting intentionally excluded — no deletedAt field
    },
  });
}
