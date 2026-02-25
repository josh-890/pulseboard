"use client";

import { useState } from "react";
import { cn, computeAge, formatPartialDate } from "@/lib/utils";
import type { getPersonWithDetails } from "@/lib/services/person-service";
import type {
  PersonCurrentState,
  PersonWorkHistoryItem,
  PersonAffiliation,
  PersonConnection,
  AliasType,
  PersonStatus,
  ContributionRole,
  SetType,
  RelationshipSource,
} from "@/lib/types";
import { useHeroLayout, type HeroLayout } from "@/components/layout/hero-layout-provider";
import { PersonaTimelineEntry } from "@/components/people/persona-timeline-entry";
import { BodyMarkCard } from "@/components/people/body-mark-card";
import { DigitalIdentityRow } from "@/components/people/digital-identity-row";
import { SkillItem } from "@/components/people/skill-item";
import {
  Star,
  StarOff,
  BookUser,
  Fingerprint,
  Users,
  Film,
  Camera,
  Network,
  MapPin,
  Tag,
  Building2,
  Cpu,
  Activity,
  Globe,
  ChevronDown,
  ChevronUp,
  Briefcase,
  Image as ImageIcon,
  Link2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CarouselHeader } from "@/components/photos/carousel-header";
import { JustifiedGallery } from "@/components/photos/justified-gallery";
import { ImageUpload } from "@/components/photos/image-upload";
import type { PhotoWithUrls } from "@/lib/types";
import type { ProfileImageLabel } from "@/lib/services/setting-service";

type PersonData = NonNullable<Awaited<ReturnType<typeof getPersonWithDetails>>>;
type PhotoProps = Omit<PhotoWithUrls, "variants">;

type TabId = "overview" | "appearance" | "career" | "network" | "photos";

type PersonDetailTabsProps = {
  person: PersonData;
  currentState: PersonCurrentState;
  workHistory: PersonWorkHistoryItem[];
  affiliations: PersonAffiliation[];
  connections: PersonConnection[];
  photos: PhotoProps[];
  profileLabels: ProfileImageLabel[];
};

// ── Style maps ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<PersonStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  inactive: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30",
  wishlist: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  archived: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
};

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

const ROLE_STYLES: Record<ContributionRole, string> = {
  main: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  supporting: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30",
  background: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30",
};

const ROLE_LABELS: Record<ContributionRole, string> = {
  main: "Main",
  supporting: "Supporting",
  background: "Background",
};

const SET_TYPE_STYLES: Record<SetType, string> = {
  photo: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
  video: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30",
};

const SOURCE_STYLES: Record<RelationshipSource, string> = {
  derived: "bg-slate-500/15 text-slate-500 border-slate-500/30",
  manual: "bg-primary/15 text-primary border-primary/30",
};

// ── Sub-components ──────────────────────────────────────────────────────────

function SectionCard({
  title,
  icon,
  children,
  className,
  badge,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  badge?: number;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm",
        className,
      )}
    >
      <div className="mb-4 flex items-center gap-2">
        <span className="text-muted-foreground" aria-hidden="true">
          {icon}
        </span>
        <h2 className="text-lg font-semibold">{title}</h2>
        {badge !== undefined && badge > 0 && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-muted-foreground/70 italic">{message}</p>;
}

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

function InfoRow({ label, value, labelWidth = "w-32" }: { label: string; value: React.ReactNode; labelWidth?: string }) {
  return (
    <div className="flex gap-3">
      <dt className={cn("shrink-0 text-muted-foreground", labelWidth)}>{label}</dt>
      <dd className="font-medium">{value}</dd>
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

function PgradeGauge({ value }: { value: number | null | undefined }) {
  const hasValue = value !== null && value !== undefined;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold tracking-wide text-muted-foreground">PGRADE</span>
        <span className="font-bold text-foreground">{hasValue ? `${value}/10` : "\u2014/10"}</span>
      </div>
      <div className="flex gap-0.5" aria-label={hasValue ? `PGRADE: ${value} out of 10` : "PGRADE: not rated"}>
        {PGRADE_COLORS.map((color, i) => (
          <div
            key={i}
            className="h-2.5 flex-1 rounded-sm first:rounded-l-md last:rounded-r-md"
            style={{
              backgroundColor: color,
              opacity: hasValue && i < value ? 1 : 0.12,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Basic Info Panel ─────────────────────────────────────────────────────────

function BasicInfoPanel({
  person,
  labelWidth = "w-32",
  fieldGap = "gap-2",
}: {
  person: PersonData;
  labelWidth?: string;
  fieldGap?: string;
}) {
  const hasAny =
    person.birthdate ||
    person.birthPlace ||
    person.location ||
    person.nationality ||
    person.ethnicity ||
    person.sexAtBirth;

  if (!hasAny) {
    return <EmptyState message="No basic info recorded." />;
  }

  return (
    <dl className={cn("grid grid-cols-1 text-sm", fieldGap)}>
      {person.birthdate && (
        <InfoRow label="Birthdate" value={formatPartialDate(person.birthdate, person.birthdatePrecision)} labelWidth={labelWidth} />
      )}
      {person.birthPlace && (
        <InfoRow label="Birth place" value={person.birthPlace} labelWidth={labelWidth} />
      )}
      {person.location && (
        <InfoRow label="Location" value={person.location} labelWidth={labelWidth} />
      )}
      {person.nationality && (
        <InfoRow label="Nationality" value={person.nationality} labelWidth={labelWidth} />
      )}
      {person.ethnicity && (
        <InfoRow label="Ethnicity" value={person.ethnicity} labelWidth={labelWidth} />
      )}
      {person.sexAtBirth && (
        <InfoRow label="Sex at birth" value={<span className="capitalize">{person.sexAtBirth}</span>} labelWidth={labelWidth} />
      )}
    </dl>
  );
}

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
  const hasStatic = person.height || person.eyeColor || person.naturalHairColor || person.bodyType || person.measurements;
  const hasComputed = currentState.currentHairColor || currentState.weight !== null || currentState.build || currentState.visionAids || currentState.fitnessLevel;

  if (!hasStatic && !hasComputed) {
    return <EmptyState message="No physical stats recorded." />;
  }

  return (
    <dl className={cn("grid grid-cols-1 text-sm", fieldGap)}>
      {/* Static (from Person) */}
      {person.height && <InfoRow label="Height" value={`${person.height} cm`} labelWidth={labelWidth} />}
      {person.eyeColor && <InfoRow label="Eye color" value={<span className="capitalize">{person.eyeColor}</span>} labelWidth={labelWidth} />}
      {person.naturalHairColor && <InfoRow label="Natural hair" value={<span className="capitalize">{person.naturalHairColor}</span>} labelWidth={labelWidth} />}
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
      {currentState.visionAids && <InfoRow label="Vision aids" value={currentState.visionAids} labelWidth={labelWidth} />}
      {currentState.fitnessLevel && <InfoRow label="Fitness level" value={<span className="capitalize">{currentState.fitnessLevel}</span>} labelWidth={labelWidth} />}
    </dl>
  );
}

// ── History Panel ────────────────────────────────────────────────────────────

function HistoryPanel({
  personas,
  defaultOpen = false,
}: {
  personas: PersonData["personas"];
  defaultOpen?: boolean;
}) {
  const [timelineOpen, setTimelineOpen] = useState(defaultOpen);
  const visiblePersonas = personas.filter((p) => !p.deletedAt);

  if (visiblePersonas.length === 0) {
    return <EmptyState message="No persona history recorded." />;
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setTimelineOpen(!timelineOpen)}
        className="mb-3 flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
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
      {timelineOpen && (
        <div className="relative space-y-4">
          <div
            className="absolute left-1.5 top-3 bottom-3 w-px bg-white/10"
            aria-hidden="true"
          />
          {visiblePersonas.map((persona) => (
            <PersonaTimelineEntry key={persona.id} persona={persona} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Career Summary ───────────────────────────────────────────────────────────

function buildCareerSummary(person: PersonData): string {
  const pronoun = person.sexAtBirth === "female" ? "She" : person.sexAtBirth === "male" ? "He" : "They";
  const currentAge = person.birthdate ? computeAge(new Date(person.birthdate)) : null;
  const status = person.status;

  // No activeSince — short fallback based on status + age
  if (!person.activeSince) {
    if (status === "wishlist") return "On the wishlist.";
    if (status === "archived") return "Archived.";
    if (currentAge !== null) {
      const adj = status === "active" ? "Active" : "Inactive";
      return `${adj}, currently ${currentAge} years old.`;
    }
    const adj = status === "active" ? "active" : "inactive";
    return `Currently ${adj}.`;
  }

  // Has activeSince
  const birthYear = person.birthdate ? new Date(person.birthdate).getFullYear() : null;
  const startAge = birthYear ? person.activeSince - birthYear : null;
  const currentYear = new Date().getFullYear();
  const yearsWorking = currentYear - person.activeSince;

  let summary = `${pronoun} started in ${person.activeSince}`;
  if (startAge !== null && startAge > 0) {
    summary += ` at age ${startAge}`;
  }
  summary += ".";

  if (status === "active" && yearsWorking > 0) {
    summary += ` Working for ${yearsWorking} ${yearsWorking === 1 ? "year" : "years"}`;
    if (currentAge !== null) {
      summary += `, now ${currentAge}`;
    }
    summary += ".";
  } else if (status !== "active") {
    summary += " Retired.";
  }

  return summary;
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
  compact = false,
}: {
  person: PersonData;
  kpiCounts: KpiCounts;
  compact?: boolean;
}) {
  const careerSummary = buildCareerSummary(person);

  const tiles = [
    { icon: <Film size={14} />, count: kpiCounts.sets, label: "Sets" },
    { icon: <Building2 size={14} />, count: kpiCounts.labels, label: "Labels" },
    { icon: <ImageIcon size={14} />, count: kpiCounts.photos, label: "Photos" },
    { icon: <Link2 size={14} />, count: kpiCounts.connections, label: "Conn." },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Career summary text */}
      <p className={cn("leading-relaxed text-muted-foreground", compact ? "text-xs" : "text-sm")}>{careerSummary}</p>

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

      {/* PGRADE gauge */}
      <PgradeGauge value={person.pgrade} />
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
  photos: PhotoProps[];
  profileLabels: ProfileImageLabel[];
  kpiCounts: KpiCounts;
  displayName: string;
  initials: string;
  age: number | null;
  aliasPills: PersonData["aliases"];
};

function IdentityBlock({ person, displayName, age, aliasPills, nameSize = "text-2xl" }: {
  person: PersonData;
  displayName: string;
  age: number | null;
  aliasPills: PersonData["aliases"];
  nameSize?: string;
}) {
  return (
    <div>
      <h1 className={cn("font-bold leading-tight", nameSize)}>{displayName}</h1>

      {aliasPills.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">AKA:</span>
          {aliasPills.map((alias) => (
            <span
              key={alias.id}
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
                ALIAS_TYPE_STYLES[alias.type],
              )}
            >
              {alias.name}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        {person.nationality && (
          <span className="flex items-center gap-1">
            <Globe size={14} className="shrink-0" />
            {person.nationality}
          </span>
        )}
        {age !== null && <span>{age} yrs</span>}
        {person.sexAtBirth && <span className="capitalize">{person.sexAtBirth}</span>}
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
    </div>
  );
}

// ── Hero Density Layout ─────────────────────────────────────────────────────

function HeroDensityLayout(props: HeroSharedProps) {
  const { layout } = useHeroLayout();
  const cfg = DENSITY_CONFIGS[layout];
  const { person, currentState, photos, profileLabels, kpiCounts, displayName, initials, age, aliasPills } = props;
  const isCompact = layout === "compact";

  return (
    <div className={cn("rounded-2xl border border-white/20 bg-card/70 shadow-md backdrop-blur-sm", cfg.cardPadding)}>
      <div className={cn("flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left", cfg.cardGap)}>
        {/* Zone 1: Photo */}
        <CarouselHeader
          photos={photos as (Omit<PhotoWithUrls, "variants">)[]}
          entityType="person"
          entityId={person.id}
          fallbackInitials={initials}
          profileLabels={profileLabels}
          width={cfg.photoWidth}
          height={cfg.photoHeight}
        />

        {/* Zone 2: Identity */}
        <div className="shrink-0">
          <IdentityBlock
            person={person}
            displayName={displayName}
            age={age}
            aliasPills={aliasPills}
            nameSize={cfg.nameSize}
          />
        </div>

        {/* Zone 3: Basic Info */}
        <div className="flex-1 min-w-0">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <BookUser size={12} /> Basic Info
          </h3>
          <BasicInfoPanel person={person} labelWidth={cfg.labelWidth} fieldGap={cfg.fieldGap} />
        </div>

        {/* Zone 4: Physical Stats */}
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

        {/* Zone 5: KPI Panel */}
        <div className={cn("w-full sm:shrink-0", cfg.kpiWidth)}>
          <KpiStatsPanel person={person} kpiCounts={kpiCounts} compact={isCompact} />
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
}: {
  person: PersonData;
  currentState: PersonCurrentState;
  photos: PhotoProps[];
  profileLabels: ProfileImageLabel[];
  kpiCounts: KpiCounts;
}) {
  const commonAlias = person.aliases.find((a) => a.type === "common");
  const birthAlias = person.aliases.find((a) => a.type === "birth" && !a.deletedAt);
  const otherAliases = person.aliases.filter((a) => !a.deletedAt && a.type === "alias");

  const displayName = commonAlias ? `${commonAlias.name} (${person.icgId})` : person.icgId;
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
    displayName,
    initials,
    age,
    aliasPills,
  };

  return <HeroDensityLayout {...sharedProps} />;
}

// ── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  person,
  currentState,
}: {
  person: PersonData;
  currentState: PersonCurrentState;
}) {
  const hasDigitalIdentities = currentState.activeDigitalIdentities.length > 0;
  const hasNotesOrTags = person.notes || person.tags.length > 0;
  const hasHistory = person.personas.filter((p) => !p.deletedAt).length > 0;

  if (!hasDigitalIdentities && !hasNotesOrTags && !hasHistory) {
    return (
      <div className="rounded-2xl border border-white/20 bg-card/70 p-8 text-center shadow-md backdrop-blur-sm">
        <p className="text-sm text-muted-foreground/70 italic">
          No additional overview information. Check the other tabs for appearance, career, and network details.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {/* History — full width at top */}
      {hasHistory && (
        <SectionCard
          title="History"
          icon={<Users size={18} />}
          badge={person.personas.filter((p) => !p.deletedAt).length}
          className="md:col-span-2"
        >
          <HistoryPanel personas={person.personas} defaultOpen />
        </SectionCard>
      )}

      {/* Digital Identities */}
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

      {/* Notes & Tags */}
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

// ── Appearance Tab ───────────────────────────────────────────────────────────

function AppearanceTab({
  person,
  currentState,
}: {
  person: PersonData;
  currentState: PersonCurrentState;
}) {
  const hasStatic = person.height || person.eyeColor || person.naturalHairColor || person.bodyType || person.measurements;
  const hasComputed = currentState.currentHairColor || currentState.weight !== null || currentState.build || currentState.visionAids || currentState.fitnessLevel;

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {/* Physical Stats */}
      <SectionCard title="Physical Stats" icon={<Activity size={18} />}>
        {!hasStatic && !hasComputed ? (
          <EmptyState message="No physical stats recorded." />
        ) : (
          <dl className="grid grid-cols-1 gap-2 text-sm">
            {/* Static (from Person) */}
            {person.height && <InfoRow label="Height" value={`${person.height} cm`} />}
            {person.eyeColor && <InfoRow label="Eye color" value={<span className="capitalize">{person.eyeColor}</span>} />}
            {person.naturalHairColor && <InfoRow label="Natural hair" value={<span className="capitalize">{person.naturalHairColor}</span>} />}
            {person.bodyType && <InfoRow label="Body type" value={<span className="capitalize">{person.bodyType}</span>} />}
            {person.measurements && <InfoRow label="Measurements" value={person.measurements} />}

            {/* Computed (from PersonaPhysical fold) */}
            {hasStatic && hasComputed && (
              <div className="col-span-full my-1 border-t border-white/10" />
            )}
            {currentState.currentHairColor && <InfoRow label="Current hair" value={<span className="capitalize">{currentState.currentHairColor}</span>} />}
            {currentState.weight !== null && currentState.weight !== undefined && <InfoRow label="Weight" value={`${currentState.weight} kg`} />}
            {currentState.build && <InfoRow label="Build" value={<span className="capitalize">{currentState.build}</span>} />}
            {currentState.visionAids && <InfoRow label="Vision aids" value={currentState.visionAids} />}
            {currentState.fitnessLevel && <InfoRow label="Fitness level" value={<span className="capitalize">{currentState.fitnessLevel}</span>} />}
          </dl>
        )}
      </SectionCard>

      {/* Body Marks */}
      <SectionCard
        title="Body Marks"
        icon={<Fingerprint size={18} />}
        badge={currentState.activeBodyMarks.length}
      >
        {currentState.activeBodyMarks.length === 0 ? (
          <EmptyState message="No body marks recorded." />
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {currentState.activeBodyMarks.map((mark) => (
              <BodyMarkCard key={mark.id} mark={mark} />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Career Tab ───────────────────────────────────────────────────────────────

function CareerTab({
  person,
  currentState,
  workHistory,
  affiliations,
}: {
  person: PersonData;
  currentState: PersonCurrentState;
  workHistory: PersonWorkHistoryItem[];
  affiliations: PersonAffiliation[];
}) {
  return (
    <div className="space-y-6">
      {/* Professional Summary */}
      {(person.activeSince || person.specialization || currentState.activeSkills.length > 0) && (
        <SectionCard title="Professional" icon={<Briefcase size={18} />}>
          <dl className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm">
            {person.activeSince && (
              <InfoRow label="Active since" value={person.activeSince} />
            )}
            {person.specialization && (
              <InfoRow label="Specialization" value={person.specialization} />
            )}
          </dl>
          {currentState.activeSkills.length > 0 && (
            <div className="space-y-2">
              {currentState.activeSkills.map((skill) => (
                <SkillItem key={skill.id} skill={skill} />
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* Work History */}
      <SectionCard
        title="Work History"
        icon={<Film size={18} />}
        badge={workHistory.length}
      >
        {workHistory.length === 0 ? (
          <EmptyState message="No work history recorded." />
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Title</th>
                  <th className="pb-2 pr-4 font-medium">Type</th>
                  <th className="pb-2 pr-4 font-medium">Role</th>
                  <th className="pb-2 pr-4 font-medium">Label</th>
                  <th className="pb-2 font-medium">Released</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {workHistory.map((item) => (
                  <tr key={item.setId} className="group transition-colors hover:bg-white/5">
                    <td className="py-2.5 pr-4">
                      <Link
                        href={`/sets/${item.setId}`}
                        className="font-medium text-foreground underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        {item.setTitle}
                      </Link>
                      {item.projectName && (
                        <p className="text-xs text-muted-foreground">{item.projectName}</p>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                          SET_TYPE_STYLES[item.setType],
                        )}
                      >
                        {item.setType === "photo" ? (
                          <Camera size={10} className="mr-1" />
                        ) : (
                          <Film size={10} className="mr-1" />
                        )}
                        {item.setType}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                          ROLE_STYLES[item.role],
                        )}
                      >
                        {ROLE_LABELS[item.role]}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground">
                      {item.labelName ?? <span className="opacity-40">&mdash;</span>}
                    </td>
                    <td className="py-2.5 whitespace-nowrap text-muted-foreground">
                      {item.releaseDate ? (
                        formatPartialDate(item.releaseDate, item.releaseDatePrecision)
                      ) : (
                        <span className="opacity-40">&mdash;</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Label Affiliations */}
      <SectionCard
        title="Label Affiliations"
        icon={<Network size={18} />}
        badge={affiliations.length}
      >
        {affiliations.length === 0 ? (
          <EmptyState message="No label affiliations." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {affiliations.map((aff) => (
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
  profileLabels,
}: {
  person: PersonData;
  photos: PhotoProps[];
  profileLabels: ProfileImageLabel[];
}) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <SectionCard title="Gallery" icon={<ImageIcon size={18} />} badge={photos.length}>
        {photos.length === 0 ? (
          <EmptyState message="No photos uploaded yet." />
        ) : (
          <JustifiedGallery
            photos={photos as PhotoWithUrls[]}
            entityType="person"
            entityId={person.id}
            profileLabels={profileLabels}
          />
        )}
      </SectionCard>
      <ImageUpload
        entityType="person"
        entityId={person.id}
        onUploadComplete={() => router.refresh()}
        currentCount={photos.length}
      />
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
}: PersonDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const tabs: { id: TabId; label: string; badge?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "appearance", label: "Appearance" },
    { id: "career", label: "Career", badge: workHistory.length || undefined },
    { id: "network", label: "Network", badge: connections.length || undefined },
    { id: "photos", label: "Photos", badge: photos.length || undefined },
  ];

  return (
    <div className="space-y-6">
      {/* Hero Card */}
      <HeroCard
        person={person}
        currentState={currentState}
        photos={photos}
        profileLabels={profileLabels}
        kpiCounts={{
          sets: workHistory.length,
          labels: affiliations.length,
          photos: photos.length,
          connections: connections.length,
        }}
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
          <OverviewTab person={person} currentState={currentState} />
        )}
      </div>
      <div
        id="tabpanel-appearance"
        role="tabpanel"
        aria-labelledby="tab-appearance"
        hidden={activeTab !== "appearance"}
      >
        {activeTab === "appearance" && (
          <AppearanceTab person={person} currentState={currentState} />
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
            currentState={currentState}
            workHistory={workHistory}
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
          <PhotosTab person={person} photos={photos} profileLabels={profileLabels} />
        )}
      </div>
    </div>
  );
}
