import Link from "next/link";
import { LayoutGrid, List, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { CHANNEL_TIER_CONFIG } from "@/lib/constants/channel-tier";
import type { MakerListSort } from "@/lib/services/maker-list-service";

export type MakerListParams = {
  q?: string;
  labelId?: string;
  tier?: string;
  rating?: string;
  sort?: string;
  view?: string;
};

type MakerListToolbarProps = {
  basePath: string;
  params: MakerListParams;
  /** Tier pills — channels only */
  withTier?: boolean;
};

export function parseSort(v: string | undefined): MakerListSort {
  return v === "rating" || v === "newest" || v === "name" ? v : "sets";
}

export function parseMinRating(v: string | undefined): number | undefined {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : undefined;
}

function hrefWith(basePath: string, params: MakerListParams, patch: Partial<MakerListParams>): string {
  const next = { ...params, ...patch };
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${basePath}?${s}` : basePath;
}

function Pill({ href, active, label, children }: { href: string; active: boolean; label?: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        active ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-muted",
      )}
    >
      {children}
    </Link>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-0.5 rounded-md border border-border bg-background p-0.5">
      {children}
    </div>
  );
}

const SORTS: { value: MakerListSort; label: string }[] = [
  { value: "sets", label: "Most sets" },
  { value: "rating", label: "Rating" },
  { value: "newest", label: "Newest" },
  { value: "name", label: "A–Z" },
];

/** Sort, ★ filter, tier (channels) and Tiles | List — all in the URL */
export function MakerListToolbar({ basePath, params, withTier = false }: MakerListToolbarProps) {
  const sort = parseSort(params.sort);
  const minRating = parseMinRating(params.rating);
  const view = params.view === "list" ? "list" : "tiles";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Group label="Sort">
        {SORTS.map((s) => (
          <Pill key={s.value} href={hrefWith(basePath, params, { sort: s.value === "sets" ? undefined : s.value })} active={sort === s.value}>
            {s.label}
          </Pill>
        ))}
      </Group>
      <Group label="Your rating">
        <Pill href={hrefWith(basePath, params, { rating: undefined })} active={!minRating}>
          Any ★
        </Pill>
        {[3, 4, 5].map((n) => (
          <Pill key={n} href={hrefWith(basePath, params, { rating: String(n) })} active={minRating === n} label={`Rated ${n} or more`}>
            <Star size={11} className="fill-current" aria-hidden="true" />
            {n}
            {n < 5 && "+"}
          </Pill>
        ))}
      </Group>
      {withTier && (
        <Group label="Tier">
          <Pill href={hrefWith(basePath, params, { tier: undefined })} active={!params.tier}>
            All tiers
          </Pill>
          {CHANNEL_TIER_CONFIG.map((t) => (
            <Pill key={t.value} href={hrefWith(basePath, params, { tier: t.value })} active={params.tier === t.value} label={t.label}>
              {t.letter}
            </Pill>
          ))}
        </Group>
      )}
      <Group label="View">
        <Pill href={hrefWith(basePath, params, { view: undefined })} active={view === "tiles"} label="Tiles">
          <LayoutGrid size={12} aria-hidden="true" />
        </Pill>
        <Pill href={hrefWith(basePath, params, { view: "list" })} active={view === "list"} label="List">
          <List size={12} aria-hidden="true" />
        </Pill>
      </Group>
    </div>
  );
}
