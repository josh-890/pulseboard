import { prisma } from "@/lib/db";

/**
 * Refresh the mv_dashboard_stats materialized view.
 * Call at startup and after bulk operations.
 */
export async function refreshDashboardStats(): Promise<void> {
  await prisma.$queryRawUnsafe("REFRESH MATERIALIZED VIEW mv_dashboard_stats");
}

/**
 * Refresh the mv_person_current_state materialized view.
 * Call after persona mutations (create/update/delete persona or physical).
 */
export async function refreshPersonCurrentState(): Promise<void> {
  await prisma.$queryRawUnsafe(
    "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_person_current_state",
  );
}

/**
 * Refresh the mv_person_affiliations materialized view.
 * Call after set contribution changes.
 */
export async function refreshPersonAffiliations(): Promise<void> {
  await prisma.$queryRawUnsafe(
    "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_person_affiliations",
  );
}
