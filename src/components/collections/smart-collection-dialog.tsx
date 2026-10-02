"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TagQueryBox } from "@/components/tags/tag-query-box";
import { createSavedFilterAction } from "@/lib/actions/saved-filter-actions";
import type { TagFacetGroup } from "@/lib/services/tag-filter-service";

export type SmartCollectionDialogProps = {
  /** Pre-filled query (saving from a gallery's tag filter) */
  initialQuery?: string;
  facets: TagFacetGroup[];
  /** "button" = labelled header button; "compact" = small ⚡ save button */
  variant?: "button" | "compact";
};

// Create a Smart Collection (ADR-0033, S6): a name + an image tag query that is
// evaluated live. From /collections it starts empty; from a gallery's tag
// filter it starts with that query.
export function SmartCollectionDialog({ initialQuery = "", facets, variant = "button" }: SmartCollectionDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [query, setQuery] = useState(initialQuery);
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!name.trim() || !query.trim()) return;
    setSaving(true);
    const res = await createSavedFilterAction("media", name.trim(), `tags=${encodeURIComponent(query.trim())}`);
    setSaving(false);
    if (!res.success || !res.id) {
      toast.error(res.error ?? "Could not create the smart collection");
      return;
    }
    toast.success(`Smart collection “${name.trim()}” created`);
    setOpen(false);
    setName("");
    router.push(`/collections/smart/${res.id}`);
  }

  return (
    <>
      {variant === "button" ? (
        <Button size="sm" variant="outline" className="gap-1" onClick={() => { setQuery(initialQuery); setOpen(true); }}>
          <Zap size={14} />
          New Smart Collection
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => { setQuery(initialQuery); setOpen(true); }}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/15 px-2 text-xs text-muted-foreground transition-colors hover:border-amber-400/40 hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title="Save this filter as a smart collection across all images"
        >
          <Zap size={12} aria-hidden="true" />
          Save as smart collection
        </button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap size={16} className="text-amber-400" /> New Smart Collection
            </DialogTitle>
            <DialogDescription>
              Every image in the library matching the query — kept up to date by itself. Freeze it later to keep a
              fixed copy.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              aria-label="Smart collection name"
              autoFocus
            />
            <div className="flex">
              <TagQueryBox value={query} onSubmit={setQuery} facets={facets} entityType="MEDIA_ITEM" />
            </div>
            <p className="text-xs text-muted-foreground">
              Query: <code className="rounded bg-muted/50 px-1">{query || "—"}</code> (press Enter in the box to take
              what you typed)
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreate} disabled={saving || !name.trim() || !query.trim()} className="gap-1">
                {saving && <Loader2 size={14} className="animate-spin" />}
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
