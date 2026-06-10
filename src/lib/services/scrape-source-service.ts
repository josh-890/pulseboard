/**
 * Scrape-source registry — the canonical list of external platforms, which are
 * scrapeable into import files, and how each platform's scan file is formatted.
 *
 * Subsumes the old hardcoded DOMAIN_TO_PLATFORM map in the import staging
 * service: `resolvePlatformFromUrl` reads the registry to turn a profile URL
 * into its platform key, with the same capitalize-the-domain fallback.
 */

import { prisma } from "@/lib/db";
import type { ScrapeSource, ScrapeLineFormat } from "@/generated/prisma/client";

export type { ScrapeSource };

export async function getAllScrapeSources(): Promise<ScrapeSource[]> {
  return prisma.scrapeSource.findMany({
    orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }],
  });
}

export async function getScannableSources(): Promise<ScrapeSource[]> {
  return prisma.scrapeSource.findMany({
    where: { isScannable: true },
    orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }],
  });
}

/** Normalize a hostname: strip a leading `www.`. */
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Capitalize-the-domain fallback (preserves legacy detectPlatformFromUrl). */
function fallbackPlatform(host: string): string {
  const parts = host.split(".");
  if (parts.length >= 2) {
    const name = parts[parts.length - 2];
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return "Source";
}

/** Resolve the registry source whose domains match a profile URL's host. */
export async function resolveSourceFromUrl(
  url: string,
  sources?: ScrapeSource[],
): Promise<ScrapeSource | null> {
  const host = hostOf(url);
  if (!host) return null;
  const all = sources ?? (await getAllScrapeSources());
  for (const src of all) {
    for (const domain of src.domains) {
      if (host === domain || host.endsWith(`.${domain}`)) return src;
    }
  }
  return null;
}

/**
 * Turn a profile URL into a platform key. Registry match wins; otherwise the
 * capitalized domain name (e.g. `Onlyfans`), or `Source` for an unparseable URL.
 * Accepts a preloaded source list to avoid a per-call query in hot loops.
 */
export async function resolvePlatformFromUrl(
  url: string,
  sources?: ScrapeSource[],
): Promise<string> {
  const matched = await resolveSourceFromUrl(url, sources);
  if (matched) return matched.key;
  const host = hostOf(url);
  return host ? fallbackPlatform(host) : "Source";
}

// ── Registry mutations (settings UI) ────────────────────────────────────────

export type ScrapeSourceInput = {
  key: string;
  displayName: string;
  domains: string[];
  isScannable: boolean;
  fileName: string;
  lineFormat: ScrapeLineFormat;
  urlPattern?: string | null;
  sortOrder?: number;
};

export async function createScrapeSource(
  input: ScrapeSourceInput,
): Promise<ScrapeSource> {
  return prisma.scrapeSource.create({
    data: {
      key: input.key.trim(),
      displayName: input.displayName.trim(),
      domains: normalizeDomains(input.domains),
      isScannable: input.isScannable,
      fileName: input.fileName.trim(),
      lineFormat: input.lineFormat,
      urlPattern: input.urlPattern?.trim() || null,
      sortOrder: input.sortOrder ?? 0,
    },
  });
}

export async function updateScrapeSource(
  id: string,
  input: Partial<ScrapeSourceInput>,
): Promise<ScrapeSource> {
  return prisma.scrapeSource.update({
    where: { id },
    data: {
      ...(input.key !== undefined ? { key: input.key.trim() } : {}),
      ...(input.displayName !== undefined
        ? { displayName: input.displayName.trim() }
        : {}),
      ...(input.domains !== undefined
        ? { domains: normalizeDomains(input.domains) }
        : {}),
      ...(input.isScannable !== undefined
        ? { isScannable: input.isScannable }
        : {}),
      ...(input.fileName !== undefined
        ? { fileName: input.fileName.trim() }
        : {}),
      ...(input.lineFormat !== undefined ? { lineFormat: input.lineFormat } : {}),
      ...(input.urlPattern !== undefined
        ? { urlPattern: input.urlPattern?.trim() || null }
        : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  });
}

export async function deleteScrapeSource(id: string): Promise<void> {
  await prisma.scrapeSource.delete({ where: { id } });
}

function normalizeDomains(domains: string[]): string[] {
  return Array.from(
    new Set(
      domains
        .map((d) => d.trim().toLowerCase().replace(/^www\./, ""))
        .filter(Boolean),
    ),
  );
}
