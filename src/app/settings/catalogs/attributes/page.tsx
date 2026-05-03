export const dynamic = "force-dynamic";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { PhysicalAttributeManager } from "@/components/settings/physical-attribute-manager";
import { getAllPhysicalAttributeGroups } from "@/lib/services/physical-attribute-catalog-service";

export default async function AttributesPage() {
  return withTenantFromHeaders(async () => {
    const physicalAttributeGroups = await getAllPhysicalAttributeGroups();

    return (
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold">Physical Attributes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define physical attribute groups and measurements. These are used to track
            extensible physical attributes over time via persona snapshots.
          </p>
        </div>
        <PhysicalAttributeManager groups={physicalAttributeGroups} />
      </div>
    );
  });
}
