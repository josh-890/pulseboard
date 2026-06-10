# Watchlist scan-round workflow: per-identity-page scan dating + archive reconciliation

Decided 2026-06-10 (design grilling via `/grill-with-docs`, implemented in the
same slice).

## Context

The watchlist (commit `9c1f829`) lets a user mark people to monitor and lists
them at `/watchlist`, but offered no *active* loop. The real workflow is:

1. Pick watched people → pick which of their external profile pages to scan.
2. Download per-platform URL files → feed each into that platform's external
   scraper script → the scraper produces import `.txt` files.
3. Re-import those files → the person's data updates and a "scanned-through"
   date advances.
4. Because a scrape pulls everything up to its run date, **no imported staged
   set is ever newer than the scan date**. An archive-born staged set (created
   manually from the Archive, no import batch) *can* be newer — and that is the
   signal the person has untracked releases to scan next round.

The decisions below are hard to reverse (they shape schema + the import path +
the file contract a separate scraper depends on), so they are recorded here.

## Decision 1 — Per-identity-page scan dating, stamped at import time

`scannedThroughAt` lives on each `PersonDigitalIdentity` (not a single
per-person date). The scan unit is the page, because scanning happens per
platform and different platforms lag independently.

Stamping is driven by the **import**, the single source of truth — there is no
persisted "scan round" entity. The import file's `URL:` header already becomes
the first `DIGITAL_IDENTITY` item (its `handle` is the subject's ICG-ID); on
import that page is stamped `scannedThroughAt = ImportBatch.extractionDate`
(the scrape date), advanced **monotonically forward** so re-importing an older
file never regresses freshness. `importDigitalIdentity` also became
find-or-update by `(personId, url)` to avoid duplicating identities on re-import.

Person-level freshness rolls up from these: newest stamp = most-recent source
knowledge; oldest stamp = staleness driver for the "due" sort.

### Why not one per-person date?

A single date conflates platforms scanned at different times. Scanning Indexxx
today would mask that THENUDE is months stale and hide genuinely missed sets.

## Decision 2 — Scrape-source registry decides scannability + file shape

A `ScrapeSource` catalog (subsumes the old hardcoded `DOMAIN_TO_PLATFORM` map)
keys platforms by normalized name and carries `domains`, `isScannable`,
`fileName`, and `lineFormat`. `resolvePlatformFromUrl` reads it. Only
`isScannable` platforms appear in scan rounds and stamp scan dates;
reference-only links (IAFD, Boobpedia, …) never do. A per-page
`excludeFromScan` flag drops a dead profile without deleting the identity.

Cadence intervals (default HIGH 7 / NORMAL 30 / LOW 90 days) live in the
key/value `Setting` store; a page is `due` past its priority's interval and
`overdue` past 2×.

## Decision 3 — Per-source line format; ICG-ID injected except for THENUDE

The generated file's line format is a property of the source (`lineFormat`):

- **`URL_ONLY`** (THENUDE): bare URL per line — its scraper derives the ICG-ID
  from the page itself.
- **`ICGID_URL`** (everyone else): `"{icgId}\t{url}"` per line, because those
  pages can't self-identify the person, and the re-import matcher is
  **ICG-ID-exact only** (no fuzzy fallback — see import matcher invariant). The
  injected ICG-ID keeps non-THENUDE scrapes attributable.

**Caveat:** marking a platform `isScannable` whose scraper can't honor the
injected ICG-ID would re-import as an unmatched/NEW person. Scannability is the
single guard — only THENUDE ships scannable by default.

## Decision 4 — Rescan signal = archive-born set newer than newest scan

A watched person is flagged **"needs rescan"** when an archive-born `StagingSet`
(`importBatchId IS NULL`, status not `SKIPPED`/`INACTIVE`, `releaseDate` set,
`participantIcgIds` contains the person) has a `releaseDate` newer than the
person's **newest** `scannedThroughAt` (or any such set when never scanned).

Promotion leaves the `StagingSet` row in place (status → `PROMOTED`), so this
stays a single-table check that keeps flagging even after promotion — the
source page itself still hasn't been re-scraped. Comparing against the *newest*
scan (not oldest) keeps it a low-noise "definitely behind" signal.

## Consequences

- The export is ephemeral: selecting pages on `/watchlist` and downloading a zip
  of per-platform files writes nothing; correctness rests entirely on the import.
- `getWatchlist` sorts needs-rescan → worst due level → priority → oldest scan.
- A new dependency (`jszip`) for the zip route.

## Out of scope / deferred

- Persisted scan rounds + an "awaiting import" in-flight view.
- Per-platform (vs per-priority) cadence.
- Channel → platform → identity-page mapping for a per-platform rescan compare.

## Pointers

- Schema: `ScrapeSource`, `PersonDigitalIdentity.scannedThroughAt` /
  `excludeFromScan`, `ScrapeLineFormat`.
- Services: `scrape-source-service.ts`, `scan-service.ts`,
  `getWatchlist` in `person-service.ts`, stamping in
  `import-executor.ts#importDigitalIdentity`.
- Route: `src/app/api/scan-round/export/route.ts`.
- UI: `watchlist-client.tsx`, `watch-toggle.tsx` (icon variant),
  `settings/scanning`, `scan-settings-client.tsx`.
