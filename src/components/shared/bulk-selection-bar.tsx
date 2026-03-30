"use client";

import { useState, useTransition } from "react";
import { Tag, X, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { TagPicker } from "@/components/shared/tag-picker";
import { bulkAddTagsToEntitiesAction, bulkRemoveTagsFromEntitiesAction } from "@/lib/actions/tag-actions";
import type { TaggableEntity } from "@/lib/services/entity-tag-service";
import { useRouter } from "next/navigation";

type TagPickerScope = "PERSON" | "SESSION" | "MEDIA_ITEM" | "SET" | "PROJECT";

type BulkSelectionBarProps = {
  selectedIds: Set<string>;
  entityType: TaggableEntity;
  scope: TagPickerScope;
  onClear: () => void;
  totalCount: number;
  onSelectAll?: () => void;
};

export function BulkSelectionBar({
  selectedIds,
  entityType,
  scope,
  onClear,
  totalCount,
  onSelectAll,
}: BulkSelectionBarProps) {
  const router = useRouter();
  const [showPicker, setShowPicker] = useState(false);
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [isPending, startTransition] = useTransition();

  if (selectedIds.size === 0) return null;

  function handleApply(tagIds: string[]) {
    if (tagIds.length === 0) return;
    const entityIdList = Array.from(selectedIds);

    startTransition(async () => {
      if (mode === "add") {
        await bulkAddTagsToEntitiesAction(entityType, entityIdList, tagIds);
      } else {
        await bulkRemoveTagsFromEntitiesAction(entityType, entityIdList, tagIds);
      }
      router.refresh();
      setShowPicker(false);
    });
  }

  return (
    <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl border border-white/20 bg-card/90 px-4 py-2.5 shadow-2xl backdrop-blur-xl",
          "dark:border-white/10 dark:bg-card/95",
        )}
      >
        <span className="text-sm font-medium">
          {selectedIds.size} selected
        </span>

        {onSelectAll && selectedIds.size < totalCount && (
          <button
            type="button"
            onClick={onSelectAll}
            className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted"
          >
            <CheckSquare className="h-3 w-3" />
            All {totalCount}
          </button>
        )}

        <div className="h-4 w-px bg-border" />

        {/* Add Tags */}
        <button
          type="button"
          onClick={() => { setMode("add"); setShowPicker(true); }}
          disabled={isPending}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Tag className="h-3 w-3" />
          {isPending && mode === "add" ? "Applying..." : "Add Tags"}
        </button>

        {/* Remove Tags */}
        <button
          type="button"
          onClick={() => { setMode("remove"); setShowPicker(true); }}
          disabled={isPending}
          className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-500/20 disabled:opacity-50 dark:text-red-400"
        >
          <Tag className="h-3 w-3" />
          {isPending && mode === "remove" ? "Removing..." : "Remove Tags"}
        </button>

        <div className="h-4 w-px bg-border" />

        <button
          type="button"
          onClick={onClear}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Clear selection"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tag picker popover */}
      {showPicker && (
        <BulkTagPickerOverlay
          scope={scope}
          mode={mode}
          isPending={isPending}
          onApply={handleApply}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

function BulkTagPickerOverlay({
  scope,
  mode,
  isPending,
  onApply,
  onClose,
}: {
  scope: TagPickerScope;
  mode: "add" | "remove";
  isPending: boolean;
  onApply: (tagIds: string[]) => void;
  onClose: () => void;
}) {
  const [tagIds, setTagIds] = useState<string[]>([]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm sm:items-center">
      <div className="mx-4 mb-20 w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-xl sm:mb-0">
        <h3 className="mb-3 text-sm font-semibold">
          {mode === "add" ? "Add Tags" : "Remove Tags"}
        </h3>

        <TagPicker
          scope={scope}
          selectedTagIds={tagIds}
          onChange={setTagIds}
          showRecent={mode === "add"}
        />

        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onApply(tagIds)}
            disabled={tagIds.length === 0 || isPending}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50",
              mode === "add"
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-red-600 text-white hover:bg-red-700",
            )}
          >
            {isPending
              ? "Applying..."
              : `${mode === "add" ? "Add" : "Remove"}${tagIds.length > 0 ? ` (${tagIds.length})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
