"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GalleryItem } from "@/lib/types";

type GalleryTagPanelProps = {
  item: GalleryItem;
  onTagsChanged: (itemId: string, newTags: string[]) => void;
  onClose: () => void;
  onUpdateTags: (itemId: string, tags: string[]) => Promise<{ success: boolean }>;
};

const CONTENT_TAGS = [
  { value: "portrait", label: "Portrait" },
  { value: "diploma", label: "Diploma" },
  { value: "tattoo", label: "Tattoo" },
  { value: "document", label: "Document" },
  { value: "general", label: "General" },
  { value: "outtake", label: "Outtake" },
] as const;

export function GalleryTagPanel({
  item,
  onTagsChanged,
  onClose,
  onUpdateTags,
}: GalleryTagPanelProps) {
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const currentTags = item.tags;
  const contentTagValues = CONTENT_TAGS.map((t) => t.value) as string[];
  const activeContentTags = currentTags.filter((t) =>
    contentTagValues.includes(t),
  );

  const handleContentTagToggle = useCallback(
    (tag: string) => {
      const isActive = activeContentTags.includes(tag);
      const newContentTags = isActive
        ? activeContentTags.filter((t) => t !== tag)
        : [...activeContentTags, tag];
      // Keep any non-content tags that may exist
      const nonContentTags = currentTags.filter(
        (t) => !contentTagValues.includes(t),
      );
      const newTags = [...newContentTags, ...nonContentTags];

      onTagsChanged(item.id, newTags);

      startTransition(async () => {
        const result = await onUpdateTags(item.id, newTags);
        if (!result.success) {
          onTagsChanged(item.id, currentTags);
        }
      });
    },
    [activeContentTags, contentTagValues, currentTags, item.id, onTagsChanged, onUpdateTags],
  );

  return (
    <div
      ref={panelRef}
      className={cn(
        "rounded-t-2xl bg-black/80 px-6 py-5 backdrop-blur-md transition-transform duration-200",
        visible ? "translate-y-0" : "translate-y-full",
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Tags</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close tag panel"
          className="rounded-full p-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={16} />
        </button>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/60">
          Content
        </p>
        <div className="flex flex-wrap gap-2">
          {CONTENT_TAGS.map(({ value, label }) => {
            const isActive = activeContentTags.includes(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => handleContentTagToggle(value)}
                disabled={isPending}
                className={cn(
                  "rounded-full px-3.5 py-2 text-xs font-medium transition-all duration-150",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-white/10 text-white/70 hover:bg-white/20",
                  isPending && "opacity-60",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
