export const dynamic = "force-dynamic";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { DisclosureMatrixEditor } from "@/components/settings/disclosure";
import { getDisclosureMatrix } from "@/lib/services/disclosure-catalog-service";

export default async function DisclosureCatalogPage() {
  return withTenantFromHeaders(async () => {
    const matrix = await getDisclosureMatrix();
    return (
      <div className="space-y-6">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold">Disclosure</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What a person reveals, step by step, in each situation. Entries are made on a session, per person; a
            person&apos;s page shows which steps they have reached and when they first crossed each boundary.
          </p>
        </div>
        <DisclosureMatrixEditor matrix={matrix} />
      </div>
    );
  });
}
