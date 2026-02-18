"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  updatePhotoTags,
  assignProfileSlot,
} from "@/lib/actions/photo-actions";
import type { PhotoWithUrls } from "@/lib/types";
import type { ProfileImageLabel } from "@/lib/services/setting-service";

type ClientPhoto = Omit<PhotoWithUrls, "variants">;

type LightboxTagPanelProps = {
  photo: ClientPhoto;
  entityType: "person" | "set";
  entityId: string;
  profileLabels: ProfileImageLabel[];
  onTagsChanged: (photoId: string, newTags: string[]) => void;
  onClose: () => void;
};

const CONTENT_TAGS = [
  { value: "portrait", label: "Portrait" },
  { value: "diploma", label: "Diploma" },
  { value: "tattoo", label: "Tattoo" },
  { value: "document", label: "Document" },
  { value: "general", label: "General" },
  { value: "outtake", label: "Outtake" },
] as const;

export function LightboxTagPanel({
  photo,
  entityType,
  entityId,
  profileLabels,
  onTagsChanged,
  onClose,
}: LightboxTagPanelProps) {
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();

  // Slide-in animation on mount
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const currentTags = photo.tags;
  const contentTagValues = CONTENT_TAGS.map((t) => t.value) as string[];
  const activeContentTags = currentTags.filter((t) =>
    contentTagValues.includes(t),
  );
  const activeProfileSlots = currentTags.filter((t) => t.startsWith("p-img"));

  const handleContentTagToggle = useCallback(
    (tag: string) => {
      const isActive = activeContentTags.includes(tag);
      const newContentTags = isActive
        ? activeContentTags.filter((t) => t !== tag)
        : [...activeContentTags, tag];
      const newTags = [...newContentTags, ...activeProfileSlots];

      // Optimistic update
      onTagsChanged(photo.id, newTags);

      startTransition(async () => {
        const result = await updatePhotoTags({
          photoId: photo.id,
          tags: newTags,
          entityType,
          entityId,
        });
        if (!result.success) {
          // Revert on failure
          onTagsChanged(photo.id, currentTags);
        }
      });
    },
    [
      activeContentTags,
      activeProfileSlots,
      currentTags,
      entityId,
      entityType,
      onTagsChanged,
      photo.id,
    ],
  );

  const handleProfileSlotToggle = useCallback(
    (slot: string) => {
      const isActive = activeProfileSlots.includes(slot);

      if (isActive) {
        // Remove the slot tag
        const newTags = currentTags.filter((t) => t !== slot);
        onTagsChanged(photo.id, newTags);

        startTransition(async () => {
          const result = await updatePhotoTags({
            photoId: photo.id,
            tags: newTags,
            entityType,
            entityId,
          });
          if (!result.success) {
            onTagsChanged(photo.id, currentTags);
          }
        });
      } else {
        // Assign the slot (server handles uniqueness — removes from other photos)
        const newTags = [
          ...activeContentTags,
          ...activeProfileSlots.filter((s) => s !== slot),
          slot,
        ];
        onTagsChanged(photo.id, newTags);

        startTransition(async () => {
          const result = await assignProfileSlot({
            photoId: photo.id,
            entityType,
            entityId,
            slot,
          });
          if (!result.success) {
            onTagsChanged(photo.id, currentTags);
          }
        });
      }
    },
    [
      activeContentTags,
      activeProfileSlots,
      currentTags,
      entityId,
      entityType,
      onTagsChanged,
      photo.id,
    ],
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
        <h3 className="text-sm font-semibold text-white">Photo Tags</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close tag panel"
          className="rounded-full p-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={16} />
        </button>
      </div>

      {/* Content Tags */}
      <div className="mb-4">
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

      {/* Profile Slots */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/60">
          Profile Slots
        </p>
        <div className="flex flex-wrap gap-2">
          {profileLabels.map(({ slot, label }) => {
            const isActive = activeProfileSlots.includes(slot);
            return (
              <button
                key={slot}
                type="button"
                onClick={() => handleProfileSlotToggle(slot)}
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
