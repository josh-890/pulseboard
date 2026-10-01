export const dynamic = "force-dynamic";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { TagSettingsSection } from "@/components/settings/tag-settings-section";
import {
  getAllTagGroups,
  getOrphanedTags,
  getNearDuplicateTags,
  getTagUsageBreakdown,
} from "@/lib/services/tag-service";

export default async function TagsPage() {
  return withTenantFromHeaders(async () => {
    const [tagGroups, orphanedTags, nearDuplicates, usageBreakdown] =
      await Promise.all([
        getAllTagGroups(),
        getOrphanedTags(),
        getNearDuplicateTags(),
        getTagUsageBreakdown(),
      ]);

    return (
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold">Tag Catalog</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define tag groups and tags. A group&apos;s domain decides where its tags may be applied
            (persons, content — sessions, sets and images — or projects); inside content its typical
            level only ranks the picker. Tags can have a parent: filtering by a parent also finds
            its children.
          </p>
        </div>
        <TagSettingsSection
          groups={tagGroups}
          orphanedTags={orphanedTags}
          nearDuplicates={nearDuplicates}
          usageBreakdown={usageBreakdown}
        />
      </div>
    );
  });
}
