export const dynamic = "force-dynamic";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { ContributionRoleManager } from "@/components/settings/contribution-role-manager";
import { getAllContributionRoleGroups } from "@/lib/services/contribution-role-service";

export default async function ContributionRolesPage() {
  return withTenantFromHeaders(async () => {
    const roleGroups = await getAllContributionRoleGroups();

    return (
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold">Contribution Roles</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define role categories for session contributions and set credits (e.g. Model, Photographer).
          </p>
        </div>
        <ContributionRoleManager groups={roleGroups} />
      </div>
    );
  });
}
