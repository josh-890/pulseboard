"use client";

import { useCallback, useState, useTransition } from "react";
import {
  ImageIcon,
  Tag,
  FileText,
  Info,
  Folder,
  Link2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MediaItemWithLinks } from "@/lib/services/media-service";
import type { ProfileImageLabel } from "@/lib/services/setting-service";
import type { CollectionSummary } from "@/lib/services/collection-service";
import type { PersonMediaUsage } from "@/lib/types";
import {
  updatePersonMediaLinkAction,
  upsertPersonMediaLinkAction,
  assignHeadshotSlot,
  removeHeadshotSlot,
} from "@/lib/actions/media-actions";
import {
  addToCollectionAction,
  removeFromCollectionAction,
} from "@/lib/actions/collection-actions";
import { MediaUsageBadge } from "./media-badge";

const ALL_USAGES: PersonMediaUsage[] = [
  "HEADSHOT",
  "REFERENCE",
  "PROFILE",
  "PORTFOLIO",
  "BODY_MARK",
  "BODY_MODIFICATION",
  "COSMETIC_PROCEDURE",
];

const USAGE_LABELS: Record<PersonMediaUsage, string> = {
  HEADSHOT: "Headshot",
  REFERENCE: "Reference",
  PROFILE: "Profile",
  PORTFOLIO: "Portfolio",
  BODY_MARK: "Body Mark",
  BODY_MODIFICATION: "Modification",
  COSMETIC_PROCEDURE: "Cosmetic",
};

type EntityOption = { id: string; name: string };

type MediaMetadataPanelProps = {
  items: MediaItemWithLinks[];
  personId: string;
  sessionId: string;
  slotLabels: ProfileImageLabel[];
  collections: CollectionSummary[];
  bodyMarks: EntityOption[];
  bodyModifications: EntityOption[];
  cosmeticProcedures: EntityOption[];
  onItemsChange?: (updatedItems: MediaItemWithLinks[]) => void;
};

export function MediaMetadataPanel({
  items,
  personId,
  sessionId,
  slotLabels,
  collections,
  bodyMarks,
  bodyModifications,
  cosmeticProcedures,
  onItemsChange,
}: MediaMetadataPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["usage", "slots", "linking", "collections", "info"]),
  );

  const isBatch = items.length > 1;
  const single = items.length === 1 ? items[0] : null;
  const primaryLink = single?.links[0] ?? null;

  const toggleSection = useCallback((section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }, []);

  const handleUsageChange = useCallback(
    (usage: PersonMediaUsage) => {
      if (!single) return;
      startTransition(async () => {
        if (primaryLink) {
          await updatePersonMediaLinkAction(
            primaryLink.id,
            { usage },
            personId,
            sessionId,
          );
        } else {
          await upsertPersonMediaLinkAction(
            personId,
            single.id,
            usage,
            {},
            sessionId,
          );
        }
        if (onItemsChange) {
          const updated = items.map((item) => {
            if (item.id !== single.id) return item;
            const updatedLinks = item.links.length > 0
              ? item.links.map((l, i) => (i === 0 ? { ...l, usage } : l))
              : [{ id: "temp", usage, slot: null, bodyRegion: null, bodyMarkId: null, bodyModificationId: null, cosmeticProcedureId: null, isFavorite: false, sortOrder: 0, notes: null }];
            return { ...item, links: updatedLinks };
          });
          onItemsChange(updated);
        }
      });
    },
    [single, primaryLink, personId, sessionId, items, onItemsChange],
  );

  const handleSlotClick = useCallback(
    (slotNumber: number) => {
      if (!single) return;
      const currentSlot = primaryLink?.slot;
      const isToggleOff = currentSlot === slotNumber;

      startTransition(async () => {
        if (isToggleOff) {
          await removeHeadshotSlot(personId, single.id);
        } else {
          await assignHeadshotSlot(personId, single.id, slotNumber);
        }
        if (onItemsChange) {
          const updated = items.map((item) => {
            if (item.id !== single.id) return item;
            const newSlot = isToggleOff ? null : slotNumber;
            const updatedLinks = item.links.length > 0
              ? item.links.map((l, i) => (i === 0 ? { ...l, slot: newSlot, usage: "HEADSHOT" as PersonMediaUsage } : l))
              : [{ id: "temp", usage: "HEADSHOT" as PersonMediaUsage, slot: newSlot, bodyRegion: null, bodyMarkId: null, bodyModificationId: null, cosmeticProcedureId: null, isFavorite: false, sortOrder: 0, notes: null }];
            return { ...item, links: updatedLinks };
          });
          onItemsChange(updated);
        }
      });
    },
    [single, primaryLink, personId, items, onItemsChange],
  );

  const handleEntityLink = useCallback(
    (field: "bodyMarkId" | "bodyModificationId" | "cosmeticProcedureId", value: string | null) => {
      if (!single || !primaryLink) return;
      startTransition(async () => {
        await updatePersonMediaLinkAction(
          primaryLink.id,
          { [field]: value },
          personId,
          sessionId,
        );
        if (onItemsChange) {
          const updated = items.map((item) => {
            if (item.id !== single.id) return item;
            return {
              ...item,
              links: item.links.map((l, i) =>
                i === 0 ? { ...l, [field]: value } : l,
              ),
            };
          });
          onItemsChange(updated);
        }
      });
    },
    [single, primaryLink, personId, sessionId, items, onItemsChange],
  );

  const handleNotesChange = useCallback(
    (notes: string) => {
      if (!single || !primaryLink) return;
      startTransition(async () => {
        await updatePersonMediaLinkAction(
          primaryLink.id,
          { notes: notes || null },
          personId,
          sessionId,
        );
      });
    },
    [single, primaryLink, personId, sessionId],
  );

  const handleCollectionToggle = useCallback(
    (collectionId: string, isCurrentlyIn: boolean) => {
      if (!single) return;
      startTransition(async () => {
        if (isCurrentlyIn) {
          await removeFromCollectionAction(collectionId, [single.id]);
        } else {
          await addToCollectionAction(collectionId, [single.id]);
        }
        if (onItemsChange) {
          const updated = items.map((item) => {
            if (item.id !== single.id) return item;
            const newCollIds = isCurrentlyIn
              ? item.collectionIds.filter((id) => id !== collectionId)
              : [...item.collectionIds, collectionId];
            return { ...item, collectionIds: newCollIds };
          });
          onItemsChange(updated);
        }
      });
    },
    [single, items, onItemsChange],
  );

  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Select a photo to view metadata</p>
      </div>
    );
  }

  if (isBatch) {
    return (
      <div className="space-y-4 p-4">
        <div className="rounded-lg border border-white/15 bg-muted/40 p-3 text-center">
          <p className="text-sm font-medium">{items.length} items selected</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Use the selection bar for batch operations
          </p>
        </div>
        <SectionHeader
          title="Common Tags"
          icon={<Tag size={14} />}
          section="tags"
          expanded={expandedSections.has("tags")}
          onToggle={toggleSection}
        />
        {expandedSections.has("tags") && (
          <div className="flex flex-wrap gap-1">
            {getCommonTags(items).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/15 bg-muted/50 px-2 py-0.5 text-xs"
              >
                {tag}
              </span>
            ))}
            {getCommonTags(items).length === 0 && (
              <p className="text-xs text-muted-foreground italic">No common tags</p>
            )}
          </div>
        )}
      </div>
    );
  }

  // Single item mode
  const currentUsage = primaryLink?.usage;
  const isHeadshot = currentUsage === "HEADSHOT";

  return (
    <div className="space-y-1 p-4 text-sm">
      {/* Usage */}
      <SectionHeader
        title="Usage"
        icon={<ImageIcon size={14} />}
        section="usage"
        expanded={expandedSections.has("usage")}
        onToggle={toggleSection}
      />
      {expandedSections.has("usage") && (
        <div className="flex flex-wrap gap-1 pb-2">
          {ALL_USAGES.map((usage) => (
            <button
              key={usage}
              type="button"
              disabled={isPending}
              onClick={() => handleUsageChange(usage)}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium transition-all",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                currentUsage === usage
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted/90 hover:text-foreground",
              )}
            >
              {USAGE_LABELS[usage]}
            </button>
          ))}
        </div>
      )}

      {/* Slots (only for HEADSHOT) */}
      {isHeadshot && slotLabels.length > 0 && (
        <>
          <SectionHeader
            title="Headshot Slot"
            icon={<ImageIcon size={14} />}
            section="slots"
            expanded={expandedSections.has("slots")}
            onToggle={toggleSection}
          />
          {expandedSections.has("slots") && (
            <div className="flex gap-1.5 pb-2">
              {slotLabels.map((sl, i) => {
                const slotNumber = i + 1;
                const isActive = primaryLink?.slot === slotNumber;
                return (
                  <button
                    key={sl.slot}
                    type="button"
                    disabled={isPending}
                    onClick={() => handleSlotClick(slotNumber)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted/60 text-muted-foreground hover:bg-muted/90 hover:text-foreground",
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

      {/* Tags */}
      <SectionHeader
        title="Tags"
        icon={<Tag size={14} />}
        section="tags"
        expanded={expandedSections.has("tags")}
        onToggle={toggleSection}
      />
      {expandedSections.has("tags") && single && (
        <div className="flex flex-wrap gap-1 pb-2">
          {single.tags.length > 0 ? (
            single.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/15 bg-muted/50 px-2 py-0.5 text-xs"
              >
                {tag}
              </span>
            ))
          ) : (
            <p className="text-xs text-muted-foreground italic">No tags</p>
          )}
        </div>
      )}

      {/* Entity Linking */}
      {primaryLink && (currentUsage === "BODY_MARK" || currentUsage === "BODY_MODIFICATION" || currentUsage === "COSMETIC_PROCEDURE") && (
        <>
          <SectionHeader
            title="Entity Link"
            icon={<Link2 size={14} />}
            section="linking"
            expanded={expandedSections.has("linking")}
            onToggle={toggleSection}
          />
          {expandedSections.has("linking") && (
            <div className="space-y-2 pb-2">
              {currentUsage === "BODY_MARK" && bodyMarks.length > 0 && (
                <EntitySelect
                  label="Body Mark"
                  options={bodyMarks}
                  value={primaryLink.bodyMarkId}
                  onChange={(v) => handleEntityLink("bodyMarkId", v)}
                  disabled={isPending}
                />
              )}
              {currentUsage === "BODY_MODIFICATION" && bodyModifications.length > 0 && (
                <EntitySelect
                  label="Body Modification"
                  options={bodyModifications}
                  value={primaryLink.bodyModificationId}
                  onChange={(v) => handleEntityLink("bodyModificationId", v)}
                  disabled={isPending}
                />
              )}
              {currentUsage === "COSMETIC_PROCEDURE" && cosmeticProcedures.length > 0 && (
                <EntitySelect
                  label="Cosmetic Procedure"
                  options={cosmeticProcedures}
                  value={primaryLink.cosmeticProcedureId}
                  onChange={(v) => handleEntityLink("cosmeticProcedureId", v)}
                  disabled={isPending}
                />
              )}
            </div>
          )}
        </>
      )}

      {/* Collections */}
      {collections.length > 0 && (
        <>
          <SectionHeader
            title="Collections"
            icon={<Folder size={14} />}
            section="collections"
            expanded={expandedSections.has("collections")}
            onToggle={toggleSection}
          />
          {expandedSections.has("collections") && single && (
            <div className="flex flex-wrap gap-1 pb-2">
              {collections.map((coll) => {
                const isIn = single.collectionIds.includes(coll.id);
                return (
                  <button
                    key={coll.id}
                    type="button"
                    disabled={isPending}
                    onClick={() => handleCollectionToggle(coll.id, isIn)}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium transition-all",
                      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      isIn
                        ? "border border-primary/30 bg-primary/15 text-primary"
                        : "border border-white/15 bg-muted/40 text-muted-foreground hover:bg-muted/60",
                    )}
                  >
                    {coll.name}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Notes */}
      <SectionHeader
        title="Notes"
        icon={<FileText size={14} />}
        section="notes"
        expanded={expandedSections.has("notes")}
        onToggle={toggleSection}
      />
      {expandedSections.has("notes") && primaryLink && (
        <NotesField
          value={primaryLink.notes ?? ""}
          onChange={handleNotesChange}
          disabled={isPending}
        />
      )}

      {/* Info */}
      {single && (
        <>
          <SectionHeader
            title="Info"
            icon={<Info size={14} />}
            section="info"
            expanded={expandedSections.has("info")}
            onToggle={toggleSection}
          />
          {expandedSections.has("info") && (
            <div className="space-y-1 pb-2 text-xs text-muted-foreground">
              <p>
                <span className="font-medium text-foreground/70">File:</span>{" "}
                {single.filename}
              </p>
              <p>
                <span className="font-medium text-foreground/70">Size:</span>{" "}
                {single.originalWidth} × {single.originalHeight}
              </p>
              <p>
                <span className="font-medium text-foreground/70">Type:</span>{" "}
                {single.mimeType}
              </p>
              {primaryLink && (
                <div className="mt-1 flex items-center gap-1">
                  <span className="font-medium text-foreground/70">Usage:</span>
                  <MediaUsageBadge
                    usage={primaryLink.usage}
                    slot={primaryLink.slot}
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

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
      className="flex w-full items-center gap-1.5 rounded-md px-1 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
    >
      <span className="shrink-0" aria-hidden="true">
        {icon}
      </span>
      <span className="flex-1 text-left">{title}</span>
      {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
    </button>
  );
}

type EntitySelectProps = {
  label: string;
  options: EntityOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  disabled: boolean;
};

function EntitySelect({
  label,
  options,
  value,
  onChange,
  disabled,
}: EntitySelectProps) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
        className="w-full rounded-md border border-white/15 bg-background/50 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">None</option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.name}
          </option>
        ))}
      </select>
    </div>
  );
}

type NotesFieldProps = {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
};

function NotesField({ value, onChange, disabled }: NotesFieldProps) {
  const [localValue, setLocalValue] = useState(value);

  return (
    <textarea
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={() => {
        if (localValue !== value) {
          onChange(localValue);
        }
      }}
      disabled={disabled}
      placeholder="Add notes..."
      rows={2}
      className="w-full resize-none rounded-md border border-white/15 bg-background/50 px-2 py-1.5 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
    />
  );
}

function getCommonTags(items: MediaItemWithLinks[]): string[] {
  if (items.length === 0) return [];
  return items[0].tags.filter((tag) =>
    items.every((item) => item.tags.includes(tag)),
  );
}
