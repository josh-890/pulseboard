"use client";

import { useState, useTransition } from "react";
import { Search } from "lucide-react";
import { mergeTagDefinitionsAction } from "@/lib/actions/tag-actions";
import { useRouter } from "next/navigation";
import type { TagDefinitionWithGroup } from "@/lib/services/tag-service";

type TagMergeDialogProps = {
  open: boolean;
  onClose: () => void;
  sourceTags: TagDefinitionWithGroup[];
  allTags: TagDefinitionWithGroup[];
};

export function TagMergeDialog({ open, onClose, sourceTags, allTags }: TagMergeDialogProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sourceIds = new Set(sourceTags.map((t) => t.id));

  // Filter out source tags and match search
  const candidates = allTags.filter(
    (t) => !sourceIds.has(t.id) && t.status === "active" && t.name.toLowerCase().includes(search.toLowerCase()),
  );

  const target = targetId ? allTags.find((t) => t.id === targetId) : null;

  function handleMerge() {
    if (!targetId) return;
    startTransition(async () => {
      const result = await mergeTagDefinitionsAction(
        sourceTags.map((t) => t.id),
        targetId,
      );
      if (result.success) {
        router.refresh();
        onClose();
      }
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold">Merge Tags</h3>

        {/* Source tags */}
        <div className="mb-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Source tags (will be merged and deleted)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {sourceTags.map((tag) => (
              <span
                key={tag.id}
                className="rounded-full border px-2 py-0.5 text-xs font-medium"
                style={{
                  borderColor: tag.group.color + "40",
                  backgroundColor: tag.group.color + "15",
                  color: tag.group.color,
                }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        </div>

        {/* Target picker */}
        <div className="mb-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Merge into (target tag)
          </p>
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tags..."
              className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-3 text-sm outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {target ? (
            <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
              <span
                className="rounded-full border px-2 py-0.5 text-xs font-medium"
                style={{
                  borderColor: target.group.color + "40",
                  backgroundColor: target.group.color + "15",
                  color: target.group.color,
                }}
              >
                {target.name}
              </span>
              <span className="text-xs text-muted-foreground">{target.group.name}</span>
              <button
                type="button"
                onClick={() => setTargetId(null)}
                className="ml-auto text-xs text-muted-foreground hover:text-foreground"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
              {candidates.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">No matching tags</p>
              ) : (
                candidates.slice(0, 20).map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => setTargetId(tag.id)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/50"
                  >
                    <span
                      className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
                      style={{
                        borderColor: tag.group.color + "40",
                        backgroundColor: tag.group.color + "15",
                        color: tag.group.color,
                      }}
                    >
                      {tag.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{tag.group.name}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Info */}
        <p className="mb-4 text-[10px] text-muted-foreground">
          All entity assignments from source tags will be moved to the target. Source tag names become
          aliases of the target. Source tags are then deleted.
        </p>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleMerge}
            disabled={!targetId || isPending}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? "Merging..." : "Merge"}
          </button>
        </div>
      </div>
    </div>
  );
}
