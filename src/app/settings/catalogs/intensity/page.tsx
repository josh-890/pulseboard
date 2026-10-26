export const dynamic = "force-dynamic";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { IntensityCatalogEditor, IntensityCatalogTransfer } from "@/components/settings/intensity";
import { getIntensityCatalog } from "@/lib/services/intensity-catalog-service";

export default async function IntensityCatalogPage() {
  return withTenantFromHeaders(async () => {
    const catalog = await getIntensityCatalog();
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-bold">Intensity</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              How intense it is for a person, mentally, to do an act in a scenario. Acts are ticked on a session, per
              person; extras raise the level. A person&apos;s page shows their peak.
            </p>
          </div>
          <IntensityCatalogTransfer />
        </div>
        <IntensityCatalogEditor catalog={catalog} />
      </div>
    );
  });
}
