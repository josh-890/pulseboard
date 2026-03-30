"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronUp,
  Crosshair,
  FileText,
  Folder,
  Heart,
  ImageIcon,
  Info,
  Link2,
  MapPin,
  RotateCcw,
  Search,
  Tag,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { GalleryItem, PersonMediaUsage, PersonMediaLinkSummary } from "@/lib/types";
import type { ProfileImageLabel } from "@/lib/services/setting-service";
import type { CollectionSummary } from "@/lib/services/collection-service";
import {
  setFocalPointAction,
  resetFocalPointAction,
  upsertPersonMediaLinkAction,
  removePersonMediaLinkAction,
  updatePersonMediaLinkAction,
  assignHeadshotSlot,
  removeHeadshotSlot,
  linkMediaToDetailCategoryAction,
} from "@/lib/actions/media-actions";
import {
  addToCollectionAction,
  removeFromCollectionAction,
} from "@/lib/actions/collection-actions";
import {
  assignCategoryAction,
  removeCategoryAction,
} from "@/lib/actions/category-actions";
import { MediaUsageBadge } from "@/components/media/media-badge";
import { EntityCombobox } from "@/components/shared/entity-combobox";
import { BodyRegionCompact } from "@/components/shared/body-region-picker";
import { SKILL_EVENT_STYLES } from "@/lib/constants/skill";
import { TagPicker } from "@/components/shared/tag-picker";
import { TagChips } from "@/components/shared/tag-chips";
import type { TagChipData } from "@/components/shared/tag-chips";
import { addTagsToEntityAction, removeTagsFromEntityAction } from "@/lib/actions/tag-actions";
import type { TagDefinitionWithGroup } from "@/lib/services/tag-service";

const CONTENT_TAGS = [
  { value: "portrait", label: "Portrait" },
  { value: "diploma", label: "Diploma" },
  { value: "tattoo", label: "Tattoo" },
  { value: "document", label: "Document" },
  { value: "general", label: "General" },
  { value: "outtake", label: "Outtake" },
] as const;

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

export type CategoryWithGroup = {
  id: string;
  name: string;
  slug: string;
  groupId: string;
  groupName: string;
  entityModel: string | null;
};

export type CollectionContext = {
  collections: { id: string; name: string }[];
  onCollectionIdsChange?: (itemId: string, collectionIds: string[]) => void;
};

export type PersonaOption = { id: string; label: string; date: string | null };

export type SkillEventOption = {
  id: string;
  skillName: string;
  eventType: string;
  date: string | null;
};

export type ReferenceContext = {
  personId: string;
  sessionId: string;
  collections: CollectionSummary[];
  bodyMarks: EntityOption[];
  bodyModifications: EntityOption[];
  cosmeticProcedures: EntityOption[];
  categories: CategoryWithGroup[];
  personas: PersonaOption[];
  skillEvents: SkillEventOption[];
  allSlotThumbnails?: Map<number, string>;
  onLinksChange?: (itemId: string, links: PersonMediaLinkSummary[]) => void;
  onCollectionIdsChange?: (itemId: string, collectionIds: string[]) => void;
  onSkillEventIdsChange?: (itemId: string, skillEventIds: string[]) => void;
};

export type ProductionContributor = {
  personId: string;
  personName: string;
  bodyMarks: EntityOption[];
  bodyModifications: EntityOption[];
  cosmeticProcedures: EntityOption[];
};

export type ProductionContext = {
  sessionId: string;
  contributors: ProductionContributor[];
  categories: CategoryWithGroup[];
};

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
  // Reference context (optional — renders extra sections when present)
  referenceContext?: ReferenceContext;
  // Production context (optional — renders entity linking for production sessions)
  productionContext?: ProductionContext;
  // Standalone collection context (optional — renders collections section without full reference context)
  collectionContext?: CollectionContext;
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
  referenceContext,
  productionContext,
  collectionContext,
}: GalleryInfoPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["cover", "headshot", "favorite", "usage", "tags", "structuredTags", "focal", "info"]),
  );
  const [isPending, startTransition] = useTransition();
  const [isFocalPending, startFocalTransition] = useTransition();
  // Production entity linking state
  const [prodLinkPersonId, setProdLinkPersonId] = useState<string>("");
  const [prodLinkCategoryId, setProdLinkCategoryId] = useState<string>("");
  const [prodLinkEntityId, setProdLinkEntityId] = useState<string>("");

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

  // Reference context helpers
  const links = useMemo(() => item.links ?? [], [item.links]);
  const activeUsages = useMemo(
    () => new Set(links.map((l) => l.usage)),
    [links],
  );
  const collectionIds = useMemo(() => item.collectionIds ?? [], [item.collectionIds]);

  const getLinkForUsage = useCallback(
    (usage: PersonMediaUsage) => links.find((l) => l.usage === usage) ?? null,
    [links],
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

  // ── Reference context handlers ──

  const handleUsageToggle = useCallback(
    (usage: PersonMediaUsage) => {
      if (!referenceContext) return;
      const { personId, sessionId: refSessionId, onLinksChange } = referenceContext;
      const isActive = activeUsages.has(usage);

      // Optimistic update
      if (onLinksChange) {
        if (isActive) {
          onLinksChange(item.id, links.filter((l) => l.usage !== usage));
        } else {
          const newLink: PersonMediaLinkSummary = {
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
          onLinksChange(item.id, [...links, newLink]);
        }
      }

      startTransition(async () => {
        if (isActive) {
          await removePersonMediaLinkAction(personId, item.id, usage, refSessionId);
        } else {
          await upsertPersonMediaLinkAction(personId, item.id, usage, {}, refSessionId);
        }
      });
    },
    [referenceContext, activeUsages, links, item.id],
  );

  const handleEntityLink = useCallback(
    (
      usage: PersonMediaUsage,
      field: "bodyMarkId" | "bodyModificationId" | "cosmeticProcedureId",
      value: string | null,
    ) => {
      if (!referenceContext) return;
      const link = getLinkForUsage(usage);
      if (!link) return;

      // Optimistic
      referenceContext.onLinksChange?.(
        item.id,
        links.map((l) => (l.usage === usage ? { ...l, [field]: value } : l)),
      );

      startTransition(async () => {
        await updatePersonMediaLinkAction(
          link.id,
          { [field]: value },
          referenceContext.personId,
          referenceContext.sessionId,
        );
      });
    },
    [referenceContext, getLinkForUsage, links, item.id],
  );

  // Body region update — updates bodyRegions on the first link (or PROFILE link)
  const handleBodyRegionsChange = useCallback(
    (regions: string[]) => {
      if (!referenceContext) return;
      const link = links[0];
      if (!link) return;

      // Optimistic
      referenceContext.onLinksChange?.(
        item.id,
        links.map((l, i) => (i === 0 ? { ...l, bodyRegions: regions } : l)),
      );

      startTransition(async () => {
        await updatePersonMediaLinkAction(
          link.id,
          { bodyRegions: regions },
          referenceContext.personId,
          referenceContext.sessionId,
        );
      });
    },
    [referenceContext, links, item.id],
  );

  // Persona tagging — updates personaId on the first link
  const handlePersonaChange = useCallback(
    (personaId: string) => {
      if (!referenceContext) return;
      const link = links[0];
      if (!link) return;

      const value = personaId || null;

      // Optimistic
      referenceContext.onLinksChange?.(
        item.id,
        links.map((l, i) => (i === 0 ? { ...l, personaId: value } : l)),
      );

      startTransition(async () => {
        await updatePersonMediaLinkAction(
          link.id,
          { personaId: value },
          referenceContext.personId,
          referenceContext.sessionId,
        );
      });
    },
    [referenceContext, links, item.id],
  );

  // Skill event linking
  const skillEventIds = useMemo(() => item.skillEventIds ?? [], [item.skillEventIds]);

  const handleSkillEventToggle = useCallback(
    (eventId: string) => {
      if (!referenceContext) return;
      const isLinked = skillEventIds.includes(eventId);
      const newIds = isLinked
        ? skillEventIds.filter((id) => id !== eventId)
        : [...skillEventIds, eventId];

      // Optimistic
      referenceContext.onSkillEventIdsChange?.(item.id, newIds);

      startTransition(async () => {
        if (isLinked) {
          await fetch(`/api/skill-events/${eventId}/media`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mediaItemId: item.id }),
          });
        } else {
          await fetch(`/api/skill-events/${eventId}/media`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mediaItemId: item.id }),
          });
        }
      });
    },
    [referenceContext, skillEventIds, item.id],
  );

  const handleRefSlotClick = useCallback(
    (slotNumber: number) => {
      if (!referenceContext) return;
      const { personId, onLinksChange } = referenceContext;
      const headshotLink = getLinkForUsage("HEADSHOT");
      const isToggleOff = headshotLink?.slot === slotNumber;

      // Optimistic
      if (onLinksChange) {
        if (isToggleOff) {
          onLinksChange(item.id, links.filter((l) => l.usage !== "HEADSHOT"));
        } else if (headshotLink) {
          onLinksChange(
            item.id,
            links.map((l) => (l.usage === "HEADSHOT" ? { ...l, slot: slotNumber } : l)),
          );
        } else {
          const newLink: PersonMediaLinkSummary = {
            id: "temp-HEADSHOT",
            usage: "HEADSHOT",
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
          };
          onLinksChange(item.id, [...links, newLink]);
        }
      }

      startTransition(async () => {
        if (isToggleOff) {
          await removeHeadshotSlot(personId, item.id);
        } else {
          await assignHeadshotSlot(personId, item.id, slotNumber);
        }
      });
    },
    [referenceContext, getLinkForUsage, links, item.id],
  );

  // Merge collections from referenceContext and standalone collectionContext
  const mergedCollections = useMemo(() => {
    const refColls = referenceContext?.collections ?? [];
    const standaloneColls = collectionContext?.collections ?? [];
    if (refColls.length > 0 && standaloneColls.length > 0) {
      // Dedupe by id, prefer referenceContext entries
      const seen = new Set(refColls.map((c) => c.id));
      return [...refColls, ...standaloneColls.filter((c) => !seen.has(c.id))];
    }
    return refColls.length > 0 ? refColls : standaloneColls;
  }, [referenceContext?.collections, collectionContext?.collections]);

  const handleCollectionToggle = useCallback(
    (collectionId: string, isCurrentlyIn: boolean) => {
      // Use referenceContext callback if available, else collectionContext
      const onCollChange = referenceContext?.onCollectionIdsChange ?? collectionContext?.onCollectionIdsChange;

      // Optimistic
      if (onCollChange) {
        const newIds = isCurrentlyIn
          ? collectionIds.filter((id) => id !== collectionId)
          : [...collectionIds, collectionId];
        onCollChange(item.id, newIds);
      }

      startTransition(async () => {
        if (isCurrentlyIn) {
          await removeFromCollectionAction(collectionId, [item.id]);
        } else {
          await addToCollectionAction(collectionId, [item.id]);
        }
      });
    },
    [referenceContext?.onCollectionIdsChange, collectionContext?.onCollectionIdsChange, collectionIds, item.id],
  );

  const handleNotesChange = useCallback(
    (linkId: string, notes: string) => {
      if (!referenceContext) return;
      startTransition(async () => {
        await updatePersonMediaLinkAction(
          linkId,
          { notes: notes || null },
          referenceContext.personId,
          referenceContext.sessionId,
        );
      });
    },
    [referenceContext],
  );

  // Category toggle
  const activeCategoryIds = useMemo(
    () => new Set(links.filter((l) => l.usage === "DETAIL" && l.categoryId).map((l) => l.categoryId!)),
    [links],
  );

  const handleCategoryToggle = useCallback(
    (categoryId: string) => {
      if (!referenceContext) return;
      const { personId, sessionId: refSessionId, onLinksChange } = referenceContext;
      const isActive = activeCategoryIds.has(categoryId);

      // Optimistic
      if (onLinksChange) {
        if (isActive) {
          onLinksChange(item.id, links.filter((l) => !(l.usage === "DETAIL" && l.categoryId === categoryId)));
        } else {
          const newLink: PersonMediaLinkSummary = {
            id: `temp-cat-${categoryId}`,
            usage: "DETAIL",
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
          onLinksChange(item.id, [...links, newLink]);
        }
      }

      startTransition(async () => {
        if (isActive) {
          await removeCategoryAction(personId, item.id, categoryId, refSessionId);
        } else {
          await assignCategoryAction(personId, item.id, categoryId, refSessionId);
        }
      });
    },
    [referenceContext, activeCategoryIds, links, item.id],
  );

  // Group categories by group for display
  const categoryGroups = useMemo(() => {
    if (!referenceContext) return [];
    const cats = referenceContext.categories;
    if (!cats.length) return [];
    const grouped = new Map<string, { groupName: string; items: CategoryWithGroup[] }>();
    for (const cat of cats) {
      if (!grouped.has(cat.groupId)) {
        grouped.set(cat.groupId, { groupName: cat.groupName, items: [] });
      }
      grouped.get(cat.groupId)!.items.push(cat);
    }
    return Array.from(grouped.values());
  }, [referenceContext]);

  // Entity linking is now driven by active DETAIL categories with entityModel
  const activeEntityCategories = useMemo(() => {
    if (!referenceContext) return [];
    return referenceContext.categories.filter((c) => c.entityModel && activeCategoryIds.has(c.id));
  }, [referenceContext, activeCategoryIds]);
  const hasEntityUsage = activeEntityCategories.length > 0;

  // Production entity linking: derived values from selection
  const prodSelectedContributor = useMemo(
    () => productionContext?.contributors.find((c) => c.personId === prodLinkPersonId),
    [productionContext, prodLinkPersonId],
  );
  const prodEntityCategories = useMemo(
    () => productionContext?.categories.filter((c) => c.entityModel) ?? [],
    [productionContext],
  );
  const prodSelectedCategory = useMemo(
    () => prodEntityCategories.find((c) => c.id === prodLinkCategoryId),
    [prodEntityCategories, prodLinkCategoryId],
  );
  const prodEntityOptions = useMemo(() => {
    if (!prodSelectedContributor || !prodSelectedCategory?.entityModel) return [];
    const model = prodSelectedCategory.entityModel;
    if (model === "BodyMark") return prodSelectedContributor.bodyMarks;
    if (model === "BodyModification") return prodSelectedContributor.bodyModifications;
    if (model === "CosmeticProcedure") return prodSelectedContributor.cosmeticProcedures;
    return [];
  }, [prodSelectedContributor, prodSelectedCategory]);

  const handleProdEntityLink = useCallback(() => {
    if (!productionContext || !prodLinkPersonId || !prodLinkCategoryId || !prodLinkEntityId || !prodSelectedCategory?.entityModel) return;
    const fieldMap: Record<string, "bodyMarkId" | "bodyModificationId" | "cosmeticProcedureId"> = {
      BodyMark: "bodyMarkId",
      BodyModification: "bodyModificationId",
      CosmeticProcedure: "cosmeticProcedureId",
    };
    const entityField = fieldMap[prodSelectedCategory.entityModel];
    startTransition(async () => {
      await linkMediaToDetailCategoryAction(
        prodLinkPersonId,
        [item.id],
        prodLinkCategoryId,
        entityField,
        prodLinkEntityId,
      );
      // Reset selection after linking
      setProdLinkEntityId("");
    });
  }, [productionContext, prodLinkPersonId, prodLinkCategoryId, prodLinkEntityId, prodSelectedCategory, item.id]);

  return (
    <div className="space-y-1 p-3 text-sm" onClick={(e) => e.stopPropagation()}>
      {/* Cover toggle (set context) */}
      {onSetCover && (
        <>
          <SectionHeader
            title="Cover"
            icon={<CoverIcon />}
            section="cover"
            expanded={expandedSections.has("cover")}
            onToggle={toggleSection}
          />
          {expandedSections.has("cover") && (
            <div className="flex flex-wrap gap-1.5 pb-2">
              <button
                type="button"
                onClick={() => onSetCover(isCover ? null : item.id)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  isCover
                    ? "ring-2 ring-amber-500 bg-amber-500/20 text-amber-400"
                    : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white",
                )}
                aria-pressed={isCover}
              >
                {isCover ? "Cover image" : "Set as cover"}
              </button>
            </div>
          )}
        </>
      )}

      {/* Headshot slot assignment (person context — non-reference) */}
      {!referenceContext && profileLabels && profileLabels.length > 0 && onAssignHeadshot && (
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
                        ? "ring-2 ring-amber-500 bg-amber-500/20 text-amber-400"
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

      {/* Headshot slot assignment (reference context — with thumbnails) */}
      {referenceContext && profileLabels && profileLabels.length > 0 && (
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
                const headshotLink = getLinkForUsage("HEADSHOT");
                const isActive = headshotLink?.slot === slotNumber;
                const thumbUrl = referenceContext.allSlotThumbnails?.get(slotNumber);
                return (
                  <button
                    key={sl.slot}
                    type="button"
                    disabled={isPending}
                    onClick={() => handleRefSlotClick(slotNumber)}
                    className={cn(
                      "relative overflow-hidden rounded-md text-xs font-medium transition-all",
                      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      thumbUrl ? "h-10 w-14" : "px-2.5 py-1",
                      isActive
                        ? "ring-2 ring-amber-500 shadow-sm"
                        : thumbUrl
                          ? "opacity-70 hover:opacity-100"
                          : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white",
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

      {/* ── Reference-only sections ── */}

      {/* Usage toggles (reference context only) */}
      {referenceContext && (
        <>
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
                        : "border-transparent bg-white/5 text-white/60 hover:bg-white/10 hover:text-white",
                    )}
                    aria-pressed={isActive}
                  >
                    {USAGE_LABELS[usage]}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Categories (reference context only) */}
      {referenceContext && categoryGroups.length > 0 && (
        <>
          <SectionHeader
            title="Categories"
            icon={<Tag size={14} />}
            section="categories-ref"
            expanded={expandedSections.has("categories-ref")}
            onToggle={toggleSection}
          />
          {expandedSections.has("categories-ref") && (
            <div className="space-y-2 pb-2">
              {categoryGroups.map((group) => (
                <div key={group.groupName}>
                  <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-white/40">
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
                              : "border-transparent bg-white/5 text-white/60 hover:bg-white/10 hover:text-white",
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

      {/* Entity Linking (reference context only, when entity usages active) */}
      {referenceContext && hasEntityUsage && (
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
                  cat.entityModel === "BodyMark" ? referenceContext.bodyMarks
                    : cat.entityModel === "BodyModification" ? referenceContext.bodyModifications
                    : referenceContext.cosmeticProcedures;
                const detailLink = links.find(
                  (l) => l.usage === "DETAIL" && l.categoryId === cat.id,
                );
                if (options.length === 0) return null;
                return (
                  <div key={cat.id}>
                    <label className="mb-1 block text-xs font-medium text-white/50">
                      {cat.name}
                    </label>
                    <EntityCombobox
                      entities={options.map((o) => ({ id: o.id, label: o.name }))}
                      value={detailLink?.[entityField] ?? ""}
                      onChange={(v) => {
                        if (!detailLink) return;
                        handleEntityLink("DETAIL", entityField, v || null);
                      }}
                      disabled={isPending}
                      placeholder="None"
                      emptyLabel="None"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Production Entity Linking (production context, person picker → category → entity) */}
      {productionContext && prodEntityCategories.length > 0 && productionContext.contributors.length > 0 && (
        <>
          <SectionHeader
            title="Link to Entity"
            icon={<Link2 size={14} />}
            section="prod-linking"
            expanded={expandedSections.has("prod-linking")}
            onToggle={toggleSection}
          />
          {expandedSections.has("prod-linking") && (
            <div className="space-y-2 pb-2">
              {/* Person picker */}
              <div>
                <label className="mb-1 block text-xs font-medium text-white/50">Person</label>
                <select
                  value={prodLinkPersonId}
                  onChange={(e) => {
                    setProdLinkPersonId(e.target.value);
                    setProdLinkCategoryId("");
                    setProdLinkEntityId("");
                  }}
                  className="w-full rounded-md border border-white/15 bg-black/30 px-2 py-1.5 text-xs text-foreground"
                >
                  <option value="">Select person…</option>
                  {productionContext.contributors.map((c) => (
                    <option key={c.personId} value={c.personId}>{c.personName}</option>
                  ))}
                </select>
              </div>
              {/* Category picker */}
              {prodLinkPersonId && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-white/50">Category</label>
                  <select
                    value={prodLinkCategoryId}
                    onChange={(e) => {
                      setProdLinkCategoryId(e.target.value);
                      setProdLinkEntityId("");
                    }}
                    className="w-full rounded-md border border-white/15 bg-black/30 px-2 py-1.5 text-xs text-foreground"
                  >
                    <option value="">Select category…</option>
                    {prodEntityCategories.map((c) => (
                      <option key={c.id} value={c.id}>{c.groupName} — {c.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {/* Entity picker */}
              {prodLinkCategoryId && prodEntityOptions.length > 0 && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-white/50">
                    {prodSelectedCategory?.name ?? "Entity"}
                  </label>
                  <EntityCombobox
                    entities={prodEntityOptions.map((o) => ({ id: o.id, label: o.name }))}
                    value={prodLinkEntityId}
                    onChange={(v) => setProdLinkEntityId(v)}
                    placeholder="Select entity…"
                    emptyLabel="No entities"
                    disabled={isPending}
                  />
                </div>
              )}
              {prodLinkCategoryId && prodEntityOptions.length === 0 && (
                <p className="text-[11px] text-muted-foreground/60 italic">
                  No {prodSelectedCategory?.name?.toLowerCase() ?? "entities"} for this person.
                </p>
              )}
              {/* Confirm button */}
              {prodLinkEntityId && (
                <button
                  type="button"
                  onClick={handleProdEntityLink}
                  disabled={isPending}
                  className="w-full rounded-md bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/30 disabled:opacity-50"
                >
                  Link to Entity
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* Body Regions (reference context only, when links exist) */}
      {referenceContext && links.length > 0 && (
        <>
          <SectionHeader
            title="Body Regions"
            icon={<MapPin size={14} />}
            section="body-regions"
            expanded={expandedSections.has("body-regions")}
            onToggle={toggleSection}
          />
          {expandedSections.has("body-regions") && (
            <div className="pb-2">
              <BodyRegionCompact
                value={links[0].bodyRegions ?? []}
                onChange={handleBodyRegionsChange}
                mode="multi"
              />
            </div>
          )}
        </>
      )}

      {/* Persona (reference context only, when links exist) */}
      {referenceContext && links.length > 0 && referenceContext.personas.length > 0 && (
        <>
          <SectionHeader
            title="Persona"
            icon={<User size={14} />}
            section="persona"
            expanded={expandedSections.has("persona")}
            onToggle={toggleSection}
          />
          {expandedSections.has("persona") && (
            <div className="pb-2">
              <EntityCombobox
                entities={referenceContext.personas.map((p) => ({
                  id: p.id,
                  label: p.label,
                  description: p.date ?? undefined,
                }))}
                value={links[0].personaId ?? ""}
                onChange={handlePersonaChange}
                placeholder="No persona"
                emptyLabel="No persona"
                disabled={isPending}
              />
            </div>
          )}
        </>
      )}

      {/* Skill Events (reference context only, when skill events exist) */}
      {referenceContext && referenceContext.skillEvents.length > 0 && (
        <>
          <SectionHeader
            title="Skill Events"
            icon={<Tag size={14} />}
            section="skill-events"
            expanded={expandedSections.has("skill-events")}
            onToggle={toggleSection}
          />
          {expandedSections.has("skill-events") && (
            <div className="flex flex-wrap gap-1 pb-2">
              {referenceContext.skillEvents.map((evt) => {
                const isLinked = skillEventIds.includes(evt.id);
                const styles = SKILL_EVENT_STYLES[evt.eventType as keyof typeof SKILL_EVENT_STYLES];
                return (
                  <button
                    key={evt.id}
                    type="button"
                    disabled={isPending}
                    onClick={() => handleSkillEventToggle(evt.id)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs font-medium transition-all",
                      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      isLinked && styles
                        ? `${styles} border-current/30`
                        : "border-transparent bg-white/5 text-white/60 hover:bg-white/10 hover:text-white",
                    )}
                    aria-pressed={isLinked}
                  >
                    {evt.skillName} ({evt.eventType})
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Collections (reference context or standalone collection context) */}
      {mergedCollections.length > 0 && (
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
              {mergedCollections.map((coll) => {
                const isIn = collectionIds.includes(coll.id);
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
                        ? "border border-amber-500/30 bg-amber-500/15 text-amber-400"
                        : "border border-white/15 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white",
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

      {/* Notes (reference context only, when links exist) */}
      {referenceContext && links.length > 0 && (
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
              {links.length === 1 ? (
                <NotesField
                  value={links[0].notes ?? ""}
                  onChange={(notes) => handleNotesChange(links[0].id, notes)}
                  disabled={isPending}
                />
              ) : (
                links.map((link) => (
                  <div key={link.id}>
                    <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-white/40">
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
                            ? "bg-amber-500/20 text-amber-400"
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

      {/* Structured Entity Tags */}
      <SectionHeader
        title="Structured Tags"
        icon={<Tag size={14} />}
        section="structuredTags"
        expanded={expandedSections.has("structuredTags")}
        onToggle={toggleSection}
      />
      {expandedSections.has("structuredTags") && (
        <div className="pb-2">
          <MediaEntityTags mediaItemId={item.id} />
        </div>
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
      {(sessionId || referenceContext?.sessionId) && (
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
              sessionId={(sessionId ?? referenceContext?.sessionId)!}
              isPending={isFocalPending}
              startTransition={startFocalTransition}
              personId={referenceContext?.personId}
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
          {links.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <span className="font-medium text-white/80">Usage:</span>
              {links.map((link) => (
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
    </div>
  );
}

// ─── Cover Icon ──────────────────────────────────────────────────────────────

function CoverIcon() {
  return (
    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-white/30 text-[9px] font-bold leading-none">
      C
    </span>
  );
}

// ─── Focal Point Section ─────────────────────────────────────────────────────

type FocalPointSectionProps = {
  item: GalleryItem;
  sessionId: string;
  isPending: boolean;
  startTransition: React.TransitionStartFunction;
  personId?: string;
  onFocalPointChange?: (itemId: string, focalX: number | null, focalY: number | null) => void;
  onFocalOverlayToggle?: () => void;
  focalOverlayActive?: boolean;
};

function FocalPointSection({
  item,
  sessionId,
  isPending,
  startTransition,
  personId,
  onFocalPointChange,
  onFocalOverlayToggle,
  focalOverlayActive,
}: FocalPointSectionProps) {
  const hasFocal = item.focalX != null && item.focalY != null;
  const thumbnailUrl = item.urls.gallery_512 ?? item.urls.original;
  const [isRegenerating, setIsRegenerating] = useState(false);

  function handleImageClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    onFocalPointChange?.(item.id, x, y);

    startTransition(async () => {
      const result = await setFocalPointAction(item.id, x, y, sessionId, personId);
      if (!result.success) {
        onFocalPointChange?.(item.id, item.focalX, item.focalY);
      } else {
        // Fire-and-forget variant regeneration
        setIsRegenerating(true);
        fetch(`/api/media/${item.id}/regenerate-variants`, { method: "POST" })
          .finally(() => setIsRegenerating(false));
      }
    });
  }

  function handleReset() {
    onFocalPointChange?.(item.id, null, null);

    startTransition(async () => {
      const result = await resetFocalPointAction(item.id, sessionId, personId);
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
              <span className="font-medium text-amber-400">Manual</span>
              {" "}
              <span className="text-white/40">
                ({Math.round((item.focalX ?? 0) * 100)}%, {Math.round((item.focalY ?? 0) * 100)}%)
              </span>
              {isRegenerating && (
                <span className="ml-1 text-[10px] text-white/30 animate-pulse">
                  regenerating...
                </span>
              )}
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
                "flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-all",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                focalOverlayActive
                  ? "border-amber-500/40 bg-amber-500/20 text-amber-400"
                  : "border-transparent bg-white/5 text-white/50 hover:bg-white/10 hover:text-white",
              )}
              title="Show focal point crosshair on main image"
              aria-pressed={focalOverlayActive}
            >
              <Crosshair size={12} className={cn(focalOverlayActive && "animate-pulse")} />
              Show
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
            className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-500 shadow-[0_0_4px_rgba(0,0,0,0.5)]"
            style={{
              left: `${item.focalX! * 100}%`,
              top: `${item.focalY! * 100}%`,
            }}
          >
            <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500" />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

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
      className="w-full resize-none rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-xs text-white/80 placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-ring"
    />
  );
}

// ─── Structured Entity Tags for Media Items ──────────────────────────────────

type MediaEntityTagsProps = {
  mediaItemId: string;
};

function MediaEntityTags({ mediaItemId }: MediaEntityTagsProps) {
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [tagChips, setTagChips] = useState<TagChipData[]>([]);
  const [loadedForId, setLoadedForId] = useState<string | null>(null);
  const [isTagPending, startTagTransition] = useTransition();

  const loaded = loadedForId === mediaItemId;

  // Fetch entity tags on mount / when media item changes
  useEffect(() => {
    let cancelled = false;

    fetch(`/api/tags/entity?entityType=MEDIA_ITEM&entityId=${mediaItemId}`)
      .then((res) => res.json())
      .then((tags: TagDefinitionWithGroup[]) => {
        if (cancelled) return;
        setTagIds(tags.map((t) => t.id));
        setTagChips(
          tags.map((t) => ({
            id: t.id,
            name: t.name,
            group: { name: t.group.name, color: t.group.color },
          })),
        );
        setLoadedForId(mediaItemId);
      })
      .catch(() => {
        if (!cancelled) setLoadedForId(mediaItemId);
      });

    return () => { cancelled = true; };
  }, [mediaItemId]);

  const handleChange = useCallback(
    (newIds: string[]) => {
      const added = newIds.filter((id) => !tagIds.includes(id));
      const removed = tagIds.filter((id) => !newIds.includes(id));
      setTagIds(newIds);

      startTagTransition(async () => {
        if (added.length > 0) {
          await addTagsToEntityAction("MEDIA_ITEM", mediaItemId, added);
        }
        if (removed.length > 0) {
          await removeTagsFromEntityAction("MEDIA_ITEM", mediaItemId, removed);
        }
        // Refresh to get accurate chip data
        const res = await fetch(`/api/tags/entity?entityType=MEDIA_ITEM&entityId=${mediaItemId}`);
        const tags: TagDefinitionWithGroup[] = await res.json();
        setTagIds(tags.map((t) => t.id));
        setTagChips(
          tags.map((t) => ({
            id: t.id,
            name: t.name,
            group: { name: t.group.name, color: t.group.color },
          })),
        );
      });
    },
    [mediaItemId, tagIds],
  );

  if (!loaded) {
    return <div className="py-1 text-[10px] text-white/40">Loading tags...</div>;
  }

  return (
    <div className="space-y-2">
      <TagPicker
        scope="MEDIA_ITEM"
        selectedTagIds={tagIds}
        selectedTags={tagChips}
        onChange={handleChange}
        compact
        placeholder="Add structured tags..."
      />
      {tagChips.length > 0 && (
        <TagChips
          tags={tagChips}
          onRemove={(id) => handleChange(tagIds.filter((tid) => tid !== id))}
          compact
        />
      )}
      {isTagPending && (
        <div className="text-[10px] text-white/40">Saving...</div>
      )}
    </div>
  );
}
