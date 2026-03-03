"use client";

import { useCallback, useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  Frame,
  Heart,
  ImageIcon,
  Info,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { GalleryItem } from "@/lib/types";
import type { ProfileImageLabel } from "@/lib/services/setting-service";

const CONTENT_TAGS = [
  { value: "portrait", label: "Portrait" },
  { value: "diploma", label: "Diploma" },
  { value: "tattoo", label: "Tattoo" },
  { value: "document", label: "Document" },
  { value: "general", label: "General" },
  { value: "outtake", label: "Outtake" },
] as const;

type GalleryInfoPanelProps = {
  item: GalleryItem;
  // Set context
  onSetCover?: (mediaItemId: string | null) => void;
  coverMediaItemId?: string | null;
  // Person headshot context
  onAssignHeadshot?: (mediaItemId: string, slot: number) => void;
  onRemoveHeadshot?: (mediaItemId: string) => void;
  profileLabels?: ProfileImageLabel[];
  headshotSlotMap?: Map<string, number>;
  // Common actions
  onFavoriteToggle?: (itemId: string) => void;
  onUpdateTags?: (
    itemId: string,
    tags: string[],
  ) => Promise<{ success: boolean }>;
  onTagsChanged?: (itemId: string, newTags: string[]) => void;
};

export function GalleryInfoPanel({
  item,
  onSetCover,
  coverMediaItemId,
  onAssignHeadshot,
  onRemoveHeadshot,
  profileLabels,
  headshotSlotMap,
  onFavoriteToggle,
  onUpdateTags,
  onTagsChanged,
}: GalleryInfoPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["cover", "headshot", "favorite", "tags", "info"]),
  );
  const [isPending, startTransition] = useTransition();

  const toggleSection = useCallback((section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }, []);

  const isCover = coverMediaItemId === item.id;
  const currentSlot = headshotSlotMap?.get(item.id) ?? null;
  const hasTags = onUpdateTags && onTagsChanged;
  const showTags = hasTags || item.tags.length > 0;

  const contentTagValues = CONTENT_TAGS.map((t) => t.value) as string[];
  const activeContentTags = item.tags.filter((t) =>
    contentTagValues.includes(t),
  );

  const handleContentTagToggle = useCallback(
    (tag: string) => {
      if (!onTagsChanged || !onUpdateTags) return;
      const isActive = activeContentTags.includes(tag);
      const newContentTags = isActive
        ? activeContentTags.filter((t) => t !== tag)
        : [...activeContentTags, tag];
      const nonContentTags = item.tags.filter(
        (t) => !contentTagValues.includes(t),
      );
      const newTags = [...newContentTags, ...nonContentTags];

      onTagsChanged(item.id, newTags);

      startTransition(async () => {
        const result = await onUpdateTags(item.id, newTags);
        if (!result.success) {
          onTagsChanged(item.id, item.tags);
        }
      });
    },
    [activeContentTags, contentTagValues, item, onTagsChanged, onUpdateTags],
  );

  return (
    <div className="space-y-1 p-3 text-sm" onClick={(e) => e.stopPropagation()}>
      {/* Cover toggle (set context) */}
      {onSetCover && (
        <>
          <SectionHeader
            title="Cover"
            icon={<Frame size={14} />}
            section="cover"
            expanded={expandedSections.has("cover")}
            onToggle={toggleSection}
          />
          {expandedSections.has("cover") && (
            <div className="pb-2">
              <button
                type="button"
                onClick={() => onSetCover(isCover ? null : item.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all",
                  isCover
                    ? "border border-amber-500/40 bg-amber-500/20 text-amber-400"
                    : "border border-white/15 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white",
                )}
              >
                <Frame
                  size={14}
                  className={cn(isCover && "fill-amber-500 text-amber-500")}
                />
                {isCover ? "Remove as cover" : "Set as cover"}
              </button>
            </div>
          )}
        </>
      )}

      {/* Headshot slot assignment (person context) */}
      {profileLabels && profileLabels.length > 0 && onAssignHeadshot && (
        <>
          <SectionHeader
            title="Headshot"
            icon={<ImageIcon size={14} />}
            section="headshot"
            expanded={expandedSections.has("headshot")}
            onToggle={toggleSection}
          />
          {expandedSections.has("headshot") && (
            <div className="flex flex-wrap gap-1.5 pb-2">
              {profileLabels.map((sl, i) => {
                const slotNumber = i + 1;
                const isActive = currentSlot === slotNumber;
                return (
                  <button
                    key={sl.slot}
                    type="button"
                    onClick={() => {
                      if (isActive && onRemoveHeadshot) {
                        onRemoveHeadshot(item.id);
                      } else {
                        onAssignHeadshot(item.id, slotNumber);
                      }
                    }}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      isActive
                        ? "ring-2 ring-primary bg-primary/20 text-primary"
                        : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white",
                    )}
                    aria-pressed={isActive}
                  >
                    {sl.label}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Favorite toggle */}
      {onFavoriteToggle && (
        <>
          <SectionHeader
            title="Favorite"
            icon={<Heart size={14} />}
            section="favorite"
            expanded={expandedSections.has("favorite")}
            onToggle={toggleSection}
          />
          {expandedSections.has("favorite") && (
            <div className="pb-2">
              <button
                type="button"
                onClick={() => onFavoriteToggle(item.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all",
                  item.isFavorite
                    ? "border border-red-500/40 bg-red-500/20 text-red-400"
                    : "border border-white/15 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white",
                )}
              >
                <Heart
                  size={14}
                  className={cn(
                    item.isFavorite && "fill-red-500 text-red-500",
                  )}
                />
                {item.isFavorite ? "Remove from favorites" : "Add to favorites"}
              </button>
            </div>
          )}
        </>
      )}

      {/* Tags */}
      {showTags && (
        <>
          <SectionHeader
            title="Tags"
            icon={<Tag size={14} />}
            section="tags"
            expanded={expandedSections.has("tags")}
            onToggle={toggleSection}
          />
          {expandedSections.has("tags") && (
            <div className="pb-2">
              {hasTags ? (
                <div className="flex flex-wrap gap-1.5">
                  {CONTENT_TAGS.map(({ value, label }) => {
                    const isActive = activeContentTags.includes(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handleContentTagToggle(value)}
                        disabled={isPending}
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-medium transition-all",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "bg-white/10 text-white/60 hover:bg-white/15 hover:text-white",
                          isPending && "opacity-60",
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {item.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-white/70"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Caption */}
      {item.caption && (
        <>
          <SectionHeader
            title="Caption"
            icon={<FileText size={14} />}
            section="caption"
            expanded={expandedSections.has("caption")}
            onToggle={toggleSection}
          />
          {expandedSections.has("caption") && (
            <p className="pb-2 text-xs text-white/70">{item.caption}</p>
          )}
        </>
      )}

      {/* File info */}
      <SectionHeader
        title="Info"
        icon={<Info size={14} />}
        section="info"
        expanded={expandedSections.has("info")}
        onToggle={toggleSection}
      />
      {expandedSections.has("info") && (
        <div className="space-y-1 pb-2 text-xs text-white/60">
          <p>
            <span className="font-medium text-white/80">File:</span>{" "}
            {item.filename}
          </p>
          <p>
            <span className="font-medium text-white/80">Size:</span>{" "}
            {item.originalWidth} x {item.originalHeight}
          </p>
          <p>
            <span className="font-medium text-white/80">Type:</span>{" "}
            {item.mimeType}
          </p>
          <p>
            <span className="font-medium text-white/80">Added:</span>{" "}
            {new Date(item.createdAt).toLocaleDateString()}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Sub-component ───────────────────────────────────────────────────────────

type SectionHeaderProps = {
  title: string;
  icon: React.ReactNode;
  section: string;
  expanded: boolean;
  onToggle: (section: string) => void;
};

function SectionHeader({
  title,
  icon,
  section,
  expanded,
  onToggle,
}: SectionHeaderProps) {
  return (
    <button
      type="button"
      onClick={() => onToggle(section)}
      className="flex w-full items-center gap-1.5 rounded-md px-1 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/50 transition-colors hover:bg-white/5 hover:text-white/80"
    >
      <span className="shrink-0" aria-hidden="true">
        {icon}
      </span>
      <span className="flex-1 text-left">{title}</span>
      {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
    </button>
  );
}
