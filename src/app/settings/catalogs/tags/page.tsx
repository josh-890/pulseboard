export const dynamic = "force-dynamic";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { TagSettingsSection } from "@/components/settings/tag-settings-section";
import {
  getAllTagGroups,
  getPendingTags,
  getOrphanedTags,
  getNearDuplicateTags,
  getTagUsageBreakdown,
} from "@/lib/services/tag-service";

export default async function TagsPage() {
  return withTenantFromHeaders(async () => {
    const [tagGroups, pendingTags, orphanedTags, nearDuplicates, usageBreakdown] =
      await Promise.all([
        getAllTagGroups(),
        getPendingTags(),
        getOrphanedTags(),
        getNearDuplicateTags(),
        getTagUsageBreakdown(),
      ]);

    return (
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold">Tag Catalog</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define tag groups and tags. Tags can be applied to people, sessions, media items,
            sets, and projects. Each group has a color; each tag has a configurable scope.
          </p>
        </div>
        <TagSettingsSection
          groups={tagGroups}
          pendingTags={pendingTags}
          orphanedTags={orphanedTags}
          nearDuplicates={nearDuplicates}
          usageBreakdown={usageBreakdown}
        />
      </div>
    );
  });
}
