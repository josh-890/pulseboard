"use client";

import { useEffect, useState, useTransition } from "react";
import { FolderInput, GitMerge, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { checkTagMoveAction, moveTagsToGroupAction } from "@/lib/actions/tag-actions";
import type { TagMoveCheck } from "@/lib/services/tag-manage-service";
import { cn } from "@/lib/utils";

const SINGULAR: Record<string, string> = {
  people: "person",
  sessions: "session",
  sets: "set",
  images: "image",
  projects: "project",
  "archive folders": "archive folder",
};
const items = (count: number, noun: string) => `${count} ${count === 1 ? (SINGULAR[noun] ?? noun) : noun}`;

export type MoveTargetGroup = { id: string; name: string; color: string; domain: string; isExclusive: boolean };

export type TagMoveDialogProps = {
  tags: { id: string; name: string; groupId: string }[];
  groups: MoveTargetGroup[];
  /** Pre-selected target (a drop on a group header) */
  initialGroupId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMoved?: () => void;
  /** A tag of the same name lives in the target: merge into it instead */
  onMergeInstead?: (sourceId: string, targetId: string) => void;
};

// Move tags into another group (2026-10-10). The move is checked as soon as a
// group is chosen; anything in the way is shown with numbers and the Move button
// stays off — a conflict is never resolved by guessing.
export function TagMoveDialog({ tags, groups, initialGroupId = null, open, onOpenChange, onMoved, onMergeInstead }: TagMoveDialogProps) {
  const sourceGroups = new Set(tags.map((t) => t.groupId));
  const [groupId, setGroupId] = useState<string | null>(initialGroupId);
  const [withSubTags, setWithSubTags] = useState(true);
  const [check, setCheck] = useState<{ key: string; result: TagMoveCheck } | null>(null);
  const [isPending, startTransition] = useTransition();
  const key = `${groupId}|${withSubTags}`;

  const idsKey = tags.map((t) => t.id).join(",");

  useEffect(() => {
    if (!groupId) return;
    let alive = true;
    checkTagMoveAction(idsKey.split(","), groupId, withSubTags)
      .then((result) => {
        if (alive) setCheck({ key: `${groupId}|${withSubTags}`, result });
      })
      .catch(() => toast.error("Could not check the move"));
    return () => {
      alive = false;
    };
  }, [groupId, withSubTags, idsKey]);

  const current = check?.key === key ? check.result : null;
  const target = groups.find((g) => g.id === groupId);
  const extra = current ? current.tagIds.length - tags.length : 0;

  const move = () =>
    groupId &&
    startTransition(async () => {
      const res = await moveTagsToGroupAction(
        tags.map((t) => t.id),
        groupId,
        withSubTags,
      );
      if (!res.success) {
        toast.error(res.conflicts?.length ? "Something changed — check the conflicts" : (res.error ?? "Could not move"));
        return;
      }
      toast.success(`Moved ${res.moved} tag${res.moved === 1 ? "" : "s"} to ${target?.name}`);
      onOpenChange(false);
      onMoved?.();
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move to another group</DialogTitle>
          <DialogDescription className="break-words">
            {tags.length === 1 ? `“${tags[0].name}”` : `${tags.length} tags`} — names, assignments, aliases and
            sub-tag links stay as they are.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-64 space-y-1 overflow-y-auto" role="radiogroup" aria-label="Target group">
          {groups
            .filter((g) => !(sourceGroups.size === 1 && sourceGroups.has(g.id)))
            .map((g) => (
              <label
                key={g.id}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors duration-150",
                  groupId === g.id ? "bg-primary/10" : "hover:bg-muted/50",
                )}
              >
                <input type="radio" name="target-group" checked={groupId === g.id} onChange={() => setGroupId(g.id)} className="accent-primary" />
                <span className="inline-block size-2 rounded-full" style={{ backgroundColor: g.color }} aria-hidden="true" />
                <span className="flex-1">{g.name}</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {g.domain.toLowerCase()}
                  {g.isExclusive ? " · one per item" : ""}
                </span>
              </label>
            ))}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={withSubTags} onChange={(e) => setWithSubTags(e.target.checked)} className="accent-primary" />
          Take sub-tags along
          {current && extra > 0 && <span className="text-xs text-muted-foreground">(+{extra})</span>}
        </label>

        {groupId && !current && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 size={12} className="animate-spin" /> Checking…
          </p>
        )}
        {current && current.conflicts.length > 0 && (
          <div role="alert" className="space-y-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-200">
            <p className="flex items-center gap-1.5 font-medium">
              <TriangleAlert size={12} /> This move would not fit:
            </p>
            {current.conflicts.map((c, i) =>
              c.kind === "domain" ? (
                <p key={i}>
                  {items(c.count, c.noun)} {c.count === 1 ? "carries" : "carry"} it, and {target?.name} is a{" "}
                  {target?.domain.toLowerCase()} group — remove it from {c.count === 1 ? "it" : "them"} first, or pick another group.
                </p>
              ) : c.kind === "exclusive" ? (
                <p key={i}>
                  {items(c.count, c.noun)} would hold two tags of {target?.name}, which allows one per item.
                </p>
              ) : (
                <p key={i} className="flex flex-wrap items-center gap-1.5">
                  {target?.name} already has “{c.name}”.
                  {onMergeInstead && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenChange(false);
                        onMergeInstead(c.tagId, c.existingId);
                      }}
                      className="inline-flex items-center gap-1 rounded border border-amber-500/40 px-1.5 py-px font-medium hover:bg-amber-500/20"
                    >
                      <GitMerge size={11} /> Merge into it instead
                    </button>
                  )}
                </p>
              ),
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={move} disabled={!current || current.conflicts.length > 0 || isPending} className="gap-1.5">
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <FolderInput size={14} />}
            Move{target ? ` to ${target.name}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
