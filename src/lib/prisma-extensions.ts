import { PrismaClient } from "@/generated/prisma/client";

export function withSoftDelete(prisma: PrismaClient) {
  return prisma.$extends({
    query: {
      $allModels: {
        async findMany({ args, query }) {
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async findUnique({ args, query }) {
          args.where = { ...args.where, deletedAt: null } as typeof args.where;
          return query(args);
        },
        async count({ args, query }) {
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
      },
    },
  });
}
