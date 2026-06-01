export const dynamic = "force-dynamic";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { ColorCatalogManager } from "@/components/settings/color-catalog-manager";
import { listColorCatalog } from "@/lib/services/color-catalog-service";

export default async function ColorsPage() {
  return withTenantFromHeaders(async () => {
    // Manager is the admin curation surface — show every row, pickable or
    // not, so deselected entries are visible for re-enabling.
    const [hair, eye, skin] = await Promise.all([
      listColorCatalog("hair", { pickableOnly: false }),
      listColorCatalog("eye", { pickableOnly: false }),
      listColorCatalog("skin", { pickableOnly: false }),
    ]);

    return (
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold">Color Catalog</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Canonical hair, eye, and skin colors with two-axis classification
            (hue + shade for hair/eye; tone + undertone for skin). Powers the
            people-search sidebar and the person edit form dropdowns. Auto-added
            entries from imports are flagged for review.
          </p>
        </div>
        <ColorCatalogManager
          hair={hair}
          eye={eye}
          skin={skin}
        />
      </div>
    );
  });
}
