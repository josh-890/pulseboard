"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Check, ImageIcon, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  addMediaToSkillEventAction,
  removeMediaFromSkillEventAction,
} from "@/lib/actions/skill-actions";

type MediaSearchResult = {
  id: string;
  filename: string;
  originalWidth: number;
  originalHeight: number;
  thumbUrl: string;
};

type SkillEventMediaPickerProps = {
  eventId: string;
  sessionId: string;
  personId: string;
  existingMediaIds: string[];
  onClose: () => void;
};

export function SkillEventMediaPicker({
  eventId,
  sessionId,
  personId,
  existingMediaIds,
  onClose,
}: SkillEventMediaPickerProps) {
  const router = useRouter();
  const [results, setResults] = useState<MediaSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set(existingMediaIds));
  const [saving, setSaving] = useState(false);

  const loadMedia = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("sessionId", sessionId);
      params.set("limit", "100");
      const res = await fetch(`/api/media/search?${params.toString()}`);
      const data = (await res.json()) as {
        items: MediaSearchResult[];
      };
      setResults(data.items);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadMedia();
  }, [loadMedia]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    const existingSet = new Set(existingMediaIds);
    const toAdd = Array.from(selected).filter((id) => !existingSet.has(id));
    const toRemove = existingMediaIds.filter((id) => !selected.has(id));

    let hasError = false;
    for (const mediaItemId of toRemove) {
      const result = await removeMediaFromSkillEventAction(eventId, mediaItemId, personId);
      if (!result.success) {
        toast.error(result.error ?? "Failed to remove media");
        hasError = true;
        break;
      }
    }

    if (!hasError && toAdd.length > 0) {
      const result = await addMediaToSkillEventAction(eventId, toAdd, personId);
      if (!result.success) {
        toast.error(result.error ?? "Failed to add media");
        hasError = true;
      }
    }

    setSaving(false);
    if (!hasError) {
      const changed = toAdd.length + toRemove.length;
      if (changed > 0) {
        toast.success(`Updated ${changed} media link${changed > 1 ? "s" : ""}`);
      }
      onClose();
      router.refresh();
    }
  }

  const existingSet = new Set(existingMediaIds);
  const hasChanges =
    Array.from(selected).some((id) => !existingSet.has(id)) ||
    existingMediaIds.some((id) => !selected.has(id));

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Link Session Media</SheetTitle>
          <SheetDescription>
            Select photos from this session to attach to the skill event.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 min-h-0 pt-4">
          {/* Results grid */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {loading && (
              <div className="flex justify-center py-8">
                <Loader2 size={24} className="animate-spin text-muted-foreground" />
              </div>
            )}

            {!loading && results.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
                <ImageIcon size={32} />
                <p className="text-sm">No media in this session</p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {results.map((item) => {
                const isSelected = selected.has(item.id);
                const wasExisting = existingSet.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleSelect(item.id)}
                    className={cn(
                      "group relative aspect-square overflow-hidden rounded-lg border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isSelected
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-transparent hover:border-white/20",
                    )}
                  >
                    {item.thumbUrl ? (
                      <img
                        src={item.thumbUrl}
                        alt={item.filename}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted">
                        <ImageIcon size={24} className="text-muted-foreground" />
                      </div>
                    )}

                    {/* Selection check / remove indicator */}
                    <div
                      className={cn(
                        "absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border transition-all",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : wasExisting
                            ? "border-red-400 bg-red-500/80 text-white"
                            : "border-white/40 bg-black/30 opacity-0 group-hover:opacity-100",
                      )}
                    >
                      {isSelected && <Check size={12} />}
                      {!isSelected && wasExisting && <X size={12} />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-white/10 pt-4">
            <div className="text-sm text-muted-foreground">
              {selected.size > 0 ? (
                <span>
                  {selected.size} photo{selected.size > 1 ? "s" : ""} selected
                </span>
              ) : (
                <span>Select photos to link</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!hasChanges || saving}
                onClick={handleSave}
                className="gap-1"
              >
                {saving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Plus size={14} />
                )}
                Save
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
