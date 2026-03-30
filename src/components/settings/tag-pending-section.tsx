"use client";

import { useState, useTransition } from "react";
import { Check, Trash2, Merge, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { approveTagAction, rejectTagAction } from "@/lib/actions/tag-actions";
import { useRouter } from "next/navigation";
import type { TagDefinitionWithGroup } from "@/lib/services/tag-service";

type TagPendingSectionProps = {
  pendingTags: TagDefinitionWithGroup[];
  onMerge?: (sourceTag: TagDefinitionWithGroup) => void;
};

export function TagPendingSection({ pendingTags, onMerge }: TagPendingSectionProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (pendingTags.length === 0) return null;

  function handleApprove(id: string) {
    setPendingAction(id);
    startTransition(async () => {
      const result = await approveTagAction(id);
      setPendingAction(null);
      if (result.success) router.refresh();
    });
  }

  function handleReject(id: string) {
    if (!confirm("Reject and delete this tag? All entity assignments will be removed.")) return;
    setPendingAction(id);
    startTransition(async () => {
      const result = await rejectTagAction(id);
      setPendingAction(null);
      if (result.success) router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 text-left"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-amber-500" />
        ) : (
          <ChevronRight className="h-4 w-4 text-amber-500" />
        )}
        <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
          Pending Tags
        </span>
        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
          {pendingTags.length}
        </span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-1.5">
          {pendingTags.map((tag) => {
            const isLoading = isPending && pendingAction === tag.id;
            return (
              <div
                key={tag.id}
                className={cn(
                  "flex items-center gap-2 rounded-lg border border-border/50 bg-background/50 px-3 py-2",
                  isLoading && "opacity-50",
                )}
              >
                {/* Tag chip */}
                <span
                  className="rounded-full border px-2 py-0.5 text-xs font-medium"
                  style={{
                    borderColor: tag.group.color + "40",
                    backgroundColor: tag.group.color + "15",
                    color: tag.group.color,
                  }}
                >
                  {tag.name}
                </span>

                {/* Group name */}
                <span className="text-xs text-muted-foreground">{tag.group.name}</span>

                {/* Scope badges */}
                <div className="flex flex-1 gap-1">
                  {tag.scope.map((s) => (
                    <span
                      key={s}
                      className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {s}
                    </span>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleApprove(tag.id)}
                    disabled={isLoading}
                    className="rounded p-1 text-green-600 hover:bg-green-500/10 dark:text-green-400"
                    title="Approve"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  {onMerge && (
                    <button
                      type="button"
                      onClick={() => onMerge(tag)}
                      disabled={isLoading}
                      className="rounded p-1 text-blue-600 hover:bg-blue-500/10 dark:text-blue-400"
                      title="Merge into existing tag"
                    >
                      <Merge className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleReject(tag.id)}
                    disabled={isLoading}
                    className="rounded p-1 text-red-600 hover:bg-red-500/10 dark:text-red-400"
                    title="Reject and delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
