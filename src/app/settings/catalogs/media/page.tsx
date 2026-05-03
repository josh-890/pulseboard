export const dynamic = "force-dynamic";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { MediaCategoryManager } from "@/components/settings/media-category-manager";
import { getAllCategoryGroups } from "@/lib/services/category-service";

export default async function MediaCategoriesPage() {
  return withTenantFromHeaders(async () => {
    const categoryGroups = await getAllCategoryGroups();

    return (
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold">Media Categories</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize photo documentation by category. Categories with an entity model
            link photos to specific body marks, modifications, or procedures.
          </p>
        </div>
        <MediaCategoryManager groups={categoryGroups} />
      </div>
    );
  });
}
