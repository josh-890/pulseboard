"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import {
  ImageIcon,
  Tag,
  FileText,
  Info,
  Folder,
  Link2,
  ChevronDown,
  ChevronUp,
  Crosshair,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MediaItemWithLinks } from "@/lib/services/media-service";
import type { ProfileImageLabel } from "@/lib/services/setting-service";
import type { CollectionSummary } from "@/lib/services/collection-service";
import type { PersonMediaUsage } from "@/lib/types";
import type { CategoryWithGroup } from "@/components/gallery/gallery-info-panel";
import {
  updatePersonMediaLinkAction,
  upsertPersonMediaLinkAction,
  removePersonMediaLinkAction,
  assignHeadshotSlot,
  removeHeadshotSlot,
  setFocalPointAction,
  resetFocalPointAction,
  batchSetUsageAction,
  batchRemoveUsageAction,
  batchEntityLinkAction,
  batchSetBodyRegionsAction,
} from "@/lib/actions/media-actions";
import { EntityCombobox } from "@/components/shared/entity-combobox";
import { BodyRegionCompact } from "@/components/shared/body-region-picker";
import {
  assignCategoryAction,
  removeCategoryAction,
} from "@/lib/actions/category-actions";
import {
  addToCollectionAction,
  removeFromCollectionAction,
} from "@/lib/actions/collection-actions";
import { MediaUsageBadge } from "./media-badge";

const TOGGLEABLE_USAGES: PersonMediaUsage[] = [
  "PROFILE",
  "PORTFOLIO",
];

const USAGE_LABELS: Record<PersonMediaUsage, string> = {
  HEADSHOT: "Headshot",
  PROFILE: "Profile",
  PORTFOLIO: "Portfolio",
  DETAIL: "Detail",
};

const USAGE_ACTIVE_COLORS: Record<PersonMediaUsage, string> = {
  HEADSHOT: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  PROFILE: "bg-green-500/20 text-green-400 border-green-500/40",
  PORTFOLIO: "bg-teal-500/20 text-teal-400 border-teal-500/40",
  DETAIL: "bg-orange-500/20 text-orange-400 border-orange-500/40",
};

type EntityOption = { id: string; name: string };

type MediaMetadataPanelProps = {
  items: MediaItemWithLinks[];
  allItems?: MediaItemWithLinks[];
  personId: string;
  sessionId: string;
  slotLabels: ProfileImageLabel[];
  collections: CollectionSummary[];
  categories: CategoryWithGroup[];
  bodyMarks: EntityOption[];
  bodyModifications: EntityOption[];
  cosmeticProcedures: EntityOption[];
  onItemsChange?: (updatedItems: MediaItemWithLinks[]) => void;
  onRequestDelete?: () => void;
  onClearSelection?: () => void;
  onBatchComplete?: () => void;
  variant?: "default" | "lightbox";
};

export function MediaMetadataPanel({
  items,
  allItems,
  personId,
  sessionId,
  slotLabels,
  collections,
  categories,
  bodyMarks,
  bodyModifications,
  cosmeticProcedures,
  onItemsChange,
  onRequestDelete,
  onClearSelection,
  onBatchComplete,
  variant = "default",
}: MediaMetadataPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["usage", "slots", "linking", "collections", "info"]),
  );

  const isLightbox = variant === "lightbox";
  const isBatch = items.length > 1;
  const single = items.length === 1 ? items[0] : null;

  const activeUsages = useMemo(
    () => new Set(single?.links.map((l) => l.usage) ?? []),
    [single?.links],
  );

  // Build slot → thumbnail URL map from all items
  const slotThumbnails = useMemo(() => {
    const map = new Map<number, string>();
    const source = allItems ?? items;
    for (const item of source) {
      for (const link of item.links) {
        if (link.usage === "HEADSHOT" && link.slot != null && !map.has(link.slot)) {
          const url = item.urls.profile_128 ?? item.urls.gallery_512 ?? item.urls.original;
          if (url) map.set(link.slot, url);
        }
      }
    }
    return map;
  }, [allItems, items]);

  const toggleSection = useCallback((section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }, []);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
        <ImageIcon size={24} className="text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground/50">Select a photo to view details</p>
      </div>
    );
  }

  const handleUsageToggle = useCallback(
    (usage: PersonMediaUsage) => {
      if (!single) return;
      const isActive = activeUsages.has(usage);

      startTransition(async () => {
        if (isActive) {
          await removePersonMediaLinkAction(personId, single.id, usage, sessionId);
          if (onItemsChange) {
            const updated = items.map((item) => {
              if (item.id !== single.id) return item;
              return { ...item, links: item.links.filter((l) => l.usage !== usage) };
            });
            onItemsChange(updated);
          }
        } else {
          await upsertPersonMediaLinkAction(personId, single.id, usage, {}, sessionId);
          if (onItemsChange) {
            const newLink = {
              id: `temp-${usage}`,
              usage,
              slot: null,
              bodyRegion: null,
              bodyRegions: [],
              bodyMarkId: null,
              bodyModificationId: null,
              cosmeticProcedureId: null,
              categoryId: null,
              personaId: null,
              isFavorite: false,
              sortOrder: 0,
              notes: null,
            };
            const updated = items.map((item) => {
              if (item.id !== single.id) return item;
              return { ...item, links: [...item.links, newLink] };
            });
            onItemsChange(updated);
          }
        }
      });
    },
    [single, activeUsages, personId, sessionId, items, onItemsChange],
  );

  const getLinkForUsage = useCallback(
    (usage: PersonMediaUsage) => single?.links.find((l) => l.usage === usage) ?? null,
    [single?.links],
  );

  // Category toggle
  const activeCategoryIds = useMemo(
    () => new Set(single?.links.filter((l) => l.usage === "DETAIL" && l.categoryId).map((l) => l.categoryId!) ?? []),
    [single?.links],
  );

  const handleCategoryToggle = useCallback(
    (categoryId: string) => {
      if (!single) return;
      const isActive = activeCategoryIds.has(categoryId);

      startTransition(async () => {
        if (isActive) {
          await removeCategoryAction(personId, single.id, categoryId, sessionId);
          if (onItemsChange) {
            const updated = items.map((item) => {
              if (item.id !== single.id) return item;
              return { ...item, links: item.links.filter((l) => !(l.usage === "DETAIL" && l.categoryId === categoryId)) };
            });
            onItemsChange(updated);
          }
        } else {
          await assignCategoryAction(personId, single.id, categoryId, sessionId);
          if (onItemsChange) {
            const newLink = {
              id: `temp-cat-${categoryId}`,
              usage: "DETAIL" as PersonMediaUsage,
              slot: null,
              bodyRegion: null,
              bodyRegions: [],
              bodyMarkId: null,
              bodyModificationId: null,
              cosmeticProcedureId: null,
              categoryId,
              personaId: null,
              isFavorite: false,
              sortOrder: 0,
              notes: null,
            };
            const updated = items.map((item) => {
              if (item.id !== single.id) return item;
              return { ...item, links: [...item.links, newLink] };
            });
            onItemsChange(updated);
          }
        }
      });
    },
    [single, activeCategoryIds, personId, sessionId, items, onItemsChange],
  );

  const categoryGroups = useMemo(() => {
    if (!categories.length) return [];
    const grouped = new Map<string, { groupName: string; items: CategoryWithGroup[] }>();
    for (const cat of categories) {
      if (!grouped.has(cat.groupId)) {
        grouped.set(cat.groupId, { groupName: cat.groupName, items: [] });
      }
      grouped.get(cat.groupId)!.items.push(cat);
    }
    return Array.from(grouped.values());
  }, [categories]);

  const handleSlotClick = useCallback(
    (slotNumber: number) => {
      if (!single) return;
      const headshotLink = getLinkForUsage("HEADSHOT");
      const currentSlot = headshotLink?.slot;
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
            if (isToggleOff) {
              // Remove the HEADSHOT link entirely
              return { ...item, links: item.links.filter((l) => l.usage !== "HEADSHOT") };
            }
            if (headshotLink) {
              // Update existing link's slot
              return {
                ...item,
                links: item.links.map((l) =>
                  l.usage === "HEADSHOT" ? { ...l, slot: slotNumber } : l,
                ),
              };
            }
            // Add new HEADSHOT link with slot
            return {
              ...item,
              links: [
                ...item.links,
                {
                  id: `temp-HEADSHOT`,
                  usage: "HEADSHOT" as PersonMediaUsage,
                  slot: slotNumber,
                  bodyRegion: null,
                  bodyRegions: [],
                  bodyMarkId: null,
                  bodyModificationId: null,
                  cosmeticProcedureId: null,
                  categoryId: null,
                  personaId: null,
                  isFavorite: false,
                  sortOrder: 0,
                  notes: null,
                },
              ],
            };
          });
          onItemsChange(updated);
        }
      });
    },
    [single, getLinkForUsage, personId, items, onItemsChange],
  );

  const handleEntityLink = useCallback(
    (
      usage: PersonMediaUsage,
      field: "bodyMarkId" | "bodyModificationId" | "cosmeticProcedureId",
      value: string | null,
    ) => {
      if (!single) return;
      const link = getLinkForUsage(usage);
      if (!link) return;
      startTransition(async () => {
        await updatePersonMediaLinkAction(
          link.id,
          { [field]: value },
          personId,
          sessionId,
        );
        if (onItemsChange) {
          const updated = items.map((item) => {
            if (item.id !== single.id) return item;
            return {
              ...item,
              links: item.links.map((l) =>
                l.usage === usage ? { ...l, [field]: value } : l,
              ),
            };
          });
          onItemsChange(updated);
        }
      });
    },
    [single, getLinkForUsage, personId, sessionId, items, onItemsChange],
  );

  const handleNotesChange = useCallback(
    (linkId: string, notes: string) => {
      startTransition(async () => {
        await updatePersonMediaLinkAction(
          linkId,
          { notes: notes || null },
          personId,
          sessionId,
        );
      });
    },
    [personId, sessionId],
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

  // Entity linking is now driven by active DETAIL categories with entityModel
  const activeEntityCategories = useMemo(
    () => categories.filter((c) => c.entityModel && activeCategoryIds.has(c.id)),
    [categories, activeCategoryIds],
  );
  const hasEntityUsage = activeEntityCategories.length > 0;

  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Select a photo to view metadata</p>
      </div>
    );
  }

  if (isBatch) {
    return (
      <BatchPanel
        items={items}
        personId={personId}
        sessionId={sessionId}
        collections={collections}
        categories={categories}
        bodyMarks={bodyMarks}
        bodyModifications={bodyModifications}
        cosmeticProcedures={cosmeticProcedures}
        expandedSections={expandedSections}
        toggleSection={toggleSection}
        isPending={isPending}
        startTransition={startTransition}
        onRequestDelete={onRequestDelete}
        onClearSelection={onClearSelection}
        onBatchComplete={onBatchComplete}
        isLightbox={isLightbox}
      />
    );
  }

  // Single item mode

  return (
    <div className={cn("space-y-1 text-sm", isLightbox ? "p-3" : "p-4")}>
      {/* Usage toggles */}
      <SectionHeader
        title="Usage"
        icon={<ImageIcon size={14} />}
        section="usage"
        expanded={expandedSections.has("usage")}
        onToggle={toggleSection}
      />
      {expandedSections.has("usage") && (
        <div className="flex flex-wrap gap-1 pb-2">
          {TOGGLEABLE_USAGES.map((usage) => {
            const isActive = activeUsages.has(usage);
            return (
              <button
                key={usage}
                type="button"
                disabled={isPending}
                onClick={() => handleUsageToggle(usage)}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs font-medium transition-all",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  isActive
                    ? USAGE_ACTIVE_COLORS[usage]
                    : "border-transparent bg-muted/60 text-muted-foreground hover:bg-muted/90 hover:text-foreground",
                )}
                aria-pressed={isActive}
              >
                {USAGE_LABELS[usage]}
              </button>
            );
          })}
        </div>
      )}

      {/* Headshot slot assignment */}
      {slotLabels.length > 0 && (
        <>
          <SectionHeader
            title="Headshot"
            icon={<ImageIcon size={14} />}
            section="slots"
            expanded={expandedSections.has("slots")}
            onToggle={toggleSection}
          />
          {expandedSections.has("slots") && (
            <div className="flex flex-wrap gap-1.5 pb-2">
              {slotLabels.map((sl, i) => {
                const slotNumber = i + 1;
                const headshotLink = getLinkForUsage("HEADSHOT");
                const isActive = headshotLink?.slot === slotNumber;
                const thumbUrl = slotThumbnails.get(slotNumber);
                return (
                  <button
                    key={sl.slot}
                    type="button"
                    disabled={isPending}
                    onClick={() => handleSlotClick(slotNumber)}
                    className={cn(
                      "relative overflow-hidden rounded-md text-xs font-medium transition-all",
                      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      thumbUrl ? "h-10 w-14" : "px-2.5 py-1",
                      isActive
                        ? "ring-2 ring-primary shadow-sm"
                        : thumbUrl
                          ? "opacity-70 hover:opacity-100"
                          : "bg-muted/60 text-muted-foreground hover:bg-muted/90 hover:text-foreground",
                    )}
                    aria-pressed={isActive}
                  >
                    {thumbUrl && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={thumbUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                        draggable={false}
                      />
                    )}
                    <span className={cn(
                      "relative",
                      thumbUrl && "rounded px-1 py-0.5 text-[10px] bg-black/60 text-white",
                    )}>
                      {sl.label}
                    </span>
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

      {/* Categories */}
      {categoryGroups.length > 0 && (
        <>
          <SectionHeader
            title="Categories"
            icon={<Tag size={14} />}
            section="categories"
            expanded={expandedSections.has("categories")}
            onToggle={toggleSection}
          />
          {expandedSections.has("categories") && (
            <div className="space-y-2 pb-2">
              {categoryGroups.map((group) => (
                <div key={group.groupName}>
                  <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                    {group.groupName}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {group.items.map((cat) => {
                      const isActive = activeCategoryIds.has(cat.id);
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          disabled={isPending}
                          onClick={() => handleCategoryToggle(cat.id)}
                          className={cn(
                            "rounded-md border px-2 py-1 text-xs font-medium transition-all",
                            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                            isActive
                              ? "border-orange-500/40 bg-orange-500/20 text-orange-400"
                              : "border-transparent bg-muted/60 text-muted-foreground hover:bg-muted/90 hover:text-foreground",
                          )}
                          aria-pressed={isActive}
                        >
                          {cat.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Entity Linking (per active usage that supports it) */}
      {hasEntityUsage && (
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
              {activeEntityCategories.map((cat) => {
                const entityField =
                  cat.entityModel === "BodyMark" ? "bodyMarkId" as const
                    : cat.entityModel === "BodyModification" ? "bodyModificationId" as const
                    : "cosmeticProcedureId" as const;
                const options =
                  cat.entityModel === "BodyMark" ? bodyMarks
                    : cat.entityModel === "BodyModification" ? bodyModifications
                    : cosmeticProcedures;
                const detailLink = single?.links.find(
                  (l) => l.usage === "DETAIL" && l.categoryId === cat.id,
                );
                if (options.length === 0) return null;
                return (
                  <EntitySelect
                    key={cat.id}
                    label={cat.name}
                    options={options}
                    value={detailLink?.[entityField] ?? null}
                    onChange={(v) => {
                      if (!detailLink) return;
                      handleEntityLink("DETAIL", entityField, v);
                    }}
                    disabled={isPending}
                  />
                );
              })}
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

      {/* Notes — show per active link */}
      {single && single.links.length > 0 && (
        <>
          <SectionHeader
            title="Notes"
            icon={<FileText size={14} />}
            section="notes"
            expanded={expandedSections.has("notes")}
            onToggle={toggleSection}
          />
          {expandedSections.has("notes") && (
            <div className="space-y-2 pb-2">
              {single.links.length === 1 ? (
                <NotesField
                  value={single.links[0].notes ?? ""}
                  onChange={(notes) => handleNotesChange(single.links[0].id, notes)}
                  disabled={isPending}
                />
              ) : (
                single.links.map((link) => (
                  <div key={link.id}>
                    <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      {USAGE_LABELS[link.usage]}
                    </span>
                    <NotesField
                      value={link.notes ?? ""}
                      onChange={(notes) => handleNotesChange(link.id, notes)}
                      disabled={isPending}
                    />
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* Focal Point */}
      {single && (
        <>
          <SectionHeader
            title="Focal Point"
            icon={<Crosshair size={14} />}
            section="focal"
            expanded={expandedSections.has("focal")}
            onToggle={toggleSection}
          />
          {expandedSections.has("focal") && (
            <FocalPointEditor
              item={single}
              sessionId={sessionId}
              isPending={isPending}
              startTransition={startTransition}
              onItemsChange={onItemsChange}
              items={items}
            />
          )}
        </>
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
            <div className={cn(
              "space-y-1 pb-2 text-xs",
              isLightbox ? "text-white/60" : "text-muted-foreground",
            )}>
              <p>
                <span className={cn("font-medium", isLightbox ? "text-white/80" : "text-foreground/70")}>File:</span>{" "}
                {single.filename}
              </p>
              <p>
                <span className={cn("font-medium", isLightbox ? "text-white/80" : "text-foreground/70")}>Size:</span>{" "}
                {single.originalWidth} × {single.originalHeight}
              </p>
              <p>
                <span className={cn("font-medium", isLightbox ? "text-white/80" : "text-foreground/70")}>Type:</span>{" "}
                {single.mimeType}
              </p>
              {single.links.length > 0 && (
                <div className="mt-1 flex items-center gap-1">
                  <span className="font-medium text-foreground/70">Usage:</span>
                  {single.links.map((link) => (
                      <MediaUsageBadge
                        key={link.id}
                        usage={link.usage}
                        slot={link.slot}
                      />
                    ))}
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

// ─── Batch Panel ─────────────────────────────────────────────────────────────

type BatchPanelProps = {
  items: MediaItemWithLinks[];
  personId: string;
  sessionId: string;
  collections: CollectionSummary[];
  categories: CategoryWithGroup[];
  bodyMarks: EntityOption[];
  bodyModifications: EntityOption[];
  cosmeticProcedures: EntityOption[];
  expandedSections: Set<string>;
  toggleSection: (section: string) => void;
  isPending: boolean;
  startTransition: (callback: () => Promise<void> | void) => void;
  onRequestDelete?: () => void;
  onClearSelection?: () => void;
  onBatchComplete?: () => void;
  isLightbox: boolean;
};

function BatchPanel({
  items,
  personId,
  sessionId,
  collections,
  categories,
  bodyMarks,
  bodyModifications,
  cosmeticProcedures,
  expandedSections,
  toggleSection,
  isPending,
  startTransition,
  onRequestDelete,
  onClearSelection,
  onBatchComplete,
  isLightbox,
}: BatchPanelProps) {
  // Compute usage states across all selected items
  const { commonUsages, mixedUsages } = useMemo(() => {
    const common = new Set<PersonMediaUsage>();
    const mixed = new Set<PersonMediaUsage>();
    for (const usage of TOGGLEABLE_USAGES) {
      const count = items.filter((item) =>
        item.links.some((l) => l.usage === usage),
      ).length;
      if (count === items.length) common.add(usage);
      else if (count > 0) mixed.add(usage);
    }
    return { commonUsages: common, mixedUsages: mixed };
  }, [items]);

  // Compute collection membership across all selected items
  const collectionStates = useMemo(() => {
    const map = new Map<string, "all" | "some" | "none">();
    for (const coll of collections) {
      const count = items.filter((item) =>
        item.collectionIds.includes(coll.id),
      ).length;
      if (count === items.length) map.set(coll.id, "all");
      else if (count > 0) map.set(coll.id, "some");
      else map.set(coll.id, "none");
    }
    return map;
  }, [items, collections]);

  const handleBatchUsageToggle = useCallback(
    (usage: PersonMediaUsage) => {
      const isActive = commonUsages.has(usage);
      const ids = items.map((item) => item.id);
      startTransition(async () => {
        if (isActive) {
          await batchRemoveUsageAction(personId, ids, usage, sessionId);
        } else {
          await batchSetUsageAction(personId, ids, usage, sessionId);
        }
        onBatchComplete?.();
      });
    },
    [commonUsages, items, personId, sessionId, startTransition, onBatchComplete],
  );

  const handleBatchCollectionAdd = useCallback(
    (collectionId: string) => {
      const ids = items.map((item) => item.id);
      startTransition(async () => {
        await addToCollectionAction(collectionId, ids);
        onBatchComplete?.();
      });
    },
    [items, startTransition, onBatchComplete],
  );

  // Batch category toggle
  const batchCategoryGroups = useMemo(() => {
    if (!categories.length) return [];
    const grouped = new Map<string, { groupName: string; items: CategoryWithGroup[] }>();
    for (const cat of categories) {
      if (!grouped.has(cat.groupId)) {
        grouped.set(cat.groupId, { groupName: cat.groupName, items: [] });
      }
      grouped.get(cat.groupId)!.items.push(cat);
    }
    return Array.from(grouped.values());
  }, [categories]);

  const { commonCategoryIds, mixedCategoryIds } = useMemo(() => {
    const common = new Set<string>();
    const mixed = new Set<string>();
    for (const cat of categories) {
      const count = items.filter((item) =>
        item.links.some((l) => l.usage === "DETAIL" && l.categoryId === cat.id),
      ).length;
      if (count === items.length) common.add(cat.id);
      else if (count > 0) mixed.add(cat.id);
    }
    return { commonCategoryIds: common, mixedCategoryIds: mixed };
  }, [items, categories]);

  const handleBatchCategoryToggle = useCallback(
    (categoryId: string) => {
      const isActive = commonCategoryIds.has(categoryId);
      const ids = items.map((item) => item.id);
      startTransition(async () => {
        if (isActive) {
          for (const mediaItemId of ids) {
            await removeCategoryAction(personId, mediaItemId, categoryId, sessionId);
          }
        } else {
          for (const mediaItemId of ids) {
            await assignCategoryAction(personId, mediaItemId, categoryId, sessionId);
          }
        }
        onBatchComplete?.();
      });
    },
    [commonCategoryIds, items, personId, sessionId, startTransition, onBatchComplete],
  );

  return (
    <div className={cn(
      "space-y-1 text-sm",
      isLightbox ? "p-3" : "p-4",
      isPending && "opacity-70 pointer-events-none",
    )}>
      {/* Header: count + clear */}
      <div className="flex items-center justify-between pb-2">
        <span className="text-sm font-medium">{items.length} selected</span>
        {onClearSelection && (
          <button
            type="button"
            onClick={onClearSelection}
            className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            aria-label="Clear selection"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Usage toggles */}
      <SectionHeader
        title="Usage"
        icon={<ImageIcon size={14} />}
        section="usage"
        expanded={expandedSections.has("usage")}
        onToggle={toggleSection}
      />
      {expandedSections.has("usage") && (
        <div className="flex flex-wrap gap-1 pb-2">
          {TOGGLEABLE_USAGES.map((usage) => {
            const isActive = commonUsages.has(usage);
            const isMixed = mixedUsages.has(usage);
            return (
              <button
                key={usage}
                type="button"
                disabled={isPending}
                onClick={() => handleBatchUsageToggle(usage)}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs font-medium transition-all",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  isActive
                    ? USAGE_ACTIVE_COLORS[usage]
                    : isMixed
                      ? cn(USAGE_ACTIVE_COLORS[usage], "opacity-40 border-dashed")
                      : "border-transparent bg-muted/60 text-muted-foreground hover:bg-muted/90 hover:text-foreground",
                )}
                aria-pressed={isActive}
                title={isMixed ? "Present on some items — click to add to all" : undefined}
              >
                {USAGE_LABELS[usage]}
              </button>
            );
          })}
        </div>
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
          {expandedSections.has("collections") && (
            <div className="flex flex-wrap gap-1 pb-2">
              {collections.map((coll) => {
                const state = collectionStates.get(coll.id) ?? "none";
                return (
                  <button
                    key={coll.id}
                    type="button"
                    disabled={isPending || state === "all"}
                    onClick={() => handleBatchCollectionAdd(coll.id)}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium transition-all",
                      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      state === "all"
                        ? "border border-primary/30 bg-primary/15 text-primary"
                        : state === "some"
                          ? "border border-dashed border-primary/30 bg-primary/10 text-primary/70 hover:bg-primary/20"
                          : "border border-white/15 bg-muted/40 text-muted-foreground hover:bg-muted/60",
                    )}
                    title={
                      state === "all"
                        ? "All items in this collection"
                        : state === "some"
                          ? "Some items in this collection — click to add all"
                          : "Click to add all items"
                    }
                  >
                    {coll.name}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Batch Categories */}
      {batchCategoryGroups.length > 0 && (
        <>
          <SectionHeader
            title="Categories"
            icon={<Tag size={14} />}
            section="categories"
            expanded={expandedSections.has("categories")}
            onToggle={toggleSection}
          />
          {expandedSections.has("categories") && (
            <div className="space-y-2 pb-2">
              {batchCategoryGroups.map((group) => (
                <div key={group.groupName}>
                  <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                    {group.groupName}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {group.items.map((cat) => {
                      const isActive = commonCategoryIds.has(cat.id);
                      const isMixed = mixedCategoryIds.has(cat.id);
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          disabled={isPending}
                          onClick={() => handleBatchCategoryToggle(cat.id)}
                          className={cn(
                            "rounded-md border px-2 py-1 text-xs font-medium transition-all",
                            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                            isActive
                              ? "border-orange-500/40 bg-orange-500/20 text-orange-400"
                              : isMixed
                                ? "border-dashed border-orange-500/40 bg-orange-500/20 text-orange-400 opacity-40"
                                : "border-transparent bg-muted/60 text-muted-foreground hover:bg-muted/90 hover:text-foreground",
                          )}
                          aria-pressed={isActive}
                          title={isMixed ? "Present on some items — click to add to all" : undefined}
                        >
                          {cat.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Batch Entity Linking */}
      <BatchEntityLinkSection
        items={items}
        personId={personId}
        sessionId={sessionId}
        categories={categories}
        bodyMarks={bodyMarks}
        bodyModifications={bodyModifications}
        cosmeticProcedures={cosmeticProcedures}
        expandedSections={expandedSections}
        toggleSection={toggleSection}
        isPending={isPending}
        startTransition={startTransition}
        onBatchComplete={onBatchComplete}
      />

      {/* Batch Body Regions */}
      <BatchBodyRegionSection
        items={items}
        personId={personId}
        sessionId={sessionId}
        expandedSections={expandedSections}
        toggleSection={toggleSection}
        startTransition={startTransition}
        onBatchComplete={onBatchComplete}
      />

      {/* Common Tags */}
      <SectionHeader
        title="Common Tags"
        icon={<Tag size={14} />}
        section="tags"
        expanded={expandedSections.has("tags")}
        onToggle={toggleSection}
      />
      {expandedSections.has("tags") && (
        <div className="flex flex-wrap gap-1 pb-2">
          {getCommonTags(items).length > 0 ? (
            getCommonTags(items).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/15 bg-muted/50 px-2 py-0.5 text-xs"
              >
                {tag}
              </span>
            ))
          ) : (
            <p className="text-xs text-muted-foreground italic">No common tags</p>
          )}
        </div>
      )}

      {/* Delete button */}
      {onRequestDelete && (
        <div className="pt-2">
          <button
            type="button"
            onClick={onRequestDelete}
            disabled={isPending}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/15 px-3 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/25"
          >
            <Trash2 size={14} />
            Delete {items.length} item{items.length !== 1 ? "s" : ""}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Batch Entity Link Section ────────────────────────────────────────────────

type BatchEntityLinkSectionProps = {
  items: MediaItemWithLinks[];
  personId: string;
  sessionId: string;
  categories: CategoryWithGroup[];
  bodyMarks: EntityOption[];
  bodyModifications: EntityOption[];
  cosmeticProcedures: EntityOption[];
  expandedSections: Set<string>;
  toggleSection: (section: string) => void;
  isPending: boolean;
  startTransition: (callback: () => Promise<void> | void) => void;
  onBatchComplete?: () => void;
};

function BatchEntityLinkSection({
  items,
  personId,
  sessionId,
  categories,
  bodyMarks,
  bodyModifications,
  cosmeticProcedures,
  expandedSections,
  toggleSection,
  isPending,
  startTransition,
  onBatchComplete,
}: BatchEntityLinkSectionProps) {
  const entityCategories = useMemo(
    () => categories.filter((c) => c.entityModel),
    [categories],
  );

  const handleBatchEntityLink = useCallback(
    (
      categoryId: string,
      entityField: "bodyMarkId" | "bodyModificationId" | "cosmeticProcedureId",
      entityId: string,
    ) => {
      if (!entityId) return;
      const ids = items.map((item) => item.id);
      startTransition(async () => {
        await batchEntityLinkAction(personId, ids, categoryId, entityField, entityId, sessionId);
        onBatchComplete?.();
      });
    },
    [items, personId, sessionId, startTransition, onBatchComplete],
  );

  if (entityCategories.length === 0) return null;

  return (
    <>
      <SectionHeader
        title="Entity Link"
        icon={<Link2 size={14} />}
        section="entityLink"
        expanded={expandedSections.has("entityLink")}
        onToggle={toggleSection}
      />
      {expandedSections.has("entityLink") && (
        <div className="space-y-2 pb-2">
          <p className="text-[10px] text-muted-foreground">
            Assign an entity to all {items.length} selected items
          </p>
          {entityCategories.map((cat) => {
            const entityField =
              cat.entityModel === "BodyMark" ? "bodyMarkId" as const
                : cat.entityModel === "BodyModification" ? "bodyModificationId" as const
                : "cosmeticProcedureId" as const;
            const options =
              cat.entityModel === "BodyMark" ? bodyMarks
                : cat.entityModel === "BodyModification" ? bodyModifications
                : cosmeticProcedures;
            if (options.length === 0) return null;
            return (
              <div key={cat.id}>
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  {cat.name}
                </span>
                <EntityCombobox
                  entities={options.map((o) => ({ id: o.id, label: o.name }))}
                  value=""
                  onChange={(id) => {
                    if (id) handleBatchEntityLink(cat.id, entityField, id);
                  }}
                  placeholder={`Link to ${cat.name.toLowerCase()}...`}
                  disabled={isPending}
                  className="text-xs"
                />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ─── Batch Body Region Section ────────────────────────────────────────────────

type BatchBodyRegionSectionProps = {
  items: MediaItemWithLinks[];
  personId: string;
  sessionId: string;
  expandedSections: Set<string>;
  toggleSection: (section: string) => void;
  startTransition: (callback: () => Promise<void> | void) => void;
  onBatchComplete?: () => void;
};

function BatchBodyRegionSection({
  items,
  personId,
  sessionId,
  expandedSections,
  toggleSection,
  startTransition,
  onBatchComplete,
}: BatchBodyRegionSectionProps) {
  // Compute common body regions across all selected items' links
  const commonBodyRegions = useMemo(() => {
    const allRegionSets = items.map((item) => {
      const regions = new Set<string>();
      for (const link of item.links) {
        if (link.bodyRegions) {
          for (const r of link.bodyRegions) regions.add(r);
        }
      }
      return regions;
    });
    if (allRegionSets.length === 0) return [] as string[];
    const first = allRegionSets[0];
    return [...first].filter((r) => allRegionSets.every((s) => s.has(r)));
  }, [items]);

  const handleBatchBodyRegions = useCallback(
    (regions: string[]) => {
      const ids = items.map((item) => item.id);
      startTransition(async () => {
        await batchSetBodyRegionsAction(personId, ids, regions, sessionId);
        onBatchComplete?.();
      });
    },
    [items, personId, sessionId, startTransition, onBatchComplete],
  );

  return (
    <>
      <SectionHeader
        title="Body Regions"
        icon={<Crosshair size={14} />}
        section="bodyRegions"
        expanded={expandedSections.has("bodyRegions")}
        onToggle={toggleSection}
      />
      {expandedSections.has("bodyRegions") && (
        <div className="pb-2">
          <BodyRegionCompact
            value={commonBodyRegions}
            onChange={handleBatchBodyRegions}
          />
        </div>
      )}
    </>
  );
}

function getCommonTags(items: MediaItemWithLinks[]): string[] {
  if (items.length === 0) return [];
  return items[0].tags.filter((tag) =>
    items.every((item) => item.tags.includes(tag)),
  );
}

// ─── Focal Point Editor ──────────────────────────────────────────────────────

type FocalPointEditorProps = {
  item: MediaItemWithLinks;
  sessionId: string;
  isPending: boolean;
  startTransition: (callback: () => Promise<void> | void) => void;
  onItemsChange?: (updatedItems: MediaItemWithLinks[]) => void;
  items: MediaItemWithLinks[];
};

function FocalPointEditor({
  item,
  sessionId,
  isPending,
  startTransition,
  onItemsChange,
  items,
}: FocalPointEditorProps) {
  const hasFocal = item.focalX != null && item.focalY != null;
  const sourceLabel = hasFocal ? "Manual" : "Not set";

  const thumbnailUrl = item.urls.gallery_512 ?? item.urls.original;

  function handleImageClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    startTransition(async () => {
      await setFocalPointAction(item.id, x, y, sessionId);
      if (onItemsChange) {
        const updated = items.map((it) =>
          it.id === item.id
            ? { ...it, focalX: x, focalY: y, focalSource: "manual", focalStatus: "done" }
            : it,
        );
        onItemsChange(updated);
      }
    });
  }

  function handleReset() {
    startTransition(async () => {
      await resetFocalPointAction(item.id, sessionId);
      if (onItemsChange) {
        const updated = items.map((it) =>
          it.id === item.id
            ? { ...it, focalX: null, focalY: null, focalSource: null, focalStatus: null }
            : it,
        );
        onItemsChange(updated);
      }
    });
  }

  return (
    <div className="space-y-2 pb-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {sourceLabel}
          {hasFocal && (
            <span className="ml-1 text-muted-foreground/60">
              ({(item.focalX! * 100).toFixed(0)}%, {(item.focalY! * 100).toFixed(0)}%)
            </span>
          )}
        </span>
        {hasFocal && (
          <button
            type="button"
            onClick={handleReset}
            disabled={isPending}
            className="flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw size={10} />
            Clear
          </button>
        )}
      </div>

      {/* Click-to-set preview */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleImageClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            // Center click on keyboard
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
        {/* Crosshair overlay */}
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
