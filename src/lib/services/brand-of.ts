import { prisma } from "@/lib/db";
import { buildUrl } from "@/lib/media-url";
import type { EntityBrand } from "@/lib/brand-mark";

// The brand mark fields → what a mark needs. Kept apart from brand-service
// (sharp, MinIO writes) so any server component can import it cheaply.

export type BrandRow = { logoKey: string | null; markFont: string | null; markColor: string | null };

/** What a mark needs, with the logo as a URL — safe to hand to client components */
export function brandOf(entity: { name: string; shortName?: string | null } & BrandRow): EntityBrand {
  return {
    name: entity.name,
    shortName: entity.shortName ?? null,
    logoUrl: entity.logoKey ? buildUrl(entity.logoKey) : null,
    markFont: entity.markFont,
    markColor: entity.markColor,
  };
}

/** A label's mark — framed, so it is told apart from its channel's at a glance */
export function labelBrandOf(label: { name: string; shortName?: string | null } & BrandRow): EntityBrand {
  return { ...brandOf(label), kind: "label" };
}

/** Select clause for the brand fields */
export const BRAND_SELECT = { logoKey: true, markFont: true, markColor: true } as const;

/** Marks of many channels by id, in one query — for rows that only carry a channelId */
export async function getChannelBrands(ids: (string | null | undefined)[]): Promise<Map<string, EntityBrand>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  const channels = await prisma.channel.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, shortName: true, ...BRAND_SELECT },
  });
  return new Map(channels.map((c) => [c.id, brandOf(c)]));
}

/** Marks of every channel with an archive folder, keyed by that folder name — for archive views */
export async function getChannelBrandsByFolder(): Promise<Record<string, EntityBrand & { channelId: string }>> {
  const channels = await prisma.channel.findMany({
    where: { channelFolder: { not: null } },
    select: { id: true, name: true, shortName: true, channelFolder: true, ...BRAND_SELECT },
  });
  const out: Record<string, EntityBrand & { channelId: string }> = {};
  for (const c of channels) out[c.channelFolder!] = { ...brandOf(c), channelId: c.id };
  return out;
}
