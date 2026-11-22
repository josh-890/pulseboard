export const dynamic = "force-dynamic";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { ComposerManager } from "@/components/settings/composer";
import { getComposerManageData } from "@/lib/services/composer-manage-service";

// Settings → Composer (ADR-0043, R4): the tree, each facet's choice, default and
// framing, each value's region, drawing and relations, and the relevance matrix.
export default async function ComposerSettingsPage() {
  return withTenantFromHeaders(async () => {
    const data = await getComposerManageData();
    return (
      <div className="space-y-6">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-bold">Composer</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What the Tag Composer asks and in which order: paths, their sections, facets and values. Each facet takes one answer or
            many; the relevance matrix says, per context on the photo (a framing, a posture, a region), which facets and values are
            typical, possible or hidden.
          </p>
        </div>
        {data.catalog.paths.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/60 p-6 text-sm text-muted-foreground">
            This tenant has no Composer vocabulary. It is seeded with <code>scripts/add-composer-vocabulary.ts</code>.
          </p>
        ) : (
          <ComposerManager data={data} />
        )}
      </div>
    );
  });
}
