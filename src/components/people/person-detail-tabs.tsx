"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { cn, computeAge, formatPartialDate } from "@/lib/utils";
import type { getPersonWithDetails } from "@/lib/services/person-service";
import type {
  PersonCurrentState,
  PersonWorkHistoryItem,
  PersonAffiliation,
  PersonConnection,
  PersonSessionWorkEntry,
  PersonProductionSession,
  AliasType,
  PersonStatus,
  RelationshipSource,
} from "@/lib/types";
import { useHeroLayout, type HeroLayout } from "@/components/layout/hero-layout-provider";
import { FlagImage } from "@/components/shared/flag-image";
import { findCountryByCode } from "@/lib/constants/countries";
import { PersonaTimelineEntry } from "@/components/people/persona-timeline-entry";
import { AppearanceTab } from "@/components/people/appearance-tab";
import { NewPersonaSheet } from "@/components/people/new-persona-sheet";
import { DigitalIdentityRow } from "@/components/people/digital-identity-row";
import {
  Star,
  StarOff,
  BookUser,
  Users,
  Film,
  Network,
  MapPin,
  Tag,
  Building2,
  Cpu,
  Activity,
  ChevronDown,
  ChevronUp,
  Briefcase,
  Image as ImageIcon,
  Link2,
  Plus,
  LayoutDashboard,
  Sparkles,
  FileImage,
  Zap,
  Pencil,
  Info,
} from "lucide-react";
import NextImage from "next/image";
import Link from "next/link";
import { CarouselHeader } from "@/components/gallery/carousel-header";
import { JustifiedGrid } from "@/components/gallery/justified-grid";
import { GalleryLightbox } from "@/components/gallery/gallery-lightbox";
import { BatchUploadZone } from "@/components/media/batch-upload-zone";
import { PersonDetailsTab } from "@/components/people/person-details-tab";
import { SectionCard, EmptyState, InfoRow } from "@/components/people/person-detail-helpers";
import { PersonSkillsTab } from "@/components/people/person-skills-tab";
import { PersonAliasesTab } from "@/components/people/person-aliases-tab";
import { CareerSessionList } from "@/components/people/career-session-list";
import { ProductionPhotoList } from "@/components/people/production-photo-list";
import type { SkillGroupWithDefinitions } from "@/lib/services/skill-catalog-service";
import type { PersonAliasWithChannels } from "@/lib/services/alias-service";
import type { GalleryItem } from "@/lib/types";
import type { EntityMediaThumbnail } from "@/lib/services/media-service";
import type { ProfileImageLabel } from "@/lib/services/setting-service";
import type { CategoryWithGroup } from "@/components/gallery/gallery-info-panel";
import type { PhysicalAttributeGroupWithDefinitions } from "@/lib/services/physical-attribute-catalog-service";
import {
  assignHeadshotSlot as assignHeadshotSlotAction,
  removeHeadshotSlot as removeHeadshotSlotAction,
} from "@/lib/actions/media-actions";
import { updatePersonBio } from "@/lib/actions/person-actions";
import ReactMarkdown from "react-markdown";

type PersonData = NonNullable<Awaited<ReturnType<typeof getPersonWithDetails>>>;

type TabId = "overview" | "aliases" | "appearance" | "details" | "skills" | "career" | "network" | "photos";

type HeadshotSlotEntry = { mediaItemId: string; slot: number };

type PersonDetailTabsProps = {
  person: PersonData;
  currentState: PersonCurrentState;
  workHistory: PersonWorkHistoryItem[];
  affiliations: PersonAffiliation[];
  connections: PersonConnection[];
  photos: GalleryItem[];
  profileLabels: ProfileImageLabel[];
  referenceSessionId?: string;
  filledHeadshotSlots?: number[];
  headshotSlotEntries?: HeadshotSlotEntry[];
  categories?: CategoryWithGroup[];
  categoryCounts?: { categoryId: string; count: number }[];
  skillGroups?: SkillGroupWithDefinitions[];
  physicalAttributeGroups?: PhysicalAttributeGroupWithDefinitions[];
  calculatedPgrade?: number | null;
  meanWcp?: number | null;
  aliasesWithChannels?: PersonAliasWithChannels[];
  sessionWorkHistory?: PersonSessionWorkEntry[];
  productionSessions?: PersonProductionSession[];
  entityMedia?: Record<string, EntityMediaThumbnail[]>;
};

// ── Style maps ──────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<PersonStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  wishlist: "Wishlist",
  archived: "Archived",
};

const STATUS_DOT_COLORS: Record<PersonStatus, string> = {
  active: "bg-emerald-500",
  inactive: "bg-slate-400",
  wishlist: "bg-amber-500",
  archived: "bg-red-500",
};

const ALIAS_TYPE_STYLES: Record<AliasType, string> = {
  common: "border-primary/30 bg-primary/10 text-primary",
  birth: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  alias: "border-white/15 bg-muted/50 text-foreground",
};


const SOURCE_STYLES: Record<RelationshipSource, string> = {
  derived: "bg-slate-500/15 text-slate-500 border-slate-500/30",
  manual: "bg-primary/15 text-primary border-primary/30",
};

// ── Sub-components ──────────────────────────────────────────────────────────

function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`Rating: ${rating} out of ${max}`}>
      {Array.from({ length: max }, (_, i) => {
        const filled = i < rating;
        return filled ? (
          <Star key={i} size={16} className="fill-amber-400 text-amber-400" aria-hidden="true" />
        ) : (
          <StarOff key={i} size={16} className="text-muted-foreground/30" aria-hidden="true" />
        );
      })}
    </div>
  );
}

// ── PGRADE Colors ────────────────────────────────────────────────────────────

const PGRADE_COLORS = [
  "rgb(162,214,176)",
  "rgb(177,214,160)",
  "rgb(196,214,140)",
  "rgb(213,200,125)",
  "rgb(230,176,110)",
  "rgb(224,155,110)",
  "rgb(219,133,110)",
  "rgb(214,110,110)",
  "rgb(171,103,143)",
  "rgb(128,96,176)",
];

// ── CP (Calculated PGRADE) Colors ────────────────────────────────────────────

const CP_COLORS = [
  "rgb(150,200,230)",
  "rgb(130,185,220)",
  "rgb(110,170,210)",
  "rgb(90,155,200)",
  "rgb(70,140,190)",
  "rgb(60,125,180)",
  "rgb(50,110,175)",
  "rgb(40,95,170)",
  "rgb(35,80,160)",
  "rgb(30,65,150)",
];

// ── Basic Info Panel ─────────────────────────────────────────────────────────

// ── Physical Stats Panel ─────────────────────────────────────────────────────

function PhysicalStatsPanel({
  person,
  currentState,
  labelWidth = "w-32",
  fieldGap = "gap-2",
}: {
  person: PersonData;
  currentState: PersonCurrentState;
  labelWidth?: string;
  fieldGap?: string;
}) {
  const hasStatic = person.height || person.eyeColor || person.bodyType || person.measurements;
  const hasComputed = currentState.currentHairColor || currentState.weight !== null || currentState.build;

  if (!hasStatic && !hasComputed) {
    return <EmptyState message="No physical stats recorded." />;
  }

  return (
    <dl className={cn("grid grid-cols-1 text-sm", fieldGap)}>
      {/* Static (from Person) */}
      {person.height && <InfoRow label="Height" value={`${person.height} cm`} labelWidth={labelWidth} />}
      {person.eyeColor && <InfoRow label="Eye color" value={<span className="capitalize">{person.eyeColor}</span>} labelWidth={labelWidth} />}
      {person.bodyType && <InfoRow label="Body type" value={<span className="capitalize">{person.bodyType}</span>} labelWidth={labelWidth} />}
      {person.measurements && <InfoRow label="Measurements" value={person.measurements} labelWidth={labelWidth} />}

      {/* Divider between static and computed */}
      {hasStatic && hasComputed && (
        <div className="col-span-full border-t border-white/10" />
      )}

      {/* Computed (from PersonaPhysical fold) */}
      {currentState.currentHairColor && <InfoRow label="Current hair" value={<span className="capitalize">{currentState.currentHairColor}</span>} labelWidth={labelWidth} />}
      {currentState.weight !== null && currentState.weight !== undefined && <InfoRow label="Weight" value={`${currentState.weight} kg`} labelWidth={labelWidth} />}
      {currentState.build && <InfoRow label="Build" value={<span className="capitalize">{currentState.build}</span>} labelWidth={labelWidth} />}
    </dl>
  );
}

// ── History Panel ────────────────────────────────────────────────────────────

function HistoryPanel({
  personas,
  personId,
  currentState,
  defaultOpen = false,
}: {
  personas: PersonData["personas"];
  personId: string;
  currentState: PersonCurrentState;
  defaultOpen?: boolean;
}) {
  const [timelineOpen, setTimelineOpen] = useState(defaultOpen);
  const [showNewPersona, setShowNewPersona] = useState(false);
  const visiblePersonas = personas;

  if (visiblePersonas.length === 0 && !showNewPersona) {
    return (
      <div className="space-y-3">
        <EmptyState message="No persona history recorded." />
        <button
          type="button"
          onClick={() => setShowNewPersona(true)}
          className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          <Plus size={12} /> New Persona
        </button>
        {showNewPersona && (
          <NewPersonaSheet
            personId={personId}
            existingMarks={currentState.activeBodyMarks}
            existingMods={currentState.activeBodyModifications}
            existingProcs={currentState.activeCosmeticProcedures}
            onClose={() => setShowNewPersona(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setTimelineOpen(!timelineOpen)}
          className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
        >
          {timelineOpen ? (
            <>
              <ChevronUp size={14} /> Hide timeline
            </>
          ) : (
            <>
              <ChevronDown size={14} /> Show timeline ({visiblePersonas.length})
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => setShowNewPersona(true)}
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus size={12} /> New Persona
        </button>
      </div>
      {timelineOpen && (
        <div className="relative space-y-4">
          <div
            className="absolute left-1.5 top-3 bottom-3 w-px bg-white/10"
            aria-hidden="true"
          />
          {visiblePersonas.map((persona) => (
            <PersonaTimelineEntry key={persona.id} persona={persona} personId={personId} />
          ))}
        </div>
      )}
      {showNewPersona && (
        <NewPersonaSheet
          personId={personId}
          existingMarks={currentState.activeBodyMarks}
          existingMods={currentState.activeBodyModifications}
          existingProcs={currentState.activeCosmeticProcedures}
          onClose={() => setShowNewPersona(false)}
        />
      )}
    </div>
  );
}

// ── KPI Stats Panel ──────────────────────────────────────────────────────────

type KpiCounts = {
  sets: number;
  labels: number;
  photos: number;
  connections: number;
};

function KpiStatsPanel({
  person,
  kpiCounts,
  calculatedPgrade,
  meanWcp,
  compact = false,
}: {
  person: PersonData;
  kpiCounts: KpiCounts;
  calculatedPgrade?: number | null;
  meanWcp?: number | null;
  compact?: boolean;
}) {
  const tiles = [
    { icon: <Film size={14} />, count: kpiCounts.sets, label: "Sets" },
    { icon: <Building2 size={14} />, count: kpiCounts.labels, label: "Labels" },
    { icon: <ImageIcon size={14} />, count: kpiCounts.photos, label: "Photos" },
    { icon: <Link2 size={14} />, count: kpiCounts.connections, label: "Conn." },
  ];

  const hasPgrade = person.pgrade !== null && person.pgrade !== undefined;
  const hasCp = calculatedPgrade !== null && calculatedPgrade !== undefined;
  const hasWcp = meanWcp !== null && meanWcp !== undefined;

  return (
    <div className="flex flex-col gap-2">
      {/* Stats grid 2x2 */}
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className={cn(
              "flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-white/5",
              compact ? "px-2 py-2" : "px-3 py-2.5",
            )}
          >
            <span className="text-muted-foreground" aria-hidden="true">{tile.icon}</span>
            <span className="text-lg font-bold leading-none">{tile.count}</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {tile.label}
            </span>
          </div>
        ))}
      </div>

      {/* PGRADE + CP tiles */}
      <div className="grid grid-cols-2 gap-2">
        <div
          className={cn(
            "flex flex-col items-center gap-1 rounded-xl border bg-white/5",
            hasPgrade ? "border-white/10" : "border-white/5",
            compact ? "px-2 py-1.5" : "px-3 py-2",
          )}
          title="Performance Grade — overall subjective rating (1-10 scale)"
        >
          <span className="text-[10px] font-semibold tracking-wide text-muted-foreground">PGRADE</span>
          <span className={cn("text-lg font-bold leading-none", hasPgrade ? "" : "text-muted-foreground/40")}>
            {hasPgrade ? person.pgrade : "\u2014"}
          </span>
          <div className="mt-0.5 flex w-full gap-px">
            {PGRADE_COLORS.map((color, i) => (
              <div
                key={i}
                className="h-1 flex-1 first:rounded-l-sm last:rounded-r-sm"
                style={{ backgroundColor: color, opacity: hasPgrade && i < person.pgrade! ? 1 : 0.12 }}
              />
            ))}
          </div>
        </div>
        <div
          className={cn(
            "flex flex-col items-center gap-1 rounded-xl border bg-white/5",
            hasCp ? "border-white/10" : "border-white/5",
            compact ? "px-2 py-1.5" : "px-3 py-2",
          )}
          title="Cumulative Points — weighted aggregate of set participation scores"
        >
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-semibold tracking-wide text-muted-foreground">CP</span>
            {hasWcp && (
              <span className="text-[9px] text-red-400" title="Weighted Cumulative Points — mean of all weighted set scores">
                W{meanWcp.toFixed(1)}
              </span>
            )}
          </div>
          <span className={cn("text-lg font-bold leading-none", hasCp ? "" : "text-muted-foreground/40")}>
            {hasCp ? calculatedPgrade : "\u2014"}
          </span>
          <div className="relative mt-0.5 w-full">
            <div className="flex w-full gap-px">
              {CP_COLORS.map((color, i) => (
                <div
                  key={i}
                  className="h-1 flex-1 first:rounded-l-sm last:rounded-r-sm"
                  style={{ backgroundColor: color, opacity: hasCp && i < calculatedPgrade! ? 1 : 0.12 }}
                />
              ))}
            </div>
            {hasWcp && (
              <div
                className="absolute -top-[5px] -translate-x-1/2 text-red-500 text-[7px] leading-none select-none"
                style={{ left: `${(meanWcp / 10) * 100}%` }}
                title={`Mean WCP: ${meanWcp.toFixed(1)}`}
              >
                &#9660;
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Density Configuration ───────────────────────────────────────────────────

type HeroDensityConfig = {
  cardPadding: string;
  cardGap: string;
  photoWidth: number;
  photoHeight: number;
  labelWidth: string;
  fieldGap: string;
  kpiWidth: string;
  nameSize: string;
};

const DENSITY_CONFIGS: Record<HeroLayout, HeroDensityConfig> = {
  spacious: {
    cardPadding: "p-7",
    cardGap: "gap-6",
    photoWidth: 200,
    photoHeight: 250,
    labelWidth: "w-36",
    fieldGap: "gap-2.5",
    kpiWidth: "sm:w-56",
    nameSize: "text-2xl",
  },
  standard: {
    cardPadding: "p-5",
    cardGap: "gap-5",
    photoWidth: 180,
    photoHeight: 220,
    labelWidth: "w-32",
    fieldGap: "gap-2",
    kpiWidth: "sm:w-52",
    nameSize: "text-xl",
  },
  compact: {
    cardPadding: "p-4",
    cardGap: "gap-4",
    photoWidth: 160,
    photoHeight: 200,
    labelWidth: "w-28",
    fieldGap: "gap-1.5",
    kpiWidth: "sm:w-48",
    nameSize: "text-lg",
  },
};

// ── Hero Card — shared types & identity block ──────────────────────────────

type HeroSharedProps = {
  person: PersonData;
  currentState: PersonCurrentState;
  photos: GalleryItem[];
  profileLabels: ProfileImageLabel[];
  kpiCounts: KpiCounts;
  calculatedPgrade?: number | null;
  meanWcp?: number | null;
  displayName: string;
  initials: string;
  age: number | null;
  aliasPills: PersonData["aliases"];
  referenceSessionId?: string;
  headshotSlotMap?: Map<string, number>;
  onAliasesBadgeClick?: () => void;
  onAppearanceClick?: () => void;
};

function IdentityBlock({ person, displayName, age, aliasPills, onAliasesBadgeClick, currentState, onAppearanceClick, nameSize = "text-2xl" }: {
  person: PersonData;
  displayName: string;
  age: number | null;
  aliasPills: PersonData["aliases"];
  onAliasesBadgeClick?: () => void;
  currentState?: PersonCurrentState;
  onAppearanceClick?: () => void;
  nameSize?: string;
}) {
  const birthAlias = aliasPills.find((a) => a.type === "birth");
  const commonAlias = person.aliases.find((a) => a.type === "common");
  const totalAliasCount = person.aliases.filter((a) => a.type === "alias").length;

  return (
    <div>
      <h1 className={cn("font-bold leading-tight", nameSize)}>{displayName}</h1>
      {displayName !== person.icgId && (
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">{person.icgId}</p>
      )}

      {(birthAlias || totalAliasCount > 0) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {birthAlias && birthAlias.name !== commonAlias?.name && (
            <>
              <span className="text-xs text-muted-foreground">Born:</span>
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
                  ALIAS_TYPE_STYLES.birth,
                )}
              >
                {birthAlias.name}
              </span>
            </>
          )}
          {totalAliasCount > 0 && (
            <button
              type="button"
              onClick={onAliasesBadgeClick}
              className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <BookUser size={11} />
              {totalAliasCount} {totalAliasCount === 1 ? "alias" : "aliases"}
            </button>
          )}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        {person.nationality && (
          <span className="flex items-center gap-1.5">
            <FlagImage code={person.nationality} size={16} />
            {findCountryByCode(person.nationality)?.name ?? person.nationality}
          </span>
        )}
        {age !== null && (
          <span>
            {age} yrs
            {person.sexAtBirth === "female" ? " \u2640" : person.sexAtBirth === "male" ? " \u2642" : ""}
          </span>
        )}
        {age === null && person.sexAtBirth && (
          <span>{person.sexAtBirth === "female" ? "\u2640" : person.sexAtBirth === "male" ? "\u2642" : ""}</span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-sm">
          <span className={cn("inline-block h-2 w-2 rounded-full", STATUS_DOT_COLORS[person.status])} />
          {STATUS_LABELS[person.status]}
        </span>
        {person.activeSince && (
          <span className="text-sm text-muted-foreground">
            Since {person.activeSince}
          </span>
        )}
      </div>

      {person.rating !== null && (
        <div className="mt-2 flex items-center gap-2">
          <StarRating rating={person.rating} />
          <span className="text-sm font-semibold text-muted-foreground">{person.rating}/5</span>
        </div>
      )}

      {/* Inline basic info (folded from former BasicInfoPanel) */}
      {(person.birthdate || person.ethnicity) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {person.birthdate && (
            <span>{formatPartialDate(person.birthdate, person.birthdatePrecision)}</span>
          )}
          {person.ethnicity && (
            <span>{person.ethnicity.split(" \u2192 ")[0]}</span>
          )}
        </div>
      )}

      {/* Entity pills — at-a-glance appearance summary (max 4 + overflow) */}
      {currentState && (() => {
        const heroEntities = [
          ...currentState.activeBodyMarks.filter((m) => m.heroVisible).map((m) => ({ kind: "mark" as const, label: m.type, heroOrder: m.heroOrder, id: m.id })),
          ...currentState.activeBodyModifications.filter((m) => m.heroVisible).map((m) => ({ kind: "mod" as const, label: m.type, heroOrder: m.heroOrder, id: m.id })),
          ...currentState.activeCosmeticProcedures.filter((p) => p.heroVisible).map((p) => ({ kind: "proc" as const, label: p.type, heroOrder: p.heroOrder, id: p.id })),
        ].sort((a, b) => (a.heroOrder ?? 999) - (b.heroOrder ?? 999));

        if (heroEntities.length === 0) return null;

        const visiblePills = heroEntities.slice(0, 4);
        const overflow = heroEntities.length - visiblePills.length;

        const pillStyles = {
          mark: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
          mod: "border-teal-500/30 bg-teal-500/10 text-teal-600 dark:text-teal-400",
          proc: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
        };

        const Wrapper = onAppearanceClick ? "button" : "div";
        return (
          <Wrapper
            {...(onAppearanceClick ? { type: "button" as const, onClick: onAppearanceClick } : {})}
            className="mt-2 flex flex-wrap items-center gap-1.5"
          >
            {visiblePills.map((e) => (
              <span key={`${e.kind}-${e.id}`} className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize", pillStyles[e.kind])}>
                {e.label}
              </span>
            ))}
            {overflow > 0 && (
              <span className="rounded-full border border-white/15 bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                +{overflow} more
              </span>
            )}
          </Wrapper>
        );
      })()}
    </div>
  );
}

// ── Hero Density Layout ─────────────────────────────────────────────────────

function HeroDensityLayout(props: HeroSharedProps) {
  const { layout } = useHeroLayout();
  const cfg = DENSITY_CONFIGS[layout];
  const { person, currentState, photos, profileLabels, kpiCounts, calculatedPgrade, meanWcp, displayName, initials, age, aliasPills, referenceSessionId, headshotSlotMap } = props;
  const isCompact = layout === "compact";

  const handleAssignHeadshot = useCallback(
    async (mediaItemId: string, slot: number) => {
      await assignHeadshotSlotAction(person.id, mediaItemId, slot);
    },
    [person.id],
  );

  const handleRemoveHeadshot = useCallback(
    async (mediaItemId: string) => {
      await removeHeadshotSlotAction(person.id, mediaItemId);
    },
    [person.id],
  );

  const handleFindSimilar = useCallback((mediaItemId: string) => {
    window.open(`/media/similar?id=${mediaItemId}`, "_blank");
  }, []);

  return (
    <div className={cn("rounded-2xl border border-white/20 bg-card/70 shadow-md backdrop-blur-sm", cfg.cardPadding)}>
      <div className={cn("flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left", cfg.cardGap)}>
        {/* Zone 1: Photo */}
        <CarouselHeader
          items={photos}
          fallbackInitials={initials}
          width={cfg.photoWidth}
          height={cfg.photoHeight}
          sessionId={referenceSessionId}
          onAssignHeadshot={handleAssignHeadshot}
          onRemoveHeadshot={handleRemoveHeadshot}
          profileLabels={profileLabels}
          headshotSlotMap={headshotSlotMap}
          onFindSimilar={handleFindSimilar}
        />

        {/* Zone 2: Identity + Basic Info */}
        <div className="shrink-0">
          <IdentityBlock
            person={person}
            displayName={displayName}
            age={age}
            aliasPills={aliasPills}
            onAliasesBadgeClick={props.onAliasesBadgeClick}
            currentState={props.currentState}
            onAppearanceClick={props.onAppearanceClick}
            nameSize={cfg.nameSize}
          />
        </div>

        {/* Zone 3: Physical Stats */}
        <div className="flex-1 min-w-0">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Activity size={12} /> Physical Stats
          </h3>
          <PhysicalStatsPanel
            person={person}
            currentState={currentState}
            labelWidth={cfg.labelWidth}
            fieldGap={cfg.fieldGap}
          />
        </div>

        {/* Zone 4: KPI Panel */}
        <div className={cn("w-full sm:shrink-0", cfg.kpiWidth)}>
          <KpiStatsPanel person={person} kpiCounts={kpiCounts} calculatedPgrade={calculatedPgrade} meanWcp={meanWcp} compact={isCompact} />
        </div>
      </div>
    </div>
  );
}

// ── Hero Card Dispatcher ────────────────────────────────────────────────────

function HeroCard({
  person,
  currentState,
  photos,
  profileLabels,
  kpiCounts,
  calculatedPgrade,
  meanWcp,
  referenceSessionId,
  headshotSlotMap,
  onAliasesBadgeClick,
  onAppearanceClick,
}: {
  person: PersonData;
  currentState: PersonCurrentState;
  photos: GalleryItem[];
  profileLabels: ProfileImageLabel[];
  kpiCounts: KpiCounts;
  calculatedPgrade?: number | null;
  meanWcp?: number | null;
  referenceSessionId?: string;
  headshotSlotMap?: Map<string, number>;
  onAliasesBadgeClick?: () => void;
  onAppearanceClick?: () => void;
}) {
  const commonAlias = person.aliases.find((a) => a.type === "common");
  const birthAlias = person.aliases.find((a) => a.type === "birth");
  const otherAliases = person.aliases.filter((a) => a.type === "alias");

  const displayName = commonAlias ? commonAlias.name : person.icgId;
  const initials = commonAlias
    ? commonAlias.name.charAt(0).toUpperCase()
    : person.icgId.charAt(0).toUpperCase();

  const age = person.birthdate ? computeAge(new Date(person.birthdate)) : null;

  const aliasPills = [
    ...(birthAlias && birthAlias.name !== commonAlias?.name ? [birthAlias] : []),
    ...otherAliases,
  ];

  const sharedProps: HeroSharedProps = {
    person,
    currentState,
    photos,
    profileLabels,
    kpiCounts,
    calculatedPgrade,
    meanWcp,
    displayName,
    initials,
    age,
    referenceSessionId,
    headshotSlotMap,
    aliasPills,
    onAliasesBadgeClick,
    onAppearanceClick,
  };

  return <HeroDensityLayout {...sharedProps} />;
}

// ── Overview Tab ─────────────────────────────────────────────────────────────

function AboutCard({ person, referencePhotos }: { person: PersonData; referencePhotos?: GalleryItem[] }) {
  const [editing, setEditing] = useState(false);
  const [savedBio, setSavedBio] = useState(person.bio ?? "");
  const [draft, setDraft] = useState(person.bio ?? "");
  const [isPending, startTransition] = useTransition();
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);

  const displayName = person.aliases.find((a) => a.type === "common")?.name ?? person.icgId;
  const photos = referencePhotos ?? [];

  // Build a lookup map for media: references → actual URLs
  const mediaUrlMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of photos) {
      const url = p.urls.gallery_512 ?? p.urls.original;
      if (url) map.set(p.id, url);
    }
    return map;
  }, [photos]);

  function insertPhoto(mediaId: string) {
    const tag = `![](media:${mediaId})`;
    setDraft((prev) => prev ? `${prev}\n${tag}` : tag);
    setShowPhotoPicker(false);
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updatePersonBio(person.id, draft);
      if (result.success) {
        setSavedBio(draft);
      }
      setEditing(false);
    });
  }

  const markdownComponents = useMemo(() => ({
    h1: ({ children }: { children?: React.ReactNode }) => <p className="text-base font-bold text-foreground mb-1">{children}</p>,
    h2: ({ children }: { children?: React.ReactNode }) => <p className="text-sm font-semibold text-foreground mb-1">{children}</p>,
    h3: ({ children }: { children?: React.ReactNode }) => <p className="text-sm font-medium text-foreground mb-0.5">{children}</p>,
    p: ({ children }: { children?: React.ReactNode }) => <p className="mb-2 last:mb-0">{children}</p>,
    strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold text-foreground">{children}</strong>,
    em: ({ children }: { children?: React.ReactNode }) => <em>{children}</em>,
    ul: ({ children }: { children?: React.ReactNode }) => <ul className="list-disc list-inside mb-2 last:mb-0 space-y-0.5">{children}</ul>,
    ol: ({ children }: { children?: React.ReactNode }) => <ol className="list-decimal list-inside mb-2 last:mb-0 space-y-0.5">{children}</ol>,
    a: ({ children }: { href?: string; children?: React.ReactNode }) => <span className="text-primary underline">{children}</span>,
    img: ({ src, alt }: { src?: string | Blob; alt?: string }) => {
      if (!src || typeof src !== "string") return null;
      // Only allow media: references from reference session photos
      if (!src.startsWith("media:")) return null;
      const mediaId = src.slice(6);
      const resolved = mediaUrlMap.get(mediaId);
      if (!resolved) return null;
      return (
        <NextImage
          src={resolved}
          alt={alt ?? ""}
          width={400}
          height={300}
          className="rounded-lg my-2 max-w-full w-auto h-auto"
          unoptimized
        />
      );
    },
  }), [mediaUrlMap]);

  return (
    <SectionCard
      title={`About ${displayName}`}
      icon={<Info size={18} />}
      className="md:col-span-2"
      action={
        !editing ? (
          <button
            type="button"
            onClick={() => { setDraft(savedBio); setEditing(true); }}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Pencil size={12} /> Edit
          </button>
        ) : undefined
      }
    >
      {editing ? (
        <div className="space-y-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            className="w-full resize-y rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Write a bio... (supports **bold**, *italic*, # headings, - lists)"
          />
          {/* Photo picker */}
          {showPhotoPicker && photos.length > 0 && (
            <div className="rounded-lg border border-white/15 bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Insert photo from reference session</p>
              <div className="flex flex-wrap gap-1.5">
                {photos.map((photo) => {
                  const thumbUrl = photo.urls.gallery_512 ?? photo.urls.original;
                  return thumbUrl ? (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => insertPhoto(photo.id)}
                      className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-white/10 transition-all hover:border-primary hover:ring-1 hover:ring-primary"
                    >
                      <NextImage src={thumbUrl} alt="" width={56} height={56} className="h-full w-full object-cover" unoptimized />
                    </button>
                  ) : null;
                })}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Cancel
            </button>
            {photos.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPhotoPicker((v) => !v)}
                className={cn(
                  "ml-auto flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  showPhotoPicker
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-white/15 text-muted-foreground hover:text-foreground"
                )}
              >
                <ImageIcon size={12} /> Photo
              </button>
            )}
          </div>
        </div>
      ) : savedBio ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => { setDraft(savedBio); setEditing(true); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setDraft(savedBio); setEditing(true); } }}
          className="w-full text-left text-sm leading-relaxed text-muted-foreground rounded-lg px-3 py-2 -mx-3 -my-2 transition-colors hover:bg-muted/30 cursor-text"
        >
          <ReactMarkdown
            components={markdownComponents}
            urlTransform={(url) => url}
          >
            {savedBio}
          </ReactMarkdown>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-sm text-muted-foreground/50 italic hover:text-muted-foreground transition-colors"
        >
          Add a bio...
        </button>
      )}
    </SectionCard>
  );
}

function OverviewTab({
  person,
  currentState,
  sessionWorkHistory,
  referencePhotos,
}: {
  person: PersonData;
  currentState: PersonCurrentState;
  sessionWorkHistory?: PersonSessionWorkEntry[];
  referencePhotos?: GalleryItem[];
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const hasDigitalIdentities = currentState.activeDigitalIdentities.length > 0;
  const hasNotesOrTags = person.notes || person.tags.length > 0;
  const hasHistory = person.personas.length > 0;
  const recentWork = (sessionWorkHistory ?? []).slice(0, 3);
  const recentPhotos = (referencePhotos ?? []).slice(0, 8);

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {/* 1. About */}
      <AboutCard person={person} referencePhotos={referencePhotos} />

      {/* 2. Recent Work | Recent Photos */}
      {recentWork.length > 0 && (
        <SectionCard title="Recent Work" icon={<Film size={18} />} badge={recentWork.length}>
          <div className="space-y-2">
            {recentWork.map((entry) => (
              <Link
                key={entry.sessionId}
                href={`/sessions/${entry.sessionId}`}
                className="flex items-center gap-3 rounded-lg border border-white/10 bg-card/30 p-2.5 transition-colors hover:border-white/20 hover:bg-card/50"
              >
                {entry.thumbnails[0] && (
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md">
                    <NextImage src={entry.thumbnails[0].url} alt="" width={40} height={40} className="h-full w-full object-cover" unoptimized />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{entry.sessionName}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.labelName && <span>{entry.labelName}</span>}
                    {entry.sessionDate && <span> · {formatPartialDate(entry.sessionDate, entry.sessionDatePrecision)}</span>}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </SectionCard>
      )}

      {recentPhotos.length > 0 && (
        <SectionCard title="Recent Photos" icon={<ImageIcon size={18} />} badge={recentPhotos.length}>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
            {recentPhotos.map((photo, idx) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => setLightboxIndex(idx)}
                className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10 transition-all hover:border-white/25"
              >
                <NextImage src={photo.urls.gallery_512 ?? photo.urls.original} alt="" width={64} height={64} className="h-full w-full object-cover" unoptimized />
              </button>
            ))}
          </div>
          {lightboxIndex !== null && (
            <GalleryLightbox
              items={recentPhotos}
              initialIndex={lightboxIndex}
              onClose={() => setLightboxIndex(null)}
            />
          )}
        </SectionCard>
      )}

      {/* 3. History — default collapsed */}
      {hasHistory && (
        <SectionCard
          title="History"
          icon={<Users size={18} />}
          badge={person.personas.length}
          className="md:col-span-2"
        >
          <HistoryPanel personas={person.personas} personId={person.id} currentState={currentState} />
        </SectionCard>
      )}

      {/* 5. Digital Identities | Notes & Tags */}
      {hasDigitalIdentities && (
        <SectionCard
          title="Digital Identities"
          icon={<Cpu size={18} />}
          badge={currentState.activeDigitalIdentities.length}
        >
          <div className="space-y-2">
            {currentState.activeDigitalIdentities.map((identity) => (
              <DigitalIdentityRow key={identity.id} identity={identity} />
            ))}
          </div>
        </SectionCard>
      )}

      {hasNotesOrTags && (
        <SectionCard title="Notes & Tags" icon={<Tag size={18} />}>
          {person.tags.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {person.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full border border-white/10 bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          {person.notes && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {person.notes}
            </p>
          )}
        </SectionCard>
      )}
    </div>
  );
}

// ── Career Tab ───────────────────────────────────────────────────────────────

function CareerTab({
  person,
  sessionWorkHistory,
  affiliations,
}: {
  person: PersonData;
  sessionWorkHistory: PersonSessionWorkEntry[];
  affiliations: PersonAffiliation[];
}) {
  // Derive affiliations from session work history
  const derivedAffiliations = useMemo(() => {
    if (affiliations.length > 0) return affiliations;
    const labelMap = new Map<string, PersonAffiliation>();
    for (const entry of sessionWorkHistory) {
      if (!entry.labelId || !entry.labelName) continue;
      const existing = labelMap.get(entry.labelId);
      if (existing) {
        existing.setCount++;
      } else {
        labelMap.set(entry.labelId, {
          labelId: entry.labelId,
          labelName: entry.labelName,
          setCount: 1,
        });
      }
    }
    return Array.from(labelMap.values()).sort((a, b) => b.setCount - a.setCount);
  }, [affiliations, sessionWorkHistory]);

  return (
    <div className="space-y-6">
      {/* Professional Summary */}
      {(person.activeSince || person.specialization) && (
        <SectionCard title="Professional" icon={<Briefcase size={18} />}>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm">
            {person.activeSince && (
              <InfoRow label="Active since" value={person.activeSince} />
            )}
            {person.specialization && (
              <InfoRow label="Specialization" value={person.specialization} />
            )}
          </dl>
        </SectionCard>
      )}

      {/* Session Work History */}
      <SectionCard
        title="Work History"
        icon={<Film size={18} />}
        badge={sessionWorkHistory.length}
      >
        {sessionWorkHistory.length === 0 ? (
          <EmptyState message="No work history recorded." />
        ) : (
          <CareerSessionList entries={sessionWorkHistory} />
        )}
      </SectionCard>

      {/* Label Affiliations */}
      <SectionCard
        title="Label Affiliations"
        icon={<Network size={18} />}
        badge={derivedAffiliations.length}
      >
        {derivedAffiliations.length === 0 ? (
          <EmptyState message="No label affiliations." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {derivedAffiliations.map((aff) => (
              <div
                key={aff.labelId}
                className="flex items-center gap-2 rounded-xl border border-white/20 bg-card/50 px-3 py-2"
              >
                <Building2 size={14} className="text-muted-foreground" aria-hidden="true" />
                <span className="text-sm font-medium">{aff.labelName}</span>
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                  {aff.setCount}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Network Tab ──────────────────────────────────────────────────────────────

function NetworkTab({ connections }: { connections: PersonConnection[] }) {
  return (
    <SectionCard
      title="Connections"
      icon={<MapPin size={18} />}
      badge={connections.length}
    >
      {connections.length === 0 ? (
        <EmptyState message="No connections recorded." />
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {connections.map((conn) => {
            const displayName = conn.commonAlias ?? conn.icgId;
            const initials = conn.commonAlias
              ? conn.commonAlias.charAt(0).toUpperCase()
              : conn.icgId.charAt(0).toUpperCase();
            return (
              <Link
                key={conn.personId}
                href={`/people/${conn.personId}`}
                className="group flex items-center gap-3 rounded-xl border border-white/15 bg-card/40 p-3 transition-all hover:border-white/25 hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium group-hover:text-primary">
                    {displayName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {conn.sharedSetCount} shared {conn.sharedSetCount === 1 ? "set" : "sets"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                      SOURCE_STYLES[conn.source],
                    )}
                  >
                    {conn.source}
                  </span>
                  {conn.label && (
                    <span className="text-xs text-muted-foreground/70 italic">
                      {conn.label}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

// ── Photos Tab ───────────────────────────────────────────────────────────────

function PhotosTab({
  person,
  photos,
  referenceSessionId,
  filledHeadshotSlots,
  profileLabels,
  headshotSlotEntries,
  productionSessions,
}: {
  person: PersonData;
  photos: GalleryItem[];
  referenceSessionId?: string;
  filledHeadshotSlots?: number[];
  profileLabels: ProfileImageLabel[];
  headshotSlotEntries?: HeadshotSlotEntry[];
  productionSessions: PersonProductionSession[];
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [slotEntries, setSlotEntries] = useState(headshotSlotEntries ?? []);

  const indexMap = new Map<string, number>();
  photos.forEach((p, i) => indexMap.set(p.id, i));

  const totalProductionCount = productionSessions.reduce((sum, s) => sum + s.mediaCount, 0);

  // Build Map<mediaItemId, slot> from entries
  const headshotSlotMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of slotEntries) {
      map.set(entry.mediaItemId, entry.slot);
    }
    return map;
  }, [slotEntries]);

  const handleAssignHeadshot = useCallback(
    async (mediaItemId: string, slot: number) => {
      // Optimistic update: remove old assignment for this slot, add new one
      setSlotEntries((prev) => [
        ...prev.filter((e) => e.slot !== slot && e.mediaItemId !== mediaItemId),
        { mediaItemId, slot },
      ]);
      await assignHeadshotSlotAction(person.id, mediaItemId, slot);
    },
    [person.id],
  );

  const handleRemoveHeadshot = useCallback(
    async (mediaItemId: string) => {
      setSlotEntries((prev) => prev.filter((e) => e.mediaItemId !== mediaItemId));
      await removeHeadshotSlotAction(person.id, mediaItemId);
    },
    [person.id],
  );

  const handleFindSimilar = useCallback((mediaItemId: string) => {
    window.open(`/media/similar?id=${mediaItemId}`, "_blank");
  }, []);

  return (
    <div className="space-y-6">
      {/* Reference Photos */}
      <SectionCard title="Reference Photos" icon={<ImageIcon size={18} />} badge={photos.length}>
        {photos.length === 0 ? (
          <EmptyState message="No reference photos uploaded yet." />
        ) : (
          <JustifiedGrid
            items={photos}
            onOpen={(id) => {
              const idx = indexMap.get(id);
              if (idx !== undefined) setLightboxIndex(idx);
            }}
          />
        )}
      </SectionCard>
      {referenceSessionId && (
        <BatchUploadZone
          sessionId={referenceSessionId}
          personId={person.id}
          filledHeadshotSlots={filledHeadshotSlots}
          totalHeadshotSlots={profileLabels.length || 5}
        />
      )}
      {lightboxIndex !== null && (
        <GalleryLightbox
          items={photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onAssignHeadshot={handleAssignHeadshot}
          onRemoveHeadshot={handleRemoveHeadshot}
          profileLabels={profileLabels}
          headshotSlotMap={headshotSlotMap}
          onFindSimilar={handleFindSimilar}
          sessionId={referenceSessionId}
        />
      )}

      {/* Production Photos */}
      <SectionCard
        title="Production Photos"
        icon={<Film size={18} />}
        badge={totalProductionCount}
      >
        {productionSessions.length === 0 ? (
          <EmptyState message="No production session photos." />
        ) : (
          <ProductionPhotoList sessions={productionSessions} />
        )}
      </SectionCard>
    </div>
  );
}

// ── Main export ─────────────────────────────────────────────────────────────

export function PersonDetailTabs({
  person,
  currentState,
  workHistory,
  affiliations,
  connections,
  photos,
  profileLabels,
  referenceSessionId,
  filledHeadshotSlots,
  headshotSlotEntries,
  categories,
  categoryCounts,
  skillGroups,
  physicalAttributeGroups,
  calculatedPgrade,
  meanWcp,
  aliasesWithChannels,
  sessionWorkHistory,
  productionSessions,
  entityMedia,
}: PersonDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const heroHeadshotSlotMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of headshotSlotEntries ?? []) {
      map.set(entry.mediaItemId, entry.slot);
    }
    return map;
  }, [headshotSlotEntries]);

  const aliasCount = person.aliases.filter((a) => a.type === "alias").length;

  const handleAliasesBadgeClick = useCallback(() => {
    setActiveTab("aliases");
  }, []);

  const handleAppearanceClick = useCallback(() => {
    setActiveTab("appearance");
  }, []);

  const tabs: { id: TabId; label: string; badge?: number; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <LayoutDashboard size={14} /> },
    { id: "aliases", label: "Aliases", badge: aliasCount || undefined, icon: <BookUser size={14} /> },
    { id: "appearance", label: "Appearance", badge: (currentState.activeBodyMarks.length + currentState.activeBodyModifications.length + currentState.activeCosmeticProcedures.length) || undefined, icon: <Sparkles size={14} /> },
    ...(categories && categories.length > 0
      ? [{ id: "details" as TabId, label: "Details", badge: (categoryCounts?.filter((c) => c.count > 0).length) || undefined, icon: <FileImage size={14} /> }]
      : []),
    { id: "skills" as TabId, label: "Skills", badge: currentState.activeSkills.length || undefined, icon: <Zap size={14} /> },
    { id: "career", label: "Career", badge: (sessionWorkHistory?.length ?? workHistory.length) || undefined, icon: <Briefcase size={14} /> },
    { id: "network", label: "Network", badge: connections.length || undefined, icon: <Users size={14} /> },
    { id: "photos", label: "Photos", badge: (photos.length + (productionSessions?.reduce((sum, s) => sum + s.mediaCount, 0) ?? 0)) || undefined, icon: <ImageIcon size={14} /> },
  ];

  return (
    <div className="space-y-6">
      {/* Hero Card */}
      <HeroCard
        person={person}
        currentState={currentState}
        photos={photos}
        profileLabels={profileLabels}
        referenceSessionId={referenceSessionId}
        headshotSlotMap={heroHeadshotSlotMap}
        calculatedPgrade={calculatedPgrade}
        meanWcp={meanWcp}
        kpiCounts={{
          sets: sessionWorkHistory?.length ?? workHistory.length,
          labels: affiliations.length,
          photos: photos.length + (productionSessions?.reduce((sum, s) => sum + s.mediaCount, 0) ?? 0),
          connections: connections.length,
        }}
        onAliasesBadgeClick={handleAliasesBadgeClick}
        onAppearanceClick={handleAppearanceClick}
      />

      {/* Tab bar — scrollable on mobile */}
      <div
        className="flex gap-1 overflow-x-auto rounded-xl border border-white/15 bg-card/50 p-1 scrollbar-none"
        role="tablist"
        aria-label="Person details"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            id={`tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              activeTab === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="shrink-0" aria-hidden="true">{tab.icon}</span>
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                  activeTab === tab.id
                    ? "bg-primary/10 text-primary"
                    : "bg-muted/60 text-muted-foreground",
                )}
              >
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div
        id="tabpanel-overview"
        role="tabpanel"
        aria-labelledby="tab-overview"
        hidden={activeTab !== "overview"}
      >
        {activeTab === "overview" && (
          <OverviewTab
            person={person}
            currentState={currentState}
            sessionWorkHistory={sessionWorkHistory}
            referencePhotos={photos}
          />
        )}
      </div>
      <div
        id="tabpanel-aliases"
        role="tabpanel"
        aria-labelledby="tab-aliases"
        hidden={activeTab !== "aliases"}
      >
        {activeTab === "aliases" && (
          <PersonAliasesTab
            personId={person.id}
            aliases={aliasesWithChannels ?? []}
          />
        )}
      </div>
      <div
        id="tabpanel-appearance"
        role="tabpanel"
        aria-labelledby="tab-appearance"
        hidden={activeTab !== "appearance"}
      >
        {activeTab === "appearance" && (
          <AppearanceTab
            person={person}
            currentState={currentState}
            entityMedia={entityMedia}
            categories={categories}
            referenceSessionId={referenceSessionId}
            attributeGroups={physicalAttributeGroups}
          />
        )}
      </div>
      {categories && categories.length > 0 && (
        <div
          id="tabpanel-details"
          role="tabpanel"
          aria-labelledby="tab-details"
          hidden={activeTab !== "details"}
        >
          {activeTab === "details" && (
            <PersonDetailsTab
              personId={person.id}
              categories={categories}
              categoryCounts={categoryCounts ?? []}
              referenceSessionId={referenceSessionId}
              currentState={currentState}
            />
          )}
        </div>
      )}
      <div
        id="tabpanel-skills"
        role="tabpanel"
        aria-labelledby="tab-skills"
        hidden={activeTab !== "skills"}
      >
        {activeTab === "skills" && (
          <PersonSkillsTab
            personId={person.id}
            skills={currentState.activeSkills}
            skillGroups={skillGroups ?? []}
            personas={person.personas.map((p) => ({
              id: p.id,
              label: p.label,
            }))}
          />
        )}
      </div>
      <div
        id="tabpanel-career"
        role="tabpanel"
        aria-labelledby="tab-career"
        hidden={activeTab !== "career"}
      >
        {activeTab === "career" && (
          <CareerTab
            person={person}
            sessionWorkHistory={sessionWorkHistory ?? []}
            affiliations={affiliations}
          />
        )}
      </div>
      <div
        id="tabpanel-network"
        role="tabpanel"
        aria-labelledby="tab-network"
        hidden={activeTab !== "network"}
      >
        {activeTab === "network" && <NetworkTab connections={connections} />}
      </div>
      <div
        id="tabpanel-photos"
        role="tabpanel"
        aria-labelledby="tab-photos"
        hidden={activeTab !== "photos"}
      >
        {activeTab === "photos" && (
          <PhotosTab
            person={person}
            photos={photos}
            profileLabels={profileLabels}
            referenceSessionId={referenceSessionId}
            filledHeadshotSlots={filledHeadshotSlots}
            headshotSlotEntries={headshotSlotEntries}
            productionSessions={productionSessions ?? []}
          />
        )}
      </div>
    </div>
  );
}
