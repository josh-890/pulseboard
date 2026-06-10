/**
 * Scan-round service — watchlist scan cadence + per-platform URL file building.
 *
 * The watchlist (person-service.getWatchlist) consumes the cadence helpers here
 * to flag pages as due/overdue. The export route consumes buildScanFiles to turn
 * a selection of identity pages into the per-platform `.txt` files an external
 * scraper script ingests.
 */

import { prisma } from "@/lib/db";
import type { ScrapeLineFormat, WatchPriority } from "@/generated/prisma/client";
import { setSetting } from "@/lib/services/setting-service";
import {
  getAllScrapeSources,
  type ScrapeSource,
} from "@/lib/services/scrape-source-service";

// ── Cadence ─────────────────────────────────────────────────────────────────

export const SCAN_CADENCE_DEFAULTS: Record<WatchPriority, number> = {
  HIGH: 7,
  NORMAL: 30,
  LOW: 90,
};

const cadenceKey = (p: WatchPriority) => `scan-cadence-${p}`;

export async function getScanCadenceDays(): Promise<Record<WatchPriority, number>> {
  const keys = (Object.keys(SCAN_CADENCE_DEFAULTS) as WatchPriority[]).map(
    cadenceKey,
  );
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const out = {} as Record<WatchPriority, number>;
  for (const p of Object.keys(SCAN_CADENCE_DEFAULTS) as WatchPriority[]) {
    const raw = map.get(cadenceKey(p));
    const parsed = raw == null ? NaN : parseInt(raw, 10);
    out[p] = Number.isFinite(parsed) && parsed > 0 ? parsed : SCAN_CADENCE_DEFAULTS[p];
  }
  return out;
}

export async function setScanCadenceDays(
  priority: WatchPriority,
  days: number,
): Promise<void> {
  await setSetting(cadenceKey(priority), String(Math.max(1, Math.round(days))));
}

export type DueLevel = "fresh" | "due" | "overdue";

/**
 * Classify a scannable page's freshness against its owner's priority cadence.
 * Never-scanned counts as `due` (a candidate we've never pulled), with a null
 * age so callers can sort it as maximally stale. `overdue` = ≥ 2× the cadence.
 */
export function pageDueLevel(
  scannedThroughAt: Date | null,
  cadenceDays: number,
  now: Date = new Date(),
): { level: DueLevel; ageDays: number | null } {
  if (!scannedThroughAt) return { level: "due", ageDays: null };
  const ageDays = Math.floor(
    (now.getTime() - scannedThroughAt.getTime()) / 86_400_000,
  );
  if (ageDays >= cadenceDays * 2) return { level: "overdue", ageDays };
  if (ageDays >= cadenceDays) return { level: "due", ageDays };
  return { level: "fresh", ageDays };
}

// ── Scan-file building ──────────────────────────────────────────────────────

export type ScanFile = {
  platform: string;
  fileName: string;
  lineFormat: ScrapeLineFormat;
  urlCount: number;
  content: string;
};

/**
 * Turn a selection of PersonDigitalIdentity ids into per-platform scan files.
 * Only pages on a scannable source with a URL are included; URLs are grouped by
 * source and deduped. Line format is per source: URL_ONLY emits the bare URL,
 * ICGID_URL emits `"{icgId}\t{url}"` so non-self-identifying scrapes stay
 * ICG-ID-attributable on re-import.
 */
export type ScanIdentity = { url: string | null; icgId: string };

/**
 * Pure assembly: group identity pages by scannable source, dedupe URLs, and
 * line-format per source. Extracted from buildScanFiles for unit testing.
 */
export function assembleScanFiles(
  identities: ScanIdentity[],
  sources: ScrapeSource[],
): ScanFile[] {
  const matchHost = (domains: string[], url: string): boolean => {
    let host: string;
    try {
      host = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return false;
    }
    return domains.some((d) => host === d || host.endsWith(`.${d}`));
  };

  // sourceKey -> { source, lines (deduped by url) }
  const grouped = new Map<
    string,
    { source: ScrapeSource; lines: Map<string, string> }
  >();

  for (const di of identities) {
    const url = di.url;
    if (!url) continue;
    const source = sources.find(
      (s) => s.isScannable && matchHost(s.domains, url),
    );
    if (!source) continue;

    let bucket = grouped.get(source.key);
    if (!bucket) {
      bucket = { source, lines: new Map() };
      grouped.set(source.key, bucket);
    }
    if (bucket.lines.has(url)) continue;
    const line =
      source.lineFormat === "ICGID_URL" ? `${di.icgId}\t${url}` : url;
    bucket.lines.set(url, line);
  }

  const files: ScanFile[] = [];
  for (const { source, lines } of grouped.values()) {
    const ordered = [...lines.values()];
    files.push({
      platform: source.key,
      fileName: source.fileName || `${source.key.toLowerCase()}.txt`,
      lineFormat: source.lineFormat,
      urlCount: ordered.length,
      content: ordered.join("\n") + "\n",
    });
  }

  files.sort((a, b) => a.fileName.localeCompare(b.fileName));
  return files;
}

export async function buildScanFiles(identityIds: string[]): Promise<ScanFile[]> {
  if (identityIds.length === 0) return [];

  const [identities, sources] = await Promise.all([
    prisma.personDigitalIdentity.findMany({
      where: { id: { in: identityIds }, url: { not: null } },
      select: { url: true, person: { select: { icgId: true } } },
    }),
    getAllScrapeSources(),
  ]);

  return assembleScanFiles(
    identities.map((di) => ({ url: di.url, icgId: di.person.icgId })),
    sources,
  );
}
