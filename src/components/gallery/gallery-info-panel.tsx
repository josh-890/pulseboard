"use client";

import { useCallback, useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronUp,
  Crosshair,
  Eye,
  EyeOff,
  FileText,
  Frame,
  Heart,
  ImageIcon,
  Info,
  RotateCcw,
  Search,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { GalleryItem } from "@/lib/types";
import type { ProfileImageLabel } from "@/lib/services/setting-service";
import {
  setFocalPointAction,
  resetFocalPointAction,
} from "@/lib/actions/media-actions";

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
  // Find similar
  onFindSimilar?: (mediaItemId: string) => void;
  // Focal point
  sessionId?: string;
  onFocalPointChange?: (itemId: string, focalX: number | null, focalY: number | null) => void;
  onFocalOverlayToggle?: () => void;
  focalOverlayActive?: boolean;
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
  onFindSimilar,
  sessionId,
  onFocalPointChange,
  onFocalOverlayToggle,
  focalOverlayActive,
}: GalleryInfoPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["cover", "headshot", "favorite", "tags", "focal", "info"]),
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

      {/* Find Similar */}
      {onFindSimilar && (
        <>
          <SectionHeader
            title="Similar"
            icon={<Search size={14} />}
            section="similar"
            expanded={expandedSections.has("similar")}
            onToggle={toggleSection}
          />
          {expandedSections.has("similar") && (
            <div className="pb-2">
              <button
                type="button"
                onClick={() => onFindSimilar(item.id)}
                className="flex w-full items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-white/70 transition-all hover:bg-white/10 hover:text-white"
              >
                <Search size={14} />
                Find similar images
              </button>
            </div>
          )}
        </>
      )}

      {/* Focal Point */}
      {sessionId && (
        <>
          <SectionHeader
            title="Focal Point"
            icon={<Crosshair size={14} />}
            section="focal"
            expanded={expandedSections.has("focal")}
            onToggle={toggleSection}
          />
          {expandedSections.has("focal") && (
            <FocalPointSection
              item={item}
              sessionId={sessionId}
              isPending={isPending}
              startTransition={startTransition}
              onFocalPointChange={onFocalPointChange}
              onFocalOverlayToggle={onFocalOverlayToggle}
              focalOverlayActive={focalOverlayActive}
            />
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

// ─── Focal Point Section ─────────────────────────────────────────────────────

type FocalPointSectionProps = {
  item: GalleryItem;
  sessionId: string;
  isPending: boolean;
  startTransition: React.TransitionStartFunction;
  onFocalPointChange?: (itemId: string, focalX: number | null, focalY: number | null) => void;
  onFocalOverlayToggle?: () => void;
  focalOverlayActive?: boolean;
};

function FocalPointSection({
  item,
  sessionId,
  isPending,
  startTransition,
  onFocalPointChange,
  onFocalOverlayToggle,
  focalOverlayActive,
}: FocalPointSectionProps) {
  const hasFocal = item.focalX != null && item.focalY != null;
  const thumbnailUrl = item.urls.gallery_512 ?? item.urls.original;

  function handleImageClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    onFocalPointChange?.(item.id, x, y);

    startTransition(async () => {
      const result = await setFocalPointAction(item.id, x, y, sessionId);
      if (!result.success) {
        onFocalPointChange?.(item.id, item.focalX, item.focalY);
      }
    });
  }

  function handleReset() {
    onFocalPointChange?.(item.id, null, null);

    startTransition(async () => {
      const result = await resetFocalPointAction(item.id, sessionId);
      if (!result.success) {
        onFocalPointChange?.(item.id, item.focalX, item.focalY);
      }
    });
  }

  return (
    <div className="space-y-2 pb-2">
      {/* Status + controls row */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-white/60">
          {hasFocal ? (
            <>
              <span className="font-medium text-primary">Manual</span>
              {" "}
              <span className="text-white/40">
                ({Math.round((item.focalX ?? 0) * 100)}%, {Math.round((item.focalY ?? 0) * 100)}%)
              </span>
            </>
          ) : (
            "Not set"
          )}
        </span>
        <div className="flex items-center gap-1">
          {hasFocal && (
            <button
              type="button"
              onClick={handleReset}
              disabled={isPending}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            >
              <RotateCcw size={10} />
              Clear
            </button>
          )}
          {onFocalOverlayToggle && (
            <button
              type="button"
              onClick={onFocalOverlayToggle}
              className={cn(
                "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] transition-colors",
                focalOverlayActive
                  ? "bg-primary/20 text-primary"
                  : "text-white/50 hover:bg-white/10 hover:text-white",
              )}
              title="Show focal point on main image"
            >
              {focalOverlayActive ? <EyeOff size={10} /> : <Eye size={10} />}
              Overlay
            </button>
          )}
        </div>
      </div>

      {/* Click-to-set thumbnail preview */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleImageClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            const fakeEvent = {
              clientX: rect.left + rect.width / 2,
              clientY: rect.top + rect.height / 2,
              currentTarget: e.currentTarget,
            } as React.MouseEvent<HTMLDivElement>;
            handleImageClick(fakeEvent);
          }
        }}
        className={cn(
          "relative cursor-crosshair overflow-hidden rounded-lg border border-white/15",
          isPending && "pointer-events-none opacity-50",
        )}
        style={{ aspectRatio: `${item.originalWidth} / ${item.originalHeight}`, maxHeight: 200 }}
        aria-label="Click to set focal point"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbnailUrl}
          alt="Focal point preview"
          className="h-full w-full object-contain"
        />
        {hasFocal && (
          <div
            className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary shadow-[0_0_4px_rgba(0,0,0,0.5)]"
            style={{
              left: `${item.focalX! * 100}%`,
              top: `${item.focalY! * 100}%`,
            }}
          >
            <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
          </div>
        )}
      </div>
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
