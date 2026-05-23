import { prisma } from "@/lib/db";
import type {
  PersonWithCommonAlias,
  PersonWorkHistoryItem,
  PersonAffiliation,
  PersonConnection,
  BodyMarkWithEvents,
  PersonDigitalIdentityItem,
  PersonSkillItem,
  PersonCurrentState,
  ExtensibleAttributeValue,
  SkillEventMediaThumb,
  PhotoVariants,
  PersonSessionWorkEntry,
  PersonProductionSession,
  SessionThumbnail,
} from "@/lib/types";
import { parsePhotoVariants } from "@/lib/types";
import type { PersonStatus, Prisma } from "@/generated/prisma/client";
import { normalizeForSearch } from "@/lib/normalize";
import { expandRegionFilter } from "@/lib/constants/body-regions";
import type { CreatePersonInput, UpdatePersonInput } from "@/lib/validations/person";
import { batchComputeCompleteness } from "@/lib/services/completeness-service";
import { refreshStatusesForIcgId } from "@/lib/services/import/participant-status-service";
import { ensureCatalogEntry } from "@/lib/services/color-catalog-service";
import { deriveInterval } from "@/lib/utils/event-interval";
import { recomputePersonCurrentState } from "@/lib/services/current-state-service";
import {
  cascadeDeleteSession,
  cascadeDeleteBodyModifications,
  cascadeDeleteCosmeticProcedures,
  cascadeDeletePersonExtras,
  cascadeDeleteRelationshipEvents,
  cascadeDeletePersonSkills,
} from "@/lib/services/cascade-helpers";

import { buildUrl } from "@/lib/media-url";
import { computeProductionAge } from "@/lib/utils";
import { CONFIDENCE_RANK } from "@/lib/constants/confidence";
import { buildBaselineLabel } from "@/lib/utils";

function mapSkillEventMedia(
  media: { mediaItem: { id: string; variants: unknown; fileRef: string | null; originalWidth: number; originalHeight: number } }[],
): SkillEventMediaThumb[] {
  return media.map((m) => {
    const variants = (m.mediaItem.variants as PhotoVariants) ?? {};
    const thumbUrl = variants.gallery_512
      ? buildUrl(variants.gallery_512)
      : m.mediaItem.fileRef
        ? buildUrl(m.mediaItem.fileRef)
        : "";
    return {
      id: m.mediaItem.id,
      thumbUrl,
      originalWidth: m.mediaItem.originalWidth,
      originalHeight: m.mediaItem.originalHeight,
    };
  });
}

/** Shared Prisma include fragment for skill events with media */
const skillEventInclude = {
  era: { select: { label: true, date: true } },
  media: {
    include: { mediaItem: { select: { id: true, variants: true, fileRef: true, originalWidth: true, originalHeight: true } } },
    orderBy: { sortOrder: "asc" as const },
  },
};

export type PersonSort =
  | "name-asc"
  | "name-desc"
  | "newest"
  | "oldest"
  | "age-asc"
  | "age-desc"
  | "rating-desc"
  | "updated"
  | "completeness-asc"
  | "completeness-desc";

export type PersonFilters = {
  q?: string;
  status?: PersonStatus | "all";
  naturalHairColor?: string;
  bodyType?: string;
  ethnicity?: string;
  bodyRegions?: string[];
  bodyRegionMatch?: "any" | "all";
  sort?: PersonSort;
  completeness?: "low" | "medium" | "high";
  birthdateFrom?: Date;
  birthdateTo?: Date;
  createdFrom?: Date;
  createdTo?: Date;
};

export async function getPersons(filters: PersonFilters = {}): Promise<PersonWithCommonAlias[]> {
  const { q, status, naturalHairColor, bodyType, ethnicity } = filters;

  const where: Prisma.PersonWhereInput = {};

  if (status && status !== "all") {
    where.status = status;
  }

  const currentStateWhere: Prisma.PersonCurrentStateWhereInput = {};
  if (naturalHairColor) {
    currentStateWhere.currentHairColor = { equals: naturalHairColor, mode: "insensitive" };
  }
  if (bodyType) {
    currentStateWhere.currentBuild = { equals: bodyType, mode: "insensitive" };
  }
  if (Object.keys(currentStateWhere).length > 0) {
    where.currentState = currentStateWhere;
  }

  if (ethnicity) {
    where.ethnicity = { equals: ethnicity, mode: "insensitive" };
  }

  if (q) {
    where.OR = [
      { icgId: { contains: q, mode: "insensitive" } },
      {
        aliases: {
          some: {
            name: { contains: q, mode: "insensitive" },
          },
        },
      },
    ];
  }

  const persons = await prisma.person.findMany({
    where,
    include: {
      aliases: {
        where: { OR: [{ isCommon: true }, { isBirth: true }] },
      },
      currentState: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return persons.map((p) => ({
    id: p.id,
    icgId: p.icgId,
    status: p.status,
    rating: p.rating,
    tags: p.tags,
    naturalHairColor: p.currentState?.currentHairColor ?? null,
    bodyType: p.currentState?.currentBuild ?? null,
    ethnicity: p.ethnicity,
    location: p.location,
    activeFrom: p.activeFrom,
    activeFromPrecision: p.activeFromPrecision,
    retiredAt: p.retiredAt,
    retiredAtPrecision: p.retiredAtPrecision,
    specialization: p.specialization,
    createdAt: p.createdAt,
    commonAlias: p.aliases.find((a) => a.isCommon)?.name ?? null,
    birthdate: p.birthdate,
    birthdatePrecision: p.birthdatePrecision,
    birthdateModifier: p.birthdateModifier ?? "EXACT",
    nationality: p.nationality,
    birthAlias: p.aliases.find((a) => a.isBirth)?.name ?? null,
    completeness: 0,
  }));
}

export async function getPersonById(id: string) {
  return prisma.person.findUnique({ where: { id } });
}

export async function getPersonWithDetails(id: string) {
  return prisma.person.findUnique({
    where: { id },
    include: {
      aliases: {
        orderBy: [{ isCommon: "desc" }, { isBirth: "desc" }, { name: "asc" }],
      },
      eras: {
        orderBy: [{ isBaseline: "desc" }, { date: "asc" }],
        include: {
          scalarDeltas: {
            include: {
              attributeDefinition: { include: { group: true } },
            },
            orderBy: { date: "asc" },
          },
          bodyMarkEvents: {
            include: { bodyMark: true },
            orderBy: { date: "asc" },
          },
          bodyModificationEvents: {
            include: { bodyModification: true },
            orderBy: { date: "asc" },
          },
          cosmeticProcedureEvents: {
            include: { cosmeticProcedure: true },
            orderBy: { date: "asc" },
          },
          digitalIdentities: {
            include: { events: { select: { date: true, eventType: true } } },
          },
        },
      },
      bodyMarks: true,
      bodyModifications: true,
      cosmeticProcedures: {
        include: {
          attributeDefinition: { select: { id: true, name: true, unit: true, group: { select: { name: true } } } },
        },
      },
      skills: {
        include: {
          era: { select: { label: true } },
          skillDefinition: {
            include: { group: { select: { name: true } } },
          },
          events: {
            include: skillEventInclude,
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });
}

export async function getPersonBodyMarks(personId: string): Promise<BodyMarkWithEvents[]> {
  const marks = await prisma.bodyMark.findMany({
    where: { personId },
    include: {
      events: {
        include: {
          era: { select: { id: true, label: true, date: true, datePrecision: true, isBaseline: true } },
        },
        orderBy: { date: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return marks.map((m) => {
    const events = m.events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      notes: e.notes,
      date: e.date,
      datePrecision: e.datePrecision,
      dateModifier: e.dateModifier,
      era: { id: e.era.id, label: e.era.label, date: e.era.date, datePrecision: e.era.datePrecision, isBaseline: e.era.isBaseline },
      bodyRegions: e.bodyRegions ?? [],
      motif: e.motif ?? null,
      colors: e.colors ?? [],
      size: e.size ?? null,
      description: e.description ?? null,
    }));
    return {
      id: m.id, type: m.type, bodyRegion: m.bodyRegion, bodyRegions: m.bodyRegions,
      side: m.side, position: m.position, description: m.description,
      motif: m.motif, colors: m.colors, size: m.size, status: m.status,
      heroVisible: m.heroVisible, heroOrder: m.heroOrder,
      events,
      computed: foldBodyMarkState(m, events),
    };
  });
}

export async function createBodyMarkRecord(data: import("@/lib/validations/body-mark").CreateBodyMarkInput) {
  return prisma.bodyMark.create({ data });
}

export async function updateBodyMarkRecord(id: string, data: Omit<import("@/lib/validations/body-mark").UpdateBodyMarkInput, "id">) {
  return prisma.bodyMark.update({ where: { id }, data });
}

export async function deleteBodyMarkRecord(id: string) {
  return prisma.$transaction(async (tx) => {
    await tx.bodyMarkEvent.deleteMany({ where: { bodyMarkId: id } });
    await tx.personMediaLink.deleteMany({ where: { bodyMarkId: id } });
    return tx.bodyMark.delete({ where: { id } });
  });
}

export async function createBodyMarkEventRecord(data: import("@/lib/validations/body-mark").CreateBodyMarkEventInput) {
  return prisma.bodyMarkEvent.create({ data });
}

export async function deleteBodyMarkEventRecord(id: string) {
  return prisma.$transaction(async (tx) => {
    const event = await tx.bodyMarkEvent.delete({ where: { id } });
    const remaining = await tx.bodyMarkEvent.count({
      where: { bodyMarkId: event.bodyMarkId },
    });
    if (remaining === 0) {
      await tx.personMediaLink.deleteMany({ where: { bodyMarkId: event.bodyMarkId } });
      await tx.bodyMark.delete({ where: { id: event.bodyMarkId } });
    }
    return event;
  });
}

// Re-export from dedicated service for backward compatibility
import { getPersonDigitalIdentities } from "./digital-identity-service";
export { getPersonDigitalIdentities };

export async function getPersonSkills(personId: string): Promise<PersonSkillItem[]> {
  const skills = await prisma.personSkill.findMany({
    where: { personId },
    include: {
      era: { select: { label: true } },
      skillDefinition: {
        include: { group: { select: { name: true } } },
      },
      events: {
        include: skillEventInclude,
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return skills.map((s) => {
    const { validFrom, validTo } = deriveInterval(s.events);
    return {
    id: s.id,
    name: s.name,
    category: s.category,
    level: s.level,
    evidence: s.evidence,
    validFrom,
    validTo,
    eraLabel: s.era?.label ?? null,
    skillDefinitionId: s.skillDefinitionId,
    groupName: s.skillDefinition?.group.name ?? null,
    definitionName: s.skillDefinition?.name ?? null,
    definitionDescription: s.skillDefinition?.description ?? null,
    definitionPgrade: s.skillDefinition?.pgrade ?? null,
    events: s.events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      level: e.level,
      notes: e.notes,
      date: e.date,
      datePrecision: e.datePrecision,
      eraLabel: e.era?.label ?? null,
      eraDate: e.era?.date ?? null,
      media: mapSkillEventMedia(e.media),
    })),
  };
  });
}

export async function getPersonWorkHistory(personId: string): Promise<PersonWorkHistoryItem[]> {
  const participants = await prisma.setParticipant.findMany({
    where: { personId },
    include: {
      roleDefinition: true,
      set: {
        include: {
          channel: {
            include: { labelMaps: { include: { label: true } } },
          },
        },
      },
    },
  });

  return participants
    .sort((a, b) => {
      const aDate = a.set.releaseDate?.getTime() ?? 0;
      const bDate = b.set.releaseDate?.getTime() ?? 0;
      return bDate - aDate;
    })
    .map((p) => ({
      setId: p.set.id,
      setTitle: p.set.title,
      setType: p.set.type,
      role: p.roleDefinition.name,
      releaseDate: p.set.releaseDate,
      releaseDatePrecision: p.set.releaseDatePrecision,
      channelName: p.set.channel?.name ?? null,
      labelId: p.set.channel?.labelMaps[0]?.label.id ?? null,
      labelName: p.set.channel?.labelMaps[0]?.label.name ?? null,
      confidence: p.confidence,
      confidenceSource: p.confidenceSource,
    }));
}

function buildSessionThumbnails(
  mediaItems: { id: string; variants: unknown; fileRef: string | null; originalWidth: number; originalHeight: number }[],
  limit: number,
): SessionThumbnail[] {
  const results: SessionThumbnail[] = [];
  for (const item of mediaItems) {
    if (results.length >= limit) break;
    const variants = (item.variants ?? {}) as PhotoVariants;
    const url = variants.gallery_512
      ? buildUrl(variants.gallery_512)
      : variants.original
        ? buildUrl(variants.original)
        : item.fileRef
          ? buildUrl(item.fileRef)
          : null;
    if (url) {
      results.push({ id: item.id, url, width: item.originalWidth, height: item.originalHeight });
    }
  }
  return results;
}

export async function getPersonSessionWorkHistory(personId: string): Promise<PersonSessionWorkEntry[]> {
  const [person, contributions] = await Promise.all([
    prisma.person.findUnique({
      where: { id: personId },
      select: { birthdate: true, birthdatePrecision: true },
    }),
    prisma.sessionContribution.findMany({
      where: {
        personId,
        session: { type: "PRODUCTION" },
      },
      include: {
        roleDefinition: { select: { name: true } },
        session: {
          include: {
            label: { select: { id: true, name: true } },
            mediaItems: {
              take: 6,
              orderBy: { createdAt: "asc" },
              select: { id: true, variants: true, fileRef: true, originalWidth: true, originalHeight: true },
            },
            _count: { select: { mediaItems: true } },
            setSessionLinks: {
              include: {
                set: {
                  include: {
                    channel: { select: { name: true } },
                  },
                },
              },
              orderBy: { isPrimary: "desc" },
            },
          },
        },
      },
    }),
  ]);

  // Group by sessionId to merge multiple roles (keep highest confidence)
  const sessionMap = new Map<string, PersonSessionWorkEntry>();
  for (const c of contributions) {
    const s = c.session;
    const existing = sessionMap.get(s.id);
    if (existing) {
      if (!existing.roles.includes(c.roleDefinition.name)) {
        existing.roles.push(c.roleDefinition.name);
      }
      // Keep highest confidence across roles
      if (CONFIDENCE_RANK[c.confidence] > CONFIDENCE_RANK[existing.confidence]) {
        existing.confidence = c.confidence;
        existing.confidenceSource = c.confidenceSource;
      }
    } else {
      const primarySet = s.setSessionLinks[0]?.set ?? null;
      const ageAtProduction = person
        ? computeProductionAge(
            person.birthdate,
            person.birthdatePrecision,
            s.date,
            s.datePrecision,
            s.dateIsConfirmed,
            primarySet?.releaseDate ?? null,
            primarySet?.releaseDatePrecision,
          )
        : "";
      sessionMap.set(s.id, {
        sessionId: s.id,
        sessionName: s.name,
        sessionDate: s.date,
        sessionDatePrecision: s.datePrecision,
        sessionDateIsConfirmed: s.dateIsConfirmed,
        labelId: s.label?.id ?? null,
        labelName: s.label?.name ?? null,
        roles: [c.roleDefinition.name],
        mediaCount: s._count.mediaItems,
        thumbnails: buildSessionThumbnails(s.mediaItems, 6),
        linkedSets: s.setSessionLinks.map((link) => ({
          setId: link.set.id,
          title: link.set.title,
          type: link.set.type,
          releaseDate: link.set.releaseDate,
          releaseDatePrecision: link.set.releaseDatePrecision,
          channelName: link.set.channel?.name ?? null,
        })),
        ageAtProduction,
        confidence: c.confidence,
        confidenceSource: c.confidenceSource,
        eraId: c.eraId,
      });
    }
  }

  return Array.from(sessionMap.values()).sort((a, b) => {
    const aTime = a.sessionDate?.getTime() ?? 0;
    const bTime = b.sessionDate?.getTime() ?? 0;
    return bTime - aTime;
  });
}

export async function getPersonProductionSessions(personId: string): Promise<PersonProductionSession[]> {
  const contributions = await prisma.sessionContribution.findMany({
    where: {
      personId,
      session: { type: "PRODUCTION" },
    },
    include: {
      roleDefinition: { select: { name: true } },
      session: {
        include: {
          label: { select: { name: true } },
          mediaItems: {
            take: 3,
            orderBy: { createdAt: "asc" },
            select: { id: true, variants: true, fileRef: true, originalWidth: true, originalHeight: true },
          },
          _count: { select: { mediaItems: true } },
        },
      },
    },
  });

  const sessionMap = new Map<string, PersonProductionSession>();
  for (const c of contributions) {
    const s = c.session;
    const existing = sessionMap.get(s.id);
    if (existing) {
      if (!existing.roles.includes(c.roleDefinition.name)) {
        existing.roles.push(c.roleDefinition.name);
      }
      if (CONFIDENCE_RANK[c.confidence] > CONFIDENCE_RANK[existing.confidence]) {
        existing.confidence = c.confidence;
        existing.confidenceSource = c.confidenceSource;
      }
    } else {
      sessionMap.set(s.id, {
        sessionId: s.id,
        sessionName: s.name,
        sessionDate: s.date,
        sessionDatePrecision: s.datePrecision,
        labelName: s.label?.name ?? null,
        roles: [c.roleDefinition.name],
        mediaCount: s._count.mediaItems,
        previewThumbnails: buildSessionThumbnails(s.mediaItems, 3),
        confidence: c.confidence,
        confidenceSource: c.confidenceSource,
      });
    }
  }

  return Array.from(sessionMap.values()).sort((a, b) => {
    const aTime = a.sessionDate?.getTime() ?? 0;
    const bTime = b.sessionDate?.getTime() ?? 0;
    return bTime - aTime;
  });
}

// ─── Event-carried state fold helpers ────────────────────────────────────────

function foldBodyMarkState(
  base: { bodyRegions: string[]; motif: string | null; colors: string[]; size: string | null; description: string | null },
  events: { bodyRegions: string[]; motif: string | null; colors: string[]; size: string | null; description: string | null }[],
) {
  const result = { bodyRegions: base.bodyRegions, motif: base.motif, colors: base.colors, size: base.size, description: base.description };
  for (const e of events) {
    if (e.bodyRegions.length > 0) result.bodyRegions = e.bodyRegions;
    if (e.motif !== null) result.motif = e.motif;
    if (e.colors.length > 0) result.colors = e.colors;
    if (e.size !== null) result.size = e.size;
    if (e.description !== null) result.description = e.description;
  }
  return result;
}

function foldBodyModificationState(
  base: { bodyRegions: string[]; description: string | null; material: string | null; gauge: string | null },
  events: { bodyRegions: string[]; description: string | null; material: string | null; gauge: string | null }[],
) {
  const result = { bodyRegions: base.bodyRegions, description: base.description, material: base.material, gauge: base.gauge };
  for (const e of events) {
    if (e.bodyRegions.length > 0) result.bodyRegions = e.bodyRegions;
    if (e.description !== null) result.description = e.description;
    if (e.material !== null) result.material = e.material;
    if (e.gauge !== null) result.gauge = e.gauge;
  }
  return result;
}

function foldCosmeticProcedureState(
  base: { bodyRegions: string[]; description: string | null; provider: string | null },
  events: { bodyRegions: string[]; description: string | null; provider: string | null; valueAfter?: string | null; unit?: string | null }[],
) {
  const result: { bodyRegions: string[]; description: string | null; provider: string | null; valueAfter: string | null; unit: string | null } = {
    bodyRegions: base.bodyRegions, description: base.description, provider: base.provider,
    valueAfter: null, unit: null,
  };
  for (const e of events) {
    if (e.bodyRegions.length > 0) result.bodyRegions = e.bodyRegions;
    if (e.description !== null) result.description = e.description;
    if (e.provider !== null) result.provider = e.provider;
    if (e.valueAfter !== undefined && e.valueAfter !== null) result.valueAfter = e.valueAfter;
    if (e.unit !== undefined && e.unit !== null) result.unit = e.unit;
  }
  return result;
}

// The five legacy scalars now live in the attribute catalog as ScalarDeltas.
export const CORE_ATTR = {
  hairColor: "cattr-hair-color",
  weight: "cattr-weight",
  build: "cattr-build",
  breastSize: "cattr-breast-size",
  measurements: "cattr-measurements",
} as const;
const CORE_ATTR_IDS = new Set<string>(Object.values(CORE_ATTR));

type FoldableEra = {
  isBaseline: boolean;
  date: Date | null;
  scalarDeltas: Array<{
    value: string;
    date: Date | null;
    notes: string | null;
    createdAt: Date;
    attributeDefinitionId: string;
    attributeDefinition: { unit: string | null; name: string; group: { name: string } };
  }>;
};

/**
 * Fold a person's scalar deltas → the latest value per attribute definition.
 *
 * Implements the canonical fold from `docs/adr/0001-eras-and-delta-fold.md`
 * (§ fold sort order). Winner-take-all across all deltas of the same attribute:
 *   1. Baseline is the floor — any non-baseline delta beats baseline.
 *   2. Later effective date wins (effective date = `delta.date ?? era.date`).
 *   3. Within non-baseline, undated loses to any dated delta.
 *   4. Tiebreaker: later `createdAt` wins.
 *
 * Strategy: sort baseline/oldest first, then iterate with last-write-wins
 * overwrite. Mirrors the SQL fold in `app_recompute_person_current_state()`
 * (migration 20260522000002), which sorts the opposite way and picks
 * `row_number() = 1`. Same outcome — when changing one, audit the other.
 */
export function foldScalarDeltas<E extends FoldableEra>(
  eras: E[],
  opts?: { asOf?: Date | null },
) {
  const asOf = opts?.asOf ?? null;
  const all = eras.flatMap((e) =>
    e.scalarDeltas
      .filter((d) => d.value.trim() !== "")
      .map((d) => ({ d, baseline: e.isBaseline, eraDate: e.date })),
  );
  // Point-in-time mode: drop any delta whose effective date is strictly after
  // asOf. Baseline + undated deltas are always kept (they have no commitment
  // to a future date). This is ADR-0004's "appearance-at-shoot" snapshot.
  const filtered = asOf
    ? all.filter(({ d, baseline, eraDate }) => {
        if (baseline) return true;
        const eff = d.date ?? eraDate;
        return !eff || eff <= asOf;
      })
    : all;
  filtered.sort((a, b) => {
    if (a.baseline !== b.baseline) return a.baseline ? -1 : 1;
    const ad = a.d.date ?? a.eraDate;
    const bd = b.d.date ?? b.eraDate;
    if (ad && bd && ad.getTime() !== bd.getTime()) return ad.getTime() - bd.getTime();
    if (!ad && bd) return -1;
    if (ad && !bd) return 1;
    return a.d.createdAt.getTime() - b.d.createdAt.getTime();
  });
  const folded: Record<string, E["scalarDeltas"][number]> = {};
  for (const { d } of filtered) folded[d.attributeDefinitionId] = d;
  return folded;
}

/**
 * Appearance-at-shoot snapshot — the scalar fold up to a point in time.
 * Used by participant cards on session/set detail pages to show "this is what
 * the person looked like at the shoot" without paging the whole person.
 *
 * `asOf` is typically derived from the linked Era's latest member-delta date
 * (or the session date as a fallback). Body marks / modifications / cosmetic
 * procedures are not folded here — their point-in-time status is a separate
 * concern best handled by replaying events against their projection.
 *
 * ADR-0004 (era-linked participation) + ADR-0001 (date-ordered fold).
 */
export type AppearanceSnapshot = {
  hairColor: string | null;
  weight: number | null;
  build: string | null;
  breastSize: string | null;
  measurements: string | null;
  extensibleAttributes: Record<string, ExtensibleAttributeValue>;
};

export function deriveAppearanceAtShoot<E extends FoldableEra>(
  eras: E[],
  asOf: Date | null,
): AppearanceSnapshot {
  const folded = foldScalarDeltas(eras, { asOf });
  const weightRaw = folded[CORE_ATTR.weight]?.value;
  const extensibleAttributes: Record<string, ExtensibleAttributeValue> = {};
  for (const [defId, d] of Object.entries(folded)) {
    if (CORE_ATTR_IDS.has(defId)) continue;
    extensibleAttributes[defId] = {
      value: d.value,
      unit: d.attributeDefinition.unit,
      name: d.attributeDefinition.name,
      groupName: d.attributeDefinition.group.name,
      status: "NATURAL" as import("@/lib/types").AttributeStatus,
    };
  }
  return {
    hairColor: folded[CORE_ATTR.hairColor]?.value ?? null,
    weight: weightRaw && !Number.isNaN(Number(weightRaw)) ? Number(weightRaw) : null,
    build: folded[CORE_ATTR.build]?.value ?? null,
    breastSize: folded[CORE_ATTR.breastSize]?.value ?? null,
    measurements: folded[CORE_ATTR.measurements]?.value ?? null,
    extensibleAttributes,
  };
}

/**
 * Pick the Era whose member-date range best contains the given session date.
 * Conservative heuristic: the latest non-baseline Era whose anchor date is
 * ≤ `sessionDate`. Falls back to the baseline (dateless) Era. Used to default
 * the Era picker in the contribution UI (ADR-0004).
 */
export function defaultEraForSessionDate<E extends FoldableEra & { id: string }>(
  eras: E[],
  sessionDate: Date | null,
): E | null {
  if (eras.length === 0) return null;
  const baseline = eras.find((e) => e.isBaseline) ?? null;
  if (!sessionDate) return baseline;
  const candidates = eras
    .filter((e) => !e.isBaseline && e.date && e.date <= sessionDate)
    .sort((a, b) => (b.date!.getTime() - a.date!.getTime()));
  return candidates[0] ?? baseline;
}

/**
 * Derives current physical state from an already-loaded person with details.
 * Pure sync function — no DB access.
 */
export function deriveCurrentState(
  person: NonNullable<Awaited<ReturnType<typeof getPersonWithDetails>>>,
): PersonCurrentState {
  const folded = foldScalarDeltas(person.eras);
  const currentHairColor = folded[CORE_ATTR.hairColor]?.value ?? null;
  const weightRaw = folded[CORE_ATTR.weight]?.value;
  const weight = weightRaw && !Number.isNaN(Number(weightRaw)) ? Number(weightRaw) : null;
  const build = folded[CORE_ATTR.build]?.value ?? null;
  const breastSize = folded[CORE_ATTR.breastSize]?.value ?? null;
  const breastDescription = folded[CORE_ATTR.breastSize]?.notes ?? null;
  const measurements = folded[CORE_ATTR.measurements]?.value ?? null;
  let breastStatus: string | null = null; // derived from cosmetic procedures below

  // Every non-core scalar delta becomes an extensible attribute.
  const extensibleAttributes: Record<string, ExtensibleAttributeValue> = {};
  for (const [defId, d] of Object.entries(folded)) {
    if (CORE_ATTR_IDS.has(defId)) continue;
    extensibleAttributes[defId] = {
      value: d.value,
      unit: d.attributeDefinition.unit,
      name: d.attributeDefinition.name,
      groupName: d.attributeDefinition.group.name,
      status: "NATURAL" as import("@/lib/types").AttributeStatus,
    };
  }


  // ── Body Marks ──
  const activeBodyMarks: BodyMarkWithEvents[] = [];
  const seenMarkIds = new Set<string>();
  for (const era of person.eras) {
    for (const event of era.bodyMarkEvents) {
      if (seenMarkIds.has(event.bodyMark.id)) continue;
      seenMarkIds.add(event.bodyMark.id);
      const mark = event.bodyMark;
      const allEvents: import("@/lib/types").BodyMarkEventItem[] = person.eras.flatMap((p) =>
        p.bodyMarkEvents
          .filter((e) => e.bodyMark.id === mark.id)
          .map((e) => ({
            id: e.id,
            eventType: e.eventType,
            notes: e.notes,
            date: e.date,
            datePrecision: e.datePrecision,
            dateModifier: e.dateModifier,
            era: { id: p.id, label: p.label, date: p.date, datePrecision: p.datePrecision, isBaseline: p.isBaseline },
            bodyRegions: e.bodyRegions ?? [],
            motif: e.motif ?? null,
            colors: e.colors ?? [],
            size: e.size ?? null,
            description: e.description ?? null,
          })),
      ).sort((a, b) => {
        const aTime = (a.date ?? a.era.date)?.getTime() ?? 0;
        const bTime = (b.date ?? b.era.date)?.getTime() ?? 0;
        return aTime - bTime;
      });
      activeBodyMarks.push({
        id: mark.id, type: mark.type, bodyRegion: mark.bodyRegion, bodyRegions: mark.bodyRegions,
        side: mark.side, position: mark.position, description: mark.description,
        motif: mark.motif, colors: mark.colors, size: mark.size, status: mark.status,
        heroVisible: mark.heroVisible, heroOrder: mark.heroOrder,
        events: allEvents,
        computed: foldBodyMarkState(mark, allEvents),
      });
    }
  }
  for (const mark of person.bodyMarks) {
    if (seenMarkIds.has(mark.id)) continue;
    activeBodyMarks.push({
      id: mark.id, type: mark.type, bodyRegion: mark.bodyRegion, bodyRegions: mark.bodyRegions,
      side: mark.side, position: mark.position, description: mark.description,
      motif: mark.motif, colors: mark.colors, size: mark.size, status: mark.status,
      heroVisible: mark.heroVisible, heroOrder: mark.heroOrder,
      events: [],
      computed: { bodyRegions: mark.bodyRegions, motif: mark.motif, colors: mark.colors, size: mark.size, description: mark.description },
    });
  }

  // ── Body Modifications ──
  const activeBodyModifications: import("@/lib/types").BodyModificationWithEvents[] = [];
  const seenModIds = new Set<string>();
  for (const era of person.eras) {
    for (const event of era.bodyModificationEvents) {
      if (seenModIds.has(event.bodyModification.id)) continue;
      seenModIds.add(event.bodyModification.id);
      const mod = event.bodyModification;
      const allEvents: import("@/lib/types").BodyModificationEventItem[] = person.eras.flatMap((p) =>
        p.bodyModificationEvents
          .filter((e) => e.bodyModification.id === mod.id)
          .map((e) => ({
            id: e.id,
            eventType: e.eventType,
            notes: e.notes,
            date: e.date,
            datePrecision: e.datePrecision,
            dateModifier: e.dateModifier,
            era: { id: p.id, label: p.label, date: p.date, datePrecision: p.datePrecision, isBaseline: p.isBaseline },
            bodyRegions: e.bodyRegions ?? [],
            description: e.description ?? null,
            material: e.material ?? null,
            gauge: e.gauge ?? null,
          })),
      ).sort((a, b) => {
        const aTime = (a.date ?? a.era.date)?.getTime() ?? 0;
        const bTime = (b.date ?? b.era.date)?.getTime() ?? 0;
        return aTime - bTime;
      });
      activeBodyModifications.push({
        id: mod.id, type: mod.type, bodyRegion: mod.bodyRegion, bodyRegions: mod.bodyRegions,
        side: mod.side, position: mod.position, description: mod.description,
        material: mod.material, gauge: mod.gauge, status: mod.status,
        heroVisible: mod.heroVisible, heroOrder: mod.heroOrder,
        events: allEvents,
        computed: foldBodyModificationState(mod, allEvents),
      });
    }
  }
  for (const mod of person.bodyModifications) {
    if (seenModIds.has(mod.id)) continue;
    activeBodyModifications.push({
      id: mod.id, type: mod.type, bodyRegion: mod.bodyRegion, bodyRegions: mod.bodyRegions,
      side: mod.side, position: mod.position, description: mod.description,
      material: mod.material, gauge: mod.gauge, status: mod.status,
      heroVisible: mod.heroVisible, heroOrder: mod.heroOrder,
      events: [],
      computed: { bodyRegions: mod.bodyRegions, description: mod.description, material: mod.material, gauge: mod.gauge },
    });
  }

  // ── Cosmetic Procedures ──
  const activeCosmeticProcedures: import("@/lib/types").CosmeticProcedureWithEvents[] = [];
  const seenProcIds = new Set<string>();
  for (const era of person.eras) {
    for (const event of era.cosmeticProcedureEvents) {
      if (seenProcIds.has(event.cosmeticProcedure.id)) continue;
      seenProcIds.add(event.cosmeticProcedure.id);
      const proc = event.cosmeticProcedure;
      const allEvents: import("@/lib/types").CosmeticProcedureEventItem[] = person.eras.flatMap((p) =>
        p.cosmeticProcedureEvents
          .filter((e) => e.cosmeticProcedure.id === proc.id)
          .map((e) => ({
            id: e.id,
            eventType: e.eventType,
            notes: e.notes,
            date: e.date,
            datePrecision: e.datePrecision,
            dateModifier: e.dateModifier,
            era: { id: p.id, label: p.label, date: p.date, datePrecision: p.datePrecision, isBaseline: p.isBaseline },
            bodyRegions: e.bodyRegions ?? [],
            description: e.description ?? null,
            provider: e.provider ?? null,
            valueBefore: e.valueBefore ?? null,
            valueAfter: e.valueAfter ?? null,
            unit: e.unit ?? null,
          })),
      ).sort((a, b) => {
        const aTime = (a.date ?? a.era.date)?.getTime() ?? 0;
        const bTime = (b.date ?? b.era.date)?.getTime() ?? 0;
        return aTime - bTime;
      });
      activeCosmeticProcedures.push({
        id: proc.id, type: proc.type, bodyRegion: proc.bodyRegion, bodyRegions: proc.bodyRegions,
        description: proc.description, provider: proc.provider, status: proc.status,
        attributeDefinitionId: proc.attributeDefinitionId,
        heroVisible: proc.heroVisible, heroOrder: proc.heroOrder,
        events: allEvents,
        computed: foldCosmeticProcedureState(proc, allEvents),
      });
    }
  }
  for (const proc of person.cosmeticProcedures) {
    if (seenProcIds.has(proc.id)) continue;
    activeCosmeticProcedures.push({
      id: proc.id, type: proc.type, bodyRegion: proc.bodyRegion, bodyRegions: proc.bodyRegions,
      description: proc.description, provider: proc.provider, status: proc.status,
      attributeDefinitionId: proc.attributeDefinitionId,
      heroVisible: proc.heroVisible, heroOrder: proc.heroOrder,
      events: [],
      computed: { bodyRegions: proc.bodyRegions, description: proc.description, provider: proc.provider, valueAfter: null, unit: null },
    });
  }

  const activeDigitalIdentities: PersonDigitalIdentityItem[] = [];
  for (const era of person.eras) {
    for (const i of era.digitalIdentities) {
      if (i.status !== "active") continue;
      const { validFrom, validTo, active } = deriveInterval(i.events);
      if (!active) continue;
      activeDigitalIdentities.push({
        id: i.id,
        platform: i.platform,
        handle: i.handle,
        url: i.url,
        status: i.status,
        validFrom,
        validTo,
        eraLabel: era.label,
      });
    }
  }

  const activeSkills: PersonSkillItem[] = [];
  for (const s of person.skills) {
    const { validFrom: skillFrom, validTo: skillTo, active: skillActive } = deriveInterval(s.events);
    if (!skillActive) continue;
    activeSkills.push({
      id: s.id,
      name: s.name,
      category: s.category,
      level: s.level,
      evidence: s.evidence,
      validFrom: skillFrom,
      validTo: skillTo,
      eraLabel: s.era?.label ?? null,
      skillDefinitionId: s.skillDefinitionId,
      groupName: s.skillDefinition?.group.name ?? null,
      definitionName: s.skillDefinition?.name ?? null,
      definitionDescription: s.skillDefinition?.description ?? null,
      definitionPgrade: s.skillDefinition?.pgrade ?? null,
      events: s.events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        level: e.level,
        notes: e.notes,
        date: e.date,
        datePrecision: e.datePrecision,
        eraLabel: e.era?.label ?? null,
        eraDate: e.era?.date ?? null,
        media: "media" in e ? mapSkillEventMedia(e.media as Parameters<typeof mapSkillEventMedia>[0]) : [],
      })),
    });
  }

  // Derive attribute status from cosmetic procedures targeting attributes.
  for (const proc of activeCosmeticProcedures) {
    if (!proc.attributeDefinitionId) continue;
    const defId = proc.attributeDefinitionId;
    const lastEventType = proc.events.length > 0
      ? proc.events[proc.events.length - 1].eventType
      : null;
    const isReversed = lastEventType === "reversed";
    const derivedStatus: import("@/lib/types").AttributeStatus = isReversed ? "RESTORED" : "ENHANCED";

    // breast_size is a core scalar — its status surfaces as breastStatus.
    if (defId === CORE_ATTR.breastSize) {
      breastStatus = isReversed ? "natural" : "enhanced";
      continue;
    }
    if (CORE_ATTR_IDS.has(defId)) continue; // other core scalars carry no status

    if (extensibleAttributes[defId]) {
      extensibleAttributes[defId].status = derivedStatus;
    } else {
      // Procedure targets an attribute not yet in the fold — create it from procedure data
      const procDef = person.cosmeticProcedures.find((p) => p.id === proc.id);
      const attrDef = procDef?.attributeDefinition;
      if (attrDef) {
        extensibleAttributes[defId] = {
          value: proc.computed.valueAfter ?? "",
          unit: attrDef.unit,
          name: attrDef.name,
          groupName: attrDef.group.name,
          status: derivedStatus,
        };
      }
    }
  }

  // A known breast size with no procedure folds to "natural".
  if (breastStatus === null && breastSize !== null) breastStatus = "natural";

  return {
    currentHairColor,
    weight,
    build,
    breastSize,
    breastStatus,
    breastDescription,
    measurements,
    extensibleAttributes,
    activeBodyMarks,
    activeBodyModifications,
    activeCosmeticProcedures,
    activeDigitalIdentities,
    activeSkills,
  };
}

/**
 * Derives label affiliations from already-loaded work history items.
 * Pure sync function — no DB access. Replaces the async `getPersonAffiliations`.
 */
export function deriveAffiliations(workHistory: PersonWorkHistoryItem[]): PersonAffiliation[] {
  const labelMap = new Map<string, PersonAffiliation>();
  for (const item of workHistory) {
    if (!item.labelId || !item.labelName) continue;
    const existing = labelMap.get(item.labelId);
    if (existing) {
      existing.setCount++;
    } else {
      labelMap.set(item.labelId, {
        labelId: item.labelId,
        labelName: item.labelName,
        setCount: 1,
      });
    }
  }
  return Array.from(labelMap.values()).sort((a, b) => b.setCount - a.setCount);
}

export async function getPersonAffiliations(personId: string): Promise<PersonAffiliation[]> {
  const participants = await prisma.setParticipant.findMany({
    where: { personId },
    include: {
      set: {
        include: {
          channel: { include: { labelMaps: { include: { label: true } } } },
        },
      },
    },
  });

  const labelMap = new Map<string, PersonAffiliation>();
  for (const p of participants) {
    const labelMaps = p.set.channel?.labelMaps ?? [];
    for (const lm of labelMaps) {
      const label = lm.label;
      const existing = labelMap.get(label.id);
      if (existing) {
        existing.setCount++;
      } else {
        labelMap.set(label.id, {
          labelId: label.id,
          labelName: label.name,
          setCount: 1,
        });
      }
    }
  }

  return Array.from(labelMap.values()).sort((a, b) => b.setCount - a.setCount);
}

export async function getPersonConnections(personId: string): Promise<PersonConnection[]> {
  const relationships = await prisma.personRelationship.findMany({
    where: {
      OR: [{ personAId: personId }, { personBId: personId }],
    },
    include: {
      personA: {
        include: {
          aliases: { where: { isCommon: true }, take: 1 },
        },
      },
      personB: {
        include: {
          aliases: { where: { isCommon: true }, take: 1 },
        },
      },
    },
    orderBy: { sharedSetCount: "desc" },
  });

  return relationships
    .map((r) => {
      const other = r.personAId === personId ? r.personB : r.personA;
      return {
        personId: other.id,
        icgId: other.icgId,
        commonAlias: other.aliases[0]?.name ?? null,
        sharedSetCount: r.sharedSetCount,
        source: r.source,
        label: r.label,
      };
    });
}

export async function countPersons(): Promise<number> {
  return prisma.person.count();
}

export async function createPersonRecord(data: CreatePersonInput) {
  // Ensure any color values arriving via free-text input land in the catalog
  // (idempotent — existing entries are untouched; new ones get heuristic
  // defaults + needs_review flag so the admin can refine later)
  await Promise.all([
    ensureCatalogEntry("hair", data.currentHairColor),
    ensureCatalogEntry("eye",  data.eyeColor),
  ]);
  const person = await prisma.$transaction(async (tx) => {
    const person = await tx.person.create({
      data: {
        icgId: data.icgId,
        status: data.status,
        sexAtBirth: data.sexAtBirth,
        birthdate: data.birthdate ? new Date(data.birthdate) : undefined,
        birthdatePrecision: data.birthdatePrecision ?? "UNKNOWN",
        birthdateModifier: data.birthdateModifier ?? "EXACT",
        birthdateSource: data.birthdateSource || undefined,
        birthPlace: data.birthPlace,
        nationality: data.nationality,
        ethnicity: data.ethnicity,
        eyeColor: data.eyeColor,
        height: data.height,
      },
    });

    await tx.personAlias.create({
      data: { personId: person.id, name: data.commonName, nameNorm: normalizeForSearch(data.commonName), isCommon: true },
    });

    if (data.birthName) {
      await tx.personAlias.create({
        data: { personId: person.id, name: data.birthName, nameNorm: normalizeForSearch(data.birthName), isBirth: true },
      });
    }

    // The baseline Era is dateless — "time zero". It is always folded first by
    // virtue of isBaseline; no synthetic date is anchored (see ADR-0001).
    const era = await tx.era.create({
      data: {
        personId: person.id,
        label: buildBaselineLabel(data.commonName),
        isBaseline: true,
      },
    });

    // Baseline physical attributes become dateless ScalarDeltas on the baseline era.
    const baselineDeltas: { attributeDefinitionId: string; value: string; notes: string | null }[] = [];
    if (data.currentHairColor)
      baselineDeltas.push({ attributeDefinitionId: CORE_ATTR.hairColor, value: data.currentHairColor, notes: null });
    if (data.weight !== undefined && data.weight !== null)
      baselineDeltas.push({ attributeDefinitionId: CORE_ATTR.weight, value: String(data.weight), notes: null });
    if (data.build)
      baselineDeltas.push({ attributeDefinitionId: CORE_ATTR.build, value: data.build, notes: null });
    if (data.breastSize)
      baselineDeltas.push({ attributeDefinitionId: CORE_ATTR.breastSize, value: data.breastSize, notes: data.breastDescription ?? null });
    if (data.hairLength) {
      const hairLengthDef = await tx.physicalAttributeDefinition.findFirst({
        where: { slug: "hair-length" },
        select: { id: true },
      });
      if (hairLengthDef)
        baselineDeltas.push({ attributeDefinitionId: hairLengthDef.id, value: data.hairLength, notes: null });
    }
    if (baselineDeltas.length > 0) {
      await tx.scalarDelta.createMany({
        data: baselineDeltas.map((d) => ({ eraId: era.id, ...d })),
      });
    }

    // Auto-create REFERENCE session for this person
    const displayName = data.commonName || data.icgId;
    await tx.session.create({
      data: {
        name: displayName,
        nameNorm: normalizeForSearch(displayName),
        type: "REFERENCE",
        status: "CONFIRMED",
        personId: person.id,
      },
    });

    await recomputePersonCurrentState(tx, person.id);
    return person;
  });

  // Refresh participant statuses on staging sets that reference this icgId
  refreshStatusesForIcgId(data.icgId).catch(() => {});

  return person;
}

export async function updatePersonRecord(id: string, data: UpdatePersonInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.person.update({
      where: { id },
      data: {
        status: data.status,
        sexAtBirth: data.sexAtBirth,
        birthdate: data.birthdate ? new Date(data.birthdate) : null,
        birthdatePrecision: data.birthdatePrecision ?? "UNKNOWN",
        birthdateModifier: data.birthdateModifier ?? "EXACT",
        birthdateSource: data.birthdateSource || null,
        birthPlace: data.birthPlace,
        nationality: data.nationality,
        ethnicity: data.ethnicity,
        location: data.location,
        notes: data.notes,
        activeFrom: data.activeFrom ? new Date(data.activeFrom) : null,
        activeFromPrecision: data.activeFromPrecision ?? "UNKNOWN",
        activeFromModifier: data.activeFromModifier ?? "EXACT",
        activeFromSource: data.activeFromSource || null,
        retiredAt: data.retiredAt ? new Date(data.retiredAt) : null,
        retiredAtPrecision: data.retiredAtPrecision ?? "UNKNOWN",
        retiredAtModifier: data.retiredAtModifier ?? "EXACT",
        retiredAtSource: data.retiredAtSource || null,
        specialization: data.specialization,
        rating: data.rating,
        pgrade: data.pgrade,
      },
    });

    // Update common alias if provided
    if (data.commonName !== undefined) {
      const commonAlias = await tx.personAlias.findFirst({
        where: { personId: id, isCommon: true },
      });
      if (commonAlias) {
        await tx.personAlias.update({
          where: { id: commonAlias.id },
          data: { name: data.commonName, nameNorm: normalizeForSearch(data.commonName) },
        });
      }
    }
  });
}

export async function updatePersonIcgId(id: string, newIcgId: string): Promise<void> {
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.person.findUniqueOrThrow({ where: { id }, select: { icgId: true } });
    if (existing.icgId === newIcgId) return { changed: false, oldIcgId: existing.icgId };

    await tx.person.update({ where: { id }, data: { icgId: newIcgId } });

    await tx.importBatch.updateMany({
      where: { subjectIcgId: existing.icgId },
      data: { subjectIcgId: newIcgId },
    });
    await tx.stagingSet.updateMany({
      where: { subjectIcgId: existing.icgId },
      data: { subjectIcgId: newIcgId },
    });

    await tx.$queryRaw`
      UPDATE "StagingSet"
      SET "participantIcgIds" = array_replace("participantIcgIds", ${existing.icgId}::text, ${newIcgId}::text)
      WHERE ${existing.icgId}::text = ANY("participantIcgIds")
    `;

    const participantSets = await tx.stagingSet.findMany({
      where: { participantIcgIds: { has: existing.icgId }, participants: { not: "DbNull" as const } },
      select: { id: true, participants: true },
    });
    for (const s of participantSets) {
      const updated = (s.participants as { name: string; icgId: string; url?: string }[])
        .map(p => p.icgId === existing.icgId ? { ...p, icgId: newIcgId } : p);
      await tx.stagingSet.update({ where: { id: s.id }, data: { participants: updated } });
    }

    return { changed: true, oldIcgId: existing.icgId };
  });

  if (result.changed) {
    refreshStatusesForIcgId(result.oldIcgId).catch(() => {});
    refreshStatusesForIcgId(newIcgId).catch(() => {});
  }
}

export async function updatePersonAppearance(
  id: string,
  data: {
    eyeColor?: string;
    measurements?: string;
    height?: number;
    weight?: number;
    build?: string;
    currentHairColor?: string;
    breastSize?: string;
  },
): Promise<void> {
  await Promise.all([
    ensureCatalogEntry("hair", data.currentHairColor),
    ensureCatalogEntry("eye",  data.eyeColor),
  ]);
  await prisma.$transaction(async (tx) => {
    await tx.person.update({
      where: { id },
      data: {
        eyeColor: data.eyeColor ?? null,
        height: data.height ?? null,
      },
    });

    // Weight / build / hair colour are baseline ScalarDeltas. Editing appearance
    // replaces the baseline era's delta for each provided attribute.
    const baselineEra = await tx.era.findFirst({
      where: { personId: id, isBaseline: true },
      select: { id: true },
    });
    if (baselineEra) {
      const setBaselineDelta = async (attrId: string, value: string | undefined) => {
        if (value === undefined) return; // not in the patch — leave as-is
        await tx.scalarDelta.deleteMany({
          where: { eraId: baselineEra.id, attributeDefinitionId: attrId },
        });
        if (value.trim() !== "") {
          await tx.scalarDelta.create({
            data: { eraId: baselineEra.id, attributeDefinitionId: attrId, value },
          });
        }
      };
      await setBaselineDelta(CORE_ATTR.hairColor, data.currentHairColor);
      await setBaselineDelta(CORE_ATTR.weight, data.weight !== undefined ? String(data.weight) : undefined);
      await setBaselineDelta(CORE_ATTR.build, data.build);
      await setBaselineDelta(CORE_ATTR.breastSize, data.breastSize);
      await setBaselineDelta(CORE_ATTR.measurements, data.measurements);
    }

    await recomputePersonCurrentState(tx, id);
  });
}

export async function deletePersonRecord(id: string): Promise<PhotoVariants[]> {
  return prisma.$transaction(async (tx) => {
    // Reset any SetCreditRaw rows resolved to this person (no schema cascade)
    await tx.setCreditRaw.updateMany({
      where: { resolvedPersonId: id },
      data: { resolvedPersonId: null, resolutionStatus: "UNRESOLVED" },
    });

    // Delete alias channel links, then aliases
    const aliasIds = (await tx.personAlias.findMany({
      where: { personId: id },
      select: { id: true },
    })).map((a) => a.id);
    if (aliasIds.length > 0) {
      await tx.personAliasChannel.deleteMany({
        where: { aliasId: { in: aliasIds } },
      });
    }
    await tx.personAlias.deleteMany({
      where: { personId: id },
    });

    // Fetch era IDs for cascading
    const eras = await tx.era.findMany({
      where: { personId: id },
      select: { id: true },
    });
    const eraIds = eras.map((p) => p.id);

    if (eraIds.length > 0) {
      // Delete scalar deltas
      await tx.scalarDelta.deleteMany({
        where: { eraId: { in: eraIds } },
      });

      // Delete body mark events via eraId
      await tx.bodyMarkEvent.deleteMany({
        where: { eraId: { in: eraIds } },
      });

      // Delete eras
      await tx.era.deleteMany({
        where: { id: { in: eraIds } },
      });
    }

    // Clear PersonMediaLink refs before deleting body marks (no schema cascade)
    await tx.personMediaLink.deleteMany({
      where: { bodyMark: { personId: id } },
    });
    await tx.bodyMark.deleteMany({
      where: { personId: id },
    });

    // Delete body modifications + events + media links
    await cascadeDeleteBodyModifications(tx, id, eraIds);

    // Delete cosmetic procedures + events + media links
    await cascadeDeleteCosmeticProcedures(tx, id, eraIds);

    // Delete interest events (the interests themselves get removed by cascadeDeletePersonExtras)
    await tx.interestEvent.deleteMany({ where: { interest: { personId: id } } });

    // Delete education, awards, interests
    await cascadeDeletePersonExtras(tx, id);

    // Delete digital identities + their event log
    await tx.digitalIdentityEvent.deleteMany({ where: { digitalIdentity: { personId: id } } });
    await tx.personDigitalIdentity.deleteMany({
      where: { personId: id },
    });

    // Delete skills + events, contribution skills
    await cascadeDeletePersonSkills(tx, id);

    // Delete session contributions (skills already cascaded above)
    await tx.sessionContribution.deleteMany({
      where: { personId: id },
    });

    // Delete set participants
    await tx.setParticipant.deleteMany({
      where: { personId: id },
    });

    // Delete relationship events, then relationships
    await cascadeDeleteRelationshipEvents(tx, id);
    await tx.personRelationship.deleteMany({
      where: {
        OR: [{ personAId: id }, { personBId: id }],
      },
    });

    // Collect reference session media variants for MinIO cleanup before cascade-deleting
    const refSession = await tx.session.findFirst({
      where: { personId: id },
      select: { id: true },
    });
    let mediaVariants: PhotoVariants[] = [];
    if (refSession) {
      const sessionMedia = await tx.mediaItem.findMany({
        where: { sessionId: refSession.id },
        select: { variants: true },
      });
      mediaVariants = sessionMedia
        .map((m) => parsePhotoVariants(m.variants))
        .filter((v): v is PhotoVariants => v !== null);
      await cascadeDeleteSession(tx, refSession.id);
    }

    // Delete remaining media collection structure (MediaCollectionItems for other
    // sessions were not deleted above — underlying MediaItems belong to those sessions
    // and must survive)
    const collectionIds = (await tx.mediaCollection.findMany({
      where: { personId: id },
      select: { id: true },
    })).map((c) => c.id);
    if (collectionIds.length > 0) {
      await tx.mediaCollectionItem.deleteMany({
        where: { collectionId: { in: collectionIds } },
      });
      await tx.mediaCollection.deleteMany({
        where: { id: { in: collectionIds } },
      });
    }

    // Delete remaining PersonMediaLinks (eraId ones already NULLed by schema SetNull)
    await tx.personMediaLink.deleteMany({
      where: { personId: id },
    });

    // Delete the person
    await tx.person.delete({
      where: { id },
    });

    return mediaVariants;
  });
}

export type PaginatedPersons = {
  items: PersonWithCommonAlias[];
  nextCursor: string | null;
  totalCount: number;
};

function getPersonOrderBy(sort?: PersonSort): Prisma.PersonOrderByWithRelationInput[] {
  switch (sort) {
    case "name-asc":
    case "name-desc":
      // Name sort handled via raw SQL query path below
      return [{ createdAt: "asc" }];
    case "newest":
      return [{ createdAt: "desc" }];
    case "oldest":
      return [{ createdAt: "asc" }];
    case "age-asc":
      return [{ birthdate: { sort: "desc", nulls: "last" } }];
    case "age-desc":
      return [{ birthdate: { sort: "asc", nulls: "last" } }];
    case "rating-desc":
      return [{ rating: { sort: "desc", nulls: "last" } }];
    case "updated":
      return [{ createdAt: "desc" }]; // Person has no updatedAt — use createdAt
    case "completeness-asc":
    case "completeness-desc":
      // Completeness sort handled in-memory
      return [{ createdAt: "asc" }];
    default:
      return [{ createdAt: "asc" }];
  }
}

export async function getPersonsPaginated(
  filters: PersonFilters = {},
  cursor?: string,
  limit = 50,
): Promise<PaginatedPersons> {
  const { q, status, naturalHairColor, bodyType, ethnicity, bodyRegions, sort, birthdateFrom, birthdateTo, createdFrom, createdTo } = filters;

  const where: Prisma.PersonWhereInput = {};

  if (status && status !== "all") {
    where.status = status;
  }

  const currentStateWhere: Prisma.PersonCurrentStateWhereInput = {};
  if (naturalHairColor) {
    currentStateWhere.currentHairColor = { equals: naturalHairColor, mode: "insensitive" };
  }
  if (bodyType) {
    currentStateWhere.currentBuild = { equals: bodyType, mode: "insensitive" };
  }
  if (Object.keys(currentStateWhere).length > 0) {
    where.currentState = currentStateWhere;
  }

  if (ethnicity) {
    where.ethnicity = { equals: ethnicity, mode: "insensitive" };
  }

  // Body region filter: find persons who have body marks/modifications/procedures
  // in the selected regions. Expands selected IDs to include ancestors and
  // descendants for hierarchical matching (e.g. selecting "arm.upper.outer_l"
  // also matches records stored as "arm_l").
  if (bodyRegions && bodyRegions.length > 0) {
    const expanded = expandRegionFilter(bodyRegions);
    const regionCondition: Prisma.PersonWhereInput = {
      OR: [
        { bodyMarks: { some: { bodyRegions: { hasSome: expanded } } } },
        { bodyModifications: { some: { bodyRegions: { hasSome: expanded } } } },
        { cosmeticProcedures: { some: { bodyRegions: { hasSome: expanded } } } },
      ],
    };
    where.AND = [regionCondition];
  }

  if (birthdateFrom || birthdateTo) {
    where.birthdate = {
      ...(birthdateFrom ? { gte: birthdateFrom } : {}),
      ...(birthdateTo ? { lte: birthdateTo } : {}),
    };
  }

  if (createdFrom || createdTo) {
    where.createdAt = {
      ...(createdFrom ? { gte: createdFrom } : {}),
      ...(createdTo ? { lte: createdTo } : {}),
    };
  }

  if (q) {
    where.OR = [
      { icgId: { contains: q, mode: "insensitive" } },
      {
        aliases: {
          some: {
            name: { contains: q, mode: "insensitive" },
          },
        },
      },
    ];
  }

  const { completeness: completenessFilter } = filters;
  const orderBy = getPersonOrderBy(sort);
  const isNameSort = sort === "name-asc" || sort === "name-desc";
  const isCompletenessSort = sort === "completeness-asc" || sort === "completeness-desc";
  const needsInMemoryPath = isNameSort || isCompletenessSort || !!completenessFilter;

  // Helper to map a raw person to PersonWithCommonAlias (sans completeness)
  type RawPerson = Awaited<ReturnType<typeof prisma.person.findMany>>[number] & {
    aliases: { isCommon: boolean; isBirth: boolean; name: string; nameNorm: string | null }[];
    currentState: { currentHairColor: string | null; currentBuild: string | null } | null;
  };

  function mapPerson(p: RawPerson, score: number, q?: string): PersonWithCommonAlias {
    const commonAlias = p.aliases.find((a) => a.isCommon)?.name ?? null;
    const matchedAlias = q
      ? (p.aliases.find(
          (a) => !a.isCommon && !a.isBirth && a.name.toLowerCase().includes(q.toLowerCase()),
        )?.name ?? null)
      : null;
    return {
      id: p.id,
      icgId: p.icgId,
      status: p.status,
      rating: p.rating,
      tags: p.tags,
      naturalHairColor: p.currentState?.currentHairColor ?? null,
      bodyType: p.currentState?.currentBuild ?? null,
      ethnicity: p.ethnicity,
      location: p.location,
      activeFrom: p.activeFrom,
      activeFromPrecision: p.activeFromPrecision,
      retiredAt: p.retiredAt,
      retiredAtPrecision: p.retiredAtPrecision,
      specialization: p.specialization,
      createdAt: p.createdAt,
      commonAlias,
      birthdate: p.birthdate,
      birthdatePrecision: p.birthdatePrecision,
      birthdateModifier: p.birthdateModifier ?? "EXACT",
      nationality: p.nationality,
      birthAlias: p.aliases.find((a) => a.isBirth)?.name ?? null,
      completeness: score,
      matchedAlias,
    };
  }

  // For name sort, completeness sort, or completeness filter — fetch all then sort/filter in-memory
  if (needsInMemoryPath) {
    const [totalCountRaw, allPersons] = await Promise.all([
      prisma.person.count({ where }),
      prisma.person.findMany({
        where,
        include: {
          aliases: {
            where: q
              ? { OR: [{ isCommon: true }, { isBirth: true }, { name: { contains: q, mode: "insensitive" } }] }
              : { OR: [{ isCommon: true }, { isBirth: true }] },
          },
          currentState: { select: { currentHairColor: true, currentBuild: true } },
        },
      }),
    ]);

    // Batch compute completeness for all persons
    const batchData = allPersons.map((p) => ({
      id: p.id,
      birthdate: p.birthdate,
      nationality: p.nationality,
      sexAtBirth: p.sexAtBirth,
      ethnicity: p.ethnicity,
      eyeColor: p.eyeColor,
      height: p.height,
      birthPlace: p.birthPlace,
      birthAlias: p.aliases.find((a) => a.isBirth)?.name ?? null,
    }));
    const completenessMap = await batchComputeCompleteness(
      batchData,
      allPersons.map((p) => p.id),
    );

    // Apply completeness filter
    let filtered = allPersons;
    if (completenessFilter) {
      filtered = allPersons.filter((p) => {
        const score = completenessMap.get(p.id) ?? 0;
        if (completenessFilter === "low") return score < 40;
        if (completenessFilter === "medium") return score >= 40 && score <= 70;
        return score > 70;
      });
    }

    // Sort
    if (isNameSort) {
      const direction = sort === "name-asc" ? 1 : -1;
      filtered.sort((a, b) => {
        const nameA = a.aliases.find((al) => al.isCommon)?.nameNorm ?? "\uffff";
        const nameB = b.aliases.find((al) => al.isCommon)?.nameNorm ?? "\uffff";
        return nameA.localeCompare(nameB) * direction;
      });
    } else if (isCompletenessSort) {
      const direction = sort === "completeness-asc" ? 1 : -1;
      filtered.sort((a, b) => {
        const scoreA = completenessMap.get(a.id) ?? 0;
        const scoreB = completenessMap.get(b.id) ?? 0;
        return (scoreA - scoreB) * direction;
      });
    }

    // Paginate
    const startIdx = cursor ? (parseInt(cursor, 10) || 0) : 0;

    const pageItems = filtered.slice(startIdx, startIdx + limit);
    const hasMore = startIdx + limit < filtered.length;
    const nextCursorId = hasMore ? String(startIdx + limit) : null;
    const totalCount = completenessFilter ? filtered.length : totalCountRaw;

    return {
      items: pageItems.map((p) => mapPerson(p, completenessMap.get(p.id) ?? 0, q)),
      nextCursor: nextCursorId,
      totalCount,
    };
  }

  // Standard cursor-based pagination
  const [totalCount, persons] = await Promise.all([
    prisma.person.count({ where }),
    prisma.person.findMany({
      where,
      include: {
        aliases: {
          where: q
            ? { OR: [{ isCommon: true }, { isBirth: true }, { name: { contains: q, mode: "insensitive" } }] }
            : { OR: [{ isCommon: true }, { isBirth: true }] },
        },
          currentState: { select: { currentHairColor: true, currentBuild: true } },
      },
      orderBy,
      take: limit + 1,
      skip: cursor ? parseInt(cursor, 10) : 0,
    }),
  ]);

  const offset = cursor ? parseInt(cursor, 10) : 0;
  const hasMore = persons.length > limit;
  const items = hasMore ? persons.slice(0, limit) : persons;
  const nextCursor = hasMore ? String(offset + limit) : null;

  // Batch compute completeness
  const batchData = items.map((p) => ({
    id: p.id,
    birthdate: p.birthdate,
    nationality: p.nationality,
    sexAtBirth: p.sexAtBirth,
    ethnicity: p.ethnicity,
    eyeColor: p.eyeColor,
    height: p.height,
    birthPlace: p.birthPlace,
    birthAlias: p.aliases.find((a) => a.isBirth)?.name ?? null,
  }));
  const completenessMap = await batchComputeCompleteness(
    batchData,
    items.map((p) => p.id),
  );

  return {
    items: items.map((p) => mapPerson(p, completenessMap.get(p.id) ?? 0, q)),
    nextCursor,
    totalCount,
  };
}

export async function getDistinctNaturalHairColors(): Promise<string[]> {
  const result = await prisma.personCurrentState.findMany({
    where: { currentHairColor: { not: null } },
    select: { currentHairColor: true },
    distinct: ["currentHairColor"],
    orderBy: { currentHairColor: "asc" },
  });
  return result.map((r) => r.currentHairColor!).filter(Boolean);
}

export async function getDistinctBodyTypes(): Promise<string[]> {
  const result = await prisma.personCurrentState.findMany({
    where: { currentBuild: { not: null } },
    select: { currentBuild: true },
    distinct: ["currentBuild"],
    orderBy: { currentBuild: "asc" },
  });
  return result.map((r) => r.currentBuild!).filter(Boolean);
}

export async function getDistinctEthnicities(): Promise<string[]> {
  const result = await prisma.person.findMany({
    where: { ethnicity: { not: null } },
    select: { ethnicity: true },
    distinct: ["ethnicity"],
    orderBy: { ethnicity: "asc" },
  });
  return result.map((r) => r.ethnicity!).filter(Boolean);
}

export type PersonFacetCounts = {
  status: Record<string, number>;
  naturalHairColor: Record<string, number>;
  bodyType: Record<string, number>;
  ethnicity: Record<string, number>;
};

export async function getPersonFacetCounts(filters: Omit<PersonFilters, "sort" | "bodyRegions" | "bodyRegionMatch" | "completeness">): Promise<PersonFacetCounts> {
  function buildBase(overrides: Partial<Pick<PersonFilters, "status" | "naturalHairColor" | "bodyType" | "ethnicity">> = {}): Prisma.PersonWhereInput {
    const merged = { ...filters, ...overrides };
    const w: Prisma.PersonWhereInput = {};
    if (merged.status && merged.status !== "all") w.status = merged.status;
    const cs: Prisma.PersonCurrentStateWhereInput = {};
    if (merged.naturalHairColor) cs.currentHairColor = { equals: merged.naturalHairColor, mode: "insensitive" };
    if (merged.bodyType) cs.currentBuild = { equals: merged.bodyType, mode: "insensitive" };
    if (Object.keys(cs).length > 0) w.currentState = cs;
    if (merged.ethnicity) w.ethnicity = { equals: merged.ethnicity, mode: "insensitive" };
    if (filters.birthdateFrom || filters.birthdateTo) {
      w.birthdate = {
        ...(filters.birthdateFrom ? { gte: filters.birthdateFrom } : {}),
        ...(filters.birthdateTo ? { lte: filters.birthdateTo } : {}),
      };
    }
    if (filters.createdFrom || filters.createdTo) {
      w.createdAt = {
        ...(filters.createdFrom ? { gte: filters.createdFrom } : {}),
        ...(filters.createdTo ? { lte: filters.createdTo } : {}),
      };
    }
    if (filters.q) {
      w.OR = [
        { icgId: { contains: filters.q, mode: "insensitive" } },
        { aliases: { some: { name: { contains: filters.q, mode: "insensitive" } } } },
      ];
    }
    return w;
  }

  const [statusGroups, hairGroups, bodyTypeGroups, ethnicityGroups] = await Promise.all([
    prisma.person.groupBy({ by: ["status"], where: buildBase({ status: undefined }), _count: { _all: true } }),
    prisma.personCurrentState.groupBy({ by: ["currentHairColor"], where: { person: buildBase({ naturalHairColor: undefined }) }, _count: { _all: true } }),
    prisma.personCurrentState.groupBy({ by: ["currentBuild"], where: { person: buildBase({ bodyType: undefined }) }, _count: { _all: true } }),
    prisma.person.groupBy({ by: ["ethnicity"], where: buildBase({ ethnicity: undefined }), _count: { _all: true } }),
  ]);

  return {
    status: Object.fromEntries(statusGroups.map((r) => [r.status, r._count._all])),
    naturalHairColor: Object.fromEntries(hairGroups.filter((r) => r.currentHairColor).map((r) => [r.currentHairColor!, r._count._all])),
    bodyType: Object.fromEntries(bodyTypeGroups.filter((r) => r.currentBuild).map((r) => [r.currentBuild!, r._count._all])),
    ethnicity: Object.fromEntries(ethnicityGroups.filter((r) => r.ethnicity).map((r) => [r.ethnicity!, r._count._all])),
  };
}
