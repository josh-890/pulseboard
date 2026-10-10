"use client";

import { useMemo, useState, useTransition } from "react";
import { CornerDownRight, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { setTagsParentAction } from "@/lib/actions/tag-actions";
import { cn } from "@/lib/utils";

export type ParentCandidate = { id: string; name: string; groupName: string; color: string };

export type TagParentDialogProps = {
  tags: { id: string; name: string }[];
  candidates: ParentCandidate[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
};

// "Sub-tag of…" for one or many tags. A sub-tag implies its parent — filtering by
// the parent finds it — so this is for "is a" only (naming guide, rule 3). The
// parent may live in another group; a cycle is refused by the server.
export function TagParentDialog({ tags, candidates, open, onOpenChange, onDone }: TagParentDialogProps) {
  const [search, setSearch] = useState("");
  const [parentId, setParentId] = useState<string | null | undefined>(undefined);
  const [isPending, startTransition] = useTransition();
  const q = search.trim().toLowerCase();
  const idsKey = tags.map((t) => t.id).join(",");
  const list = useMemo(() => {
    const own = new Set(idsKey.split(","));
    return candidates
      .filter((c) => !own.has(c.id) && (!q || c.name.includes(q) || c.groupName.toLowerCase().includes(q)))
      .slice(0, 60);
  }, [candidates, q, idsKey]);

  const apply = () =>
    parentId !== undefined &&
    startTransition(async () => {
      const res = await setTagsParentAction(
        tags.map((t) => t.id),
        parentId,
      );
      if (!res.success) {
        toast.error(res.error ?? "Could not set the parent");
        return;
      }
      const parent = candidates.find((c) => c.id === parentId);
      toast.success(parent ? `Now under “${parent.name}”` : "Moved to the top level");
      onOpenChange(false);
      onDone?.();
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sub-tag of…</DialogTitle>
          <DialogDescription className="break-words">
            {tags.length === 1 ? `“${tags[0].name}”` : `${tags.length} tags`} will imply the parent: filtering by the
            parent finds them too. Use it for “is a” — `nailpolish-red` is a `nails-polished`.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md border border-white/15 bg-muted/30 px-2">
          <Search size={13} className="text-muted-foreground" aria-hidden="true" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find the parent tag…"
            aria-label="Find the parent tag"
            className="h-8 min-w-0 flex-1 bg-transparent text-sm focus:outline-none"
            autoFocus
          />
        </div>
        <div className="max-h-64 space-y-0.5 overflow-y-auto" role="radiogroup" aria-label="Parent tag">
          <label className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm", parentId === null ? "bg-primary/10" : "hover:bg-muted/50")}>
            <input type="radio" name="parent" checked={parentId === null} onChange={() => setParentId(null)} className="accent-primary" />
            <span className="italic text-muted-foreground">No parent — top level</span>
          </label>
          {list.map((c) => (
            <label
              key={c.id}
              className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm", parentId === c.id ? "bg-primary/10" : "hover:bg-muted/50")}
            >
              <input type="radio" name="parent" checked={parentId === c.id} onChange={() => setParentId(c.id)} className="accent-primary" />
              <span className="inline-block size-2 rounded-full" style={{ backgroundColor: c.color }} aria-hidden="true" />
              <span className="flex-1 font-mono text-xs">{c.name}</span>
              <span className="text-[10px] text-muted-foreground">{c.groupName}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={parentId === undefined || isPending} className="gap-1.5">
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <CornerDownRight size={14} />}
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
