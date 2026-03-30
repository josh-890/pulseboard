"use client";

import { useState } from "react";
import { TagCatalogManager } from "@/components/settings/tag-catalog-manager";
import { TagPendingSection } from "@/components/settings/tag-pending-section";
import { TagMergeDialog } from "@/components/settings/tag-merge-dialog";
import { TagAnalytics } from "@/components/settings/tag-analytics";
import type { TagGroupWithDefinitions, TagDefinitionWithGroup, TagUsageBreakdown, NearDuplicatePair } from "@/lib/services/tag-service";

type TagSettingsSectionProps = {
  groups: TagGroupWithDefinitions[];
  pendingTags: TagDefinitionWithGroup[];
  orphanedTags: TagDefinitionWithGroup[];
  nearDuplicates: NearDuplicatePair[];
  usageBreakdown: TagUsageBreakdown[];
};

export function TagSettingsSection({
  groups,
  pendingTags,
  orphanedTags,
  nearDuplicates,
  usageBreakdown,
}: TagSettingsSectionProps) {
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSources, setMergeSources] = useState<TagDefinitionWithGroup[]>([]);
  const [mergeKey, setMergeKey] = useState(0);

  // Flatten all tags for the merge dialog target picker
  const allTags: TagDefinitionWithGroup[] = groups.flatMap((g) =>
    g.tags.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      status: t.status,
      description: t.description,
      scope: t.scope,
      sortOrder: t.sortOrder,
      group: { id: g.id, name: g.name, slug: g.slug, color: g.color, isExclusive: g.isExclusive },
      aliases: t.aliases,
    })),
  );

  function openMergeFromPending(tag: TagDefinitionWithGroup) {
    setMergeSources([tag]);
    setMergeKey((k) => k + 1);
    setMergeOpen(true);
  }

  function openMergeFromDuplicates(tagA: { id: string; name: string }, tagB: { id: string; name: string }) {
    const a = allTags.find((t) => t.id === tagA.id);
    const b = allTags.find((t) => t.id === tagB.id);
    if (a && b) {
      setMergeSources([a]);
      setMergeKey((k) => k + 1);
      setMergeOpen(true);
    }
  }

  return (
    <div className="space-y-4">
      <TagPendingSection pendingTags={pendingTags} onMerge={openMergeFromPending} />
      <TagCatalogManager groups={groups} />
      <TagAnalytics
        orphanedTags={orphanedTags}
        nearDuplicates={nearDuplicates}
        usageBreakdown={usageBreakdown}
        onMerge={openMergeFromDuplicates}
      />
      <TagMergeDialog
        key={mergeKey}
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        sourceTags={mergeSources}
        allTags={allTags}
      />
    </div>
  );
}
