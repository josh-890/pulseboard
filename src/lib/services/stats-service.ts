import { prisma } from "@/lib/db";
import { countPersons } from "./person-service";
import { countSets } from "./set-service";
import { countLabels } from "./label-service";
import { countChannels } from "./channel-service";
import { countProjects } from "./project-service";

export type DashboardStats = {
  persons: number;
  sets: number;
  labels: number;
  channels: number;
  projects: number;
};

type MvDashboardStatsRow = {
  personCount: bigint;
  setCount: bigint;
  labelCount: bigint;
  channelCount: bigint;
  projectCount: bigint;
};

/**
 * Get dashboard stats from materialized view (fast, may be slightly stale).
 * Falls back to live counts if MV is empty.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    const rows = await prisma.$queryRawUnsafe<MvDashboardStatsRow[]>(
      "SELECT * FROM mv_dashboard_stats LIMIT 1",
    );
    if (rows.length > 0) {
      const row = rows[0];
      return {
        persons: Number(row.personCount),
        sets: Number(row.setCount),
        labels: Number(row.labelCount),
        channels: Number(row.channelCount),
        projects: Number(row.projectCount),
      };
    }
  } catch {
    // MV might not exist yet — fall through to live counts
  }

  // Fallback: live counts
  const [persons, sets, labels, channels, projects] = await Promise.all([
    countPersons(),
    countSets(),
    countLabels(),
    countChannels(),
    countProjects(),
  ]);

  return { persons, sets, labels, channels, projects };
}
