"use client";

import { useState } from "react";
import { TagCatalogManager } from "@/components/settings/tag-catalog-manager";
import { TagMergeDialog } from "@/components/settings/tag-merge-dialog";
import { TagAnalytics } from "@/components/settings/tag-analytics";
import type { TagGroupWithDefinitions, TagDefinitionWithGroup, TagUsageBreakdown, NearDuplicatePair } from "@/lib/services/tag-service";

type TagSettingsSectionProps = {
  groups: TagGroupWithDefinitions[];
  orphanedTags: TagDefinitionWithGroup[];
  nearDuplicates: NearDuplicatePair[];
  usageBreakdown: TagUsageBreakdown[];
};

export function TagSettingsSection({
  groups,
  orphanedTags,
  nearDuplicates,
  usageBreakdown,
}: TagSettingsSectionProps) {
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSources, setMergeSources] = useState<TagDefinitionWithGroup[]>([]);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const [mergeKey, setMergeKey] = useState(0);

  // Flatten all tags for the merge dialog target picker
  const allTags: TagDefinitionWithGroup[] = groups.flatMap((g) =>
    g.tags.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      description: t.description,
      parentId: t.parentId,
      typicalLevel: t.typicalLevel,
      sortOrder: t.sortOrder,
      group: {
        id: g.id,
        name: g.name,
        slug: g.slug,
        color: g.color,
        isExclusive: g.isExclusive,
        domain: g.domain,
        typicalLevel: g.typicalLevel,
        kind: g.kind,
      },
      aliases: t.aliases,
    })),
  );

  function openMergeFromDuplicates(tagA: { id: string; name: string }, tagB: { id: string; name: string }) {
    const a = allTags.find((t) => t.id === tagA.id);
    const b = allTags.find((t) => t.id === tagB.id);
    if (a && b) {
      // A merges into B by default; the dialog lets you pick another target
      setMergeSources([a]);
      setMergeTargetId(b.id);
      setMergeKey((k) => k + 1);
      setMergeOpen(true);
    }
  }

  return (
    <div className="space-y-4">
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
        initialTargetId={mergeTargetId}
      />
    </div>
  );
}
