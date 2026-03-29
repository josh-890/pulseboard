"use client";

import { useState } from "react";
import { TagPicker } from "@/components/shared/tag-picker";
import { setEntityTagsAction } from "@/lib/actions/tag-actions";
import type { TagChipData } from "@/components/shared/tag-chips";

type SessionTagSectionProps = {
  sessionId: string;
  initialTags: TagChipData[];
};

export function SessionTagSection({ sessionId, initialTags }: SessionTagSectionProps) {
  const [tagIds, setTagIds] = useState(initialTags.map((t) => t.id));

  return (
    <div className="relative z-10 rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm">
      <h3 className="mb-3 text-sm font-medium text-muted-foreground">Tags</h3>
      <TagPicker
        scope="SESSION"
        selectedTagIds={tagIds}
        onChange={(newIds) => {
          setTagIds(newIds);
          setEntityTagsAction("SESSION", sessionId, newIds);
        }}
        selectedTags={initialTags}
        placeholder="Add tags…"
        compact
      />
    </div>
  );
}
