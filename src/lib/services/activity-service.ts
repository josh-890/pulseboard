import { prisma } from "@/lib/db";
import type { ActivityItem } from "@/lib/types";

export async function getRecentActivities(
  limit?: number,
): Promise<ActivityItem[]> {
  return prisma.activity.findMany({
    orderBy: { time: "desc" },
    ...(limit ? { take: limit } : {}),
  });
}
