import { prisma } from "@/lib/db";
import type { ActivityItem } from "@/lib/types";

export async function getRecentActivities(limit = 20): Promise<ActivityItem[]> {
  return prisma.activity.findMany({
    orderBy: { time: "desc" },
    take: limit,
  });
}

export async function logActivity(
  type: import("@/generated/prisma/client").ActivityType,
  title: string,
): Promise<void> {
  await prisma.activity.create({
    data: { type, title, time: new Date() },
  });
}
