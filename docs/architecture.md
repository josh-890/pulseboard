# Pulseboard — Architecture Reference

> **Last updated:** 2026-04-15
> This document must be kept in sync with code changes. Update it whenever pages, services, components, API routes, or data flows change.

---

## Table of Contents

1. [Data Flow](#1-data-flow)
2. [Page Routes & Data Dependencies](#2-page-routes--data-dependencies)
3. [Service Layer](#3-service-layer)
4. [Server Actions](#4-server-actions)
5. [API Routes](#5-api-routes)
6. [Component Architecture](#6-component-architecture)
7. [State Management](#7-state-management)
8. [Database Schema & Relationships](#8-database-schema--relationships)
9. [Key Architectural Invariants](#9-key-architectural-invariants)
10. [Data Flow Examples](#10-data-flow-examples)
11. [Utilities & Constants](#11-utilities--constants)

---

## 1. Data Flow

```
Read path:
  PostgreSQL → Prisma Client → async services → Server Components → Client Components
               (lib/db.ts)     (lib/services/)   (app/ pages)       (components/)

Write path:
  User interaction → Server Action → Zod validation → Service → Prisma → PostgreSQL
  (Client Component)  (lib/actions/)                   (lib/services/)    + revalidatePath()

Media path:
  File upload → /api/media/upload → Sharp variants → MinIO storage → MediaItem record
                                     (media-upload.ts)                  (media-service.ts)
```

---

## 2. Page Routes & Data Dependencies

### List Pages

| Route | Services Called | Key Components |
|-------|----------------|----------------|
| `/` | `getDashboardStats()`, `getRecentActivities()` | `KpiGrid`, `DashboardActivity`, `QuickActions` |
| `/people` | `getPersonsPaginated()`, `getHeadshotsForPersons()`, `getDistinct*()`, `countActiveContacts()` | `PersonList`, `BrowserToolbar`, `AddPersonSheet`, header **Contacts** link (count badge). `StatusFilter` carries a `watching=true` toggle (orthogonal to `status`) → `PersonFilters.watching` |
| `/people/contacts` | `getContacts()` (`relationship-service`) | `ContactsWorkspace` + `BrowserToolbar`. The "ghost" register (ADR-0022): rows are `Contact`s with claim/relationship counts; actions **Add as Person** (`addPersonFromContactAction` → auto-reconcile by ICG-ID), **Link…** (`linkContactAction` → manual reconcile), **Ignore** (`ignoreContactAction`). Sort `count`/`name`, `ignored` toggle |
| `/watchlist` | `getWatchlist()` | `WatchlistClient` — watched persons (needs-rescan → worst-due → priority → oldest-scan sort) with the claimed−recorded gap, due/overdue badges, needs-rescan flag, per-page scan selection (expand row), Mark-checked (`markPersonChecked`), and a sticky **Generate scan files** bar → `POST /api/scan-round/export` |
| `/settings/scanning` | `getAllScrapeSources()`, `getScanCadenceDays()` | `ScanSettingsClient` — scrape-source registry editor (scannable, fileName, lineFormat, domains) + per-priority scan cadence |
| `/sets` | `getSetsPaginated()`, `getCoverPhotosForSets()`, `getHeadshotsForPersons()`, `getSuggestedFoldersForSets()`, `getChannelsWithLabelMaps()` | `SetGrid`, `SetCard`, `BrowserToolbar`, `AddSetSheet` |
| `/sessions` | `getSessionsPaginated()`, `getCoverPhotosForSessions()` | `SessionList`, `SessionCard`, `AddSessionSheet` |
| `/projects` | `getProjectsPaginated()` | `ProjectList`, `ProjectCard`, `AddProjectSheet` |
| `/labels` | `getAllLabels()` | `LabelList`, `LabelCard`, `AddLabelSheet` |
| `/channels` | `getChannels()` | `ChannelList`, `ChannelCard`, `AddChannelSheet` |
| `/artists` | `getArtists()` | `ArtistCard`, `ArtistSearch`, `AddArtistButton` |
| `/networks` | `getNetworks()` | `NetworkList`, `NetworkCard`, `AddNetworkSheet` |
| `/collections` | `getAllCollections()` | `CollectionList`, `AddCollectionDialog` |
| `/favorites` | `getFavoriteMediaItems()`, `getPersonsWithFavoriteMedia()` | `FavoritesGallery`, `FavoritesPersonFilter` — global per-image favorites (`MediaItem.isFavorite`, ADR-0019), person + favorite-persons filters |
| `/atlas` | `getAtlasLocusCategories()` | Cross-person comparison index — locus categories that have an Alignment Template, with aligned-image counts + sample thumbs (ADR-0014) |
| `/settings` | `getAllSkillGroups()`, `getAllCategoryGroups()`, `getAllContributionRoleGroups()` | `SkillCatalogManager`, `MediaCategoryManager`, `ContributionRoleManager` |
| `/import` | `getImportInbox({ q, sort })` | `ImportUploadZone`, `BrowserToolbar`, `ImportInboxWorkspace` — triage inbox grouped per person (Needs review head + name/recent-sorted paginated Done tail, `loadMoreImportInboxAction`); rows show an honest state pill + auto-flow chips + re-import `vN` chain |
| `/staging-sets` | (client-fetched via `/api/staging-sets` — augmented with `suggestedArchiveFolder` from `getSuggestedFoldersForStagingSets`) | `StagingSetsWorkspace` → `StagingSetFilterBar`, `StagingSetGrid` → `StagingSetRow` (with inline archive section + `ArchiveFolderPicker`), `StagingSetSlidePanel` |

### Detail Pages

| Route | Services Called | Key Components |
|-------|----------------|----------------|
| `/people/[id]` | `getPersonWithDetails()`, `getPersonWorkHistory()`, `getConnectionsForPerson()` + `getRelationshipRoles()` (ADR-0022), `getPersonReferenceSession()`, `getHeadshotsForPersons()` (hero lead = Profile→Headshot representative, ADR-0016), `getPersonMediaGallery()`, `getPopulatedCategoriesForPerson()`, `getAllSkillGroups()`, `getPersonAliases()`, `getPersonSessionWorkHistory()`, `getPersonProductionSessions()`, `getPersonEntityMedia()`, `getCareerStats()` | `PersonDetailTabs` → `OverviewTab`, `AppearanceTab`, `PersonDetailsTab`, `PersonSkillsTab`, `PersonAliasesTab`, `CareerTab`, `ConnectionsTab`, `PhotosTab` |
| `/sets/[id]` | `getSetById()`, `getSetMediaGallery()`, `getAllContributionRoleGroups()` | `SetDetailGallery`, `CreditResolutionPanel`, `EditSetSheet`, `SetSessionManager` |
| `/sessions/[id]` | `getSessionById()`, `getMediaItemsForSession()` or `getMediaItemsWithLinks()`, `getSessionContributions()` | `MediaManager` (reference) or `SessionProductionGallery` (production), `SessionContributionSkills`, `BatchUploadZone` |
| `/collections/[id]` | `getCollectionWithItems()`; GRID → `getCollectionGalleryItems()`, SIDE_BY_SIDE → `getComparisonsForCollection()` | Branches on `MediaCollection.layout` (ADR-0014/0015). GRID → `CollectionDetailGallery` (photos); SIDE_BY_SIDE → `ComparisonCollectionView` (montage tiles of **Comparison** members + `ComparisonBuilderSheet`). Add-to-collection (GRID) from any lightbox via `GalleryLightbox enableCollections` |
| `/collections/[id]/comparison/[cid]` | `getComparisonDetail()` | `ComparisonViewer` — a Comparison's cells at the aspect-driver's shape; Fill(COVER)/Fit(CONTAIN) + per-cell focal; Side-by-side/Slider for pairs; reorder, aspect-driver pick, add/remove, delete (ADR-0015) |
| `/atlas/[id]` | `getAtlasGridForCategory()` | `AtlasGrid` — every person's Aligned image in one locus, ordered by person, with a person-name filter; tiles link to the person |
| `/projects/[id]` | `getProjectById()`, `getProjectSessions()` | `ProjectDetail`, `EditProjectSheet` |
| `/labels/[id]` | `getLabelById()` | `LabelDetail`, `EditLabelSheet` |
| `/channels/[id]` | `getChannelById()` | `ChannelDetail`, `EditChannelSheet` |
| `/artists/[id]` | `getArtistById()`, `getArtistStats()`, `getArtistCareer()` | `ArtistDetailHeader`, `EditArtistSheet` |
| `/networks/[id]` | `getNetworkById()` | `NetworkDetail`, `EditNetworkSheet` |
| `/import/[id]` | `refreshBatchMatches()` | `ImportWorkspace` → `ImportItemDetail`, `ImportStatusBadge`, `SetBatchSummary` (SET tab) |

---

## 3. Service Layer

All services in `src/lib/services/`. All functions are async, return Promises. Services are the only layer that touches Prisma.

### Core Services

**`person-service.ts`** (~1,350 lines) — Person CRUD, paginated listing, work history, connections, affiliations, current state derivation, entity media queries, cover photos

**`media-service.ts`** (~1,130 lines) — MediaItem CRUD, gallery item construction (`toGalleryItem`), person/session/set gallery queries, headshot management, usage/link management, batch operations, duplicate detection, similar image search. `getPersonEntityMedia`/`getPersonMediaForEntity` return a body feature's photos ordered by `[sortOrder, createdAt]` (first = body-map hover cover). `setEntityMediaCover(personId, entityModel, entityId, mediaItemId)` makes a photo the cover by rewriting `PersonMediaLink.sortOrder` **scoped by the entity FK** (`moveToFront` helper) so the same image's other links are untouched — distinct from `reorderPersonMediaAction` which is `{personId, mediaItemId}`-scoped. `getHeadshotsForPersons(personIds, slot?)` resolves the displayed framing per person (ADR-0016): no `slot` → the avatar = the **representative** of the avatar-source (Headshot) Profile category; `slot=N` → the representative of `cat_profile_slot{N}` (the people-browser framing selector). `HeadshotData` carries `mediaItemId` so the hero lead de-dupes against the gallery. (The legacy `slot`/`isAvatar` columns + `HEADSHOT` links + `getPersonHeadshots`/`getPersonSlotState`/`getFilledHeadshotSlots` were retired in ADR-0016 slice 6e-2.)

**`set-service.ts`** (~820 lines) — Set CRUD, credit resolution, participant rebuilding, session link management, media bridging (`addExistingMediaToSet`, `syncSetSessionLinks`). `getSuggestedResolutions(rawName, channelId)` uses a three-tier priority: (1) alias+channel exact match ("Known alias on this channel"), (2) previously-resolved same rawName, (3) frequent in channel. `resolveCreditRaw()` auto-matches `rawName` to `PersonAlias.nameNorm`, sets `resolvedAliasId`, populates `creditNameOverride` on `SessionContribution`, and returns `suggestNewAlias: true` when no alias exists.

**`session-service.ts`** (~450 lines) — Session CRUD, merging, reference session management (auto-created per-person, type=REFERENCE)

**`contribution-service.ts`** (~500 lines) — Session contributions (person+role), contribution skills with auto PersonSkill/DEMONSTRATED event creation, skill media mapping, SetParticipant rebuild. `addSessionContribution()` auto-matches `creditNameOverride` to `PersonAlias.nameNorm` and sets `resolvedAliasId`.

### Domain Services

**`relationship-service.ts`** (ADR-0022) — Inter-person network. `getPersonCoOccurrence(personId)` (held co-occurrence — UI "Worked with"; computed from promoted `SetParticipant` **+ not-yet-promoted staged `StagingSet.participantIcgIds` resolved to Persons**; `getConnectionsForPerson` dedupes "Mentioned" claims and drops any counterpart already under "Worked with"); `getContacts()` / `countActiveContacts()` / `setContactIgnored()` (the `Contact` ghost register; `getContacts` also computes `unlocksSetCount` via `computeUnlockCounts` — APPROVED, CONFIRMED-archive staging sets where the contact is the sole non-curated participant — default sort "unlocks", and excludes contacts whose icgId is already a Person); `reconcileContacts(tx, icgId, personId)` (auto-retire a ghost by exact ICG-ID) and `linkContactToPerson(tx, refId, personId)` (manual), sharing `repointContactToPerson` (repoint `ClaimedCollaboration` + `PersonRelationship` edges, then delete the ref). Reconcile is invoked from `createPersonRecord` and both `importPerson` paths; claims/ghosts are written by `importCoModel`, run by `autoImportBatchCoModels` (import-executor) either as a ride-along at the end of `importPerson` (brand-new subject) **or at parse time from the upload route when the subject Person already exists** (re-imports — so co-model Contacts + claims are ungated by the ADR-0009 attribute review). Staged-set participant Contacts are upserted at parse time in `createStagingSetsForBatch`. Wrapped by `contact-actions.ts`. `getPersonConnections` (in `person-service.ts`) reads curated `PersonRelationship` person-counterparts.
**`alias-service.ts`** — Alias CRUD, channel linking, bulk import, merge. `getPersonAliases()` returns `creditCount` (combined `SetCreditRaw` + `SessionContribution` usages via `resolvedAliasId`). `createAlias()` also accepts `channelIds` to link at creation time and triggers participant-status refresh.
**`skill-service.ts`** — PersonSkill/SkillEvent CRUD, timeline, event media
**`skill-catalog-service.ts`** — SkillGroup/SkillDefinition catalog CRUD
**`physical-attribute-catalog-service.ts`** — PhysicalAttributeGroup/PhysicalAttributeDefinition catalog CRUD
**`era-service.ts`** — Era CRUD: `getBaselineEraId`, `findOrCreateEraForDate` (legacy year-bucket auto-draft for non-physical-change flows), `autoClusterDeltaIntoDraftEra` (Slice 7 / ADR-0006: ±AUTO_CLUSTER_WINDOW_MONTHS proximity clustering for the record-physical-change flow; `null` date → dedicated dateless draft Era), `deleteDraftEraIfEmpty` (Slice 8 / ADR-0006: garbage-collect a draft Era after the last member leaves), `getPersonEras` (picker list), `createEraBatch` (one-shot create with deltas + body mark/mod events), `updateEra` (clears `isDraft` on any edit), `deleteEra` (cascades + orphan cleanup), `getPersonEraContributions` (ADR-0004 reverse-nav — sessions filed into each era).
**`current-state-service.ts`** — `recomputePersonCurrentState(tx, personId)` (in-tx, the canonical fold trigger) + `recomputePersonCurrentStateStandalone` + `rebuildAllCurrentState` + `verifyCurrentStateIntegrity`. Wraps the SQL function `app_recompute_person_current_state(p_id?)` which mirrors `foldScalarDeltas` (TS, in `person-service.ts`). Both folds documented in ADR-0001 § fold sort order.
**`person-service.ts`** — `getPersonWithDetails`, `deriveCurrentState` (full fold incl. body marks/mods/procedures/skills/identities), `foldScalarDeltas` (canonical TS scalar fold with `{ asOf }` cutoff option), `deriveAppearanceAtShoot(eras, asOf)` (lightweight scalar snapshot for participant cards), `defaultEraForSessionDate(eras, sessionDate)` (era-picker default), `getPersonSessionWorkHistory` (work timeline, includes `eraId` per session).
**`category-service.ts`** — MediaCategoryGroup/MediaCategory CRUD, person category population counts
**`collection-service.ts`** — MediaCollection CRUD, item management
**`tag-service.ts`** — TagGroup/TagDefinition registry CRUD, search, merge, usage counts
**`entity-tag-service.ts`** — Entity tagging (add/remove/set tags on any entity), dual-storage sync (join tables + String[] cache)
**`plausibility-service.ts`** — `computePlausibilityIssues(person)` returns date/age plausibility warnings; `getQuickPlausibilityCount(person)` returns count for badge display

### Entity Services

**`label-service.ts`**, **`network-service.ts`**, **`channel-service.ts`**, **`project-service.ts`** — Standard CRUD for each entity

**`artist-service.ts`** — Artist CRUD, search, stats (set/channel/media counts from resolved credits), career listing (sets grouped by channel). Artists are lightweight behind-camera entities (name, nationality, bio) separate from the deep Person model. Linked via `SetCreditRaw.resolvedArtistId` — bypass SessionContribution chain entirely.

### Infrastructure Services

**`motif-template-service.ts`** — Alignment Templates (`MotifTemplate`): output aspect + `bakeLongSide` + target keypoints (frame fractions). A template binds to a locus `MediaCategory` (`MediaCategory.alignmentTemplateId`, 0:1, ADR-0014/0016) — every template is category-bound (the legacy profile-`slot` weld was retired). CRUD (create/update manage the category binding transactionally) + `getMotifTemplateForCategory`. The **Motif Aligner** (`components/people/motif-aligner.tsx`) loads a source master, the user clicks the template's keypoints, and `lib/image/similarity-transform.ts` (pure, unit-tested 2D Umeyama fit) maps them onto the targets; the baked image is uploaded and tagged an **Aligned image** (`MediaItem.motifTemplateId` + `motifProvenance`, ADR-0013) via `assignAlignedImageAction` (DETAIL link to the category, NOT an annotation). Aligned headshots display via an aspect-preserving variant in `headshotDataFromLink`. Authored at `/settings/catalogs/motif-templates` (locus-category bind); launched from the reference-session **ProfileManager** (Profile framings) or a person's **Details tab** "Align" button (other categories, via `getAlignmentTemplateForCategoryAction`) → `CrossSessionPicker`. The definition editor (`components/settings/motif-templates-catalog.tsx`) supports a **translucent reference-image underlay** for placing keypoints (drag-pan / wheel-zoom / rotate / opacity; guide only). Transient by default; **Pin** stores a raw downscaled webp via `POST /api/motif-templates/silhouette` (no MediaItem) and persists `MotifTemplate.silhouetteRef` + `silhouetteTransform` (JSONB). The bake geometry (output dims + the source→output `setTransform` matrix from fractional keypoints) lives in pure `lib/image/bake-geometry.ts`, shared by the browser aligner and the **archive HD re-bake agent** (`scripts/archive-rebake.ts`, ADR-0017) — a local ops tool that mirrors `archive-scan.ts`: pulls `/api/archive/rebake-worklist`, reads each Aligned image's archive original off disk, replays the alignment at full resolution with `@napi-rs/canvas` (identical to the browser bake), and `POST`s it to `/api/archive/rebake/[id]` to overwrite the master-derived bake (`bakeSource MASTER → ORIGINAL`).

**`comparison-service.ts`** — **Comparison** entities (ADR-0015): the members of a SIDE_BY_SIDE collection (ordered 2…N member photos; one collection each). `getComparisonsForCollection` (montage members), `getComparisonDetail` (members + aspect-driver + fitMode + per-cell focal), create/delete, add/remove/reorder members, set aspect-driver, set fit mode (`ComparisonFitMode` COVER/CONTAIN), set per-cell focal. Wrapped by `comparison-actions.ts`. Media deletion cleans `ComparisonItem` via `cascade-helpers`. The stitch-to-JPEG export is deferred (an on-demand canvas export, not a `MediaItem`).

**`atlas-service.ts`** — the **Atlas**, the automatic cross-person comparison surface (ADR-0014). `getAtlasLocusCategories` lists categories with an Alignment Template + their cross-person aligned-image counts and sample thumbs; `getAtlasGridForCategory` returns every person's Aligned image in one locus (identified by `MediaItem.motifTemplateId`, reached via the DETAIL category link), ordered by person display name. Read-only; powers `/atlas` and `/atlas/[id]`.

### Image selection — MediaPickerShell + ZoomableImage

**`components/media/zoomable-image.tsx`** — self-contained pan/zoom image viewer (double-click/pinch zoom toward cursor up to 10×, swaps in `master_4000`; drag/touch pan; optional focal crosshair). **Single source of truth for image zoom** — used by both the media pickers and `gallery-lightbox.tsx` (the lightbox keeps only swipe-nav, tracking `imgZoomed` via `onZoomChange` to suppress swipe while zoomed).

**`components/media/media-picker-shell.tsx`** — the shared big-preview picker engine used by **all** image-selection surfaces. Full-screen split-pane: thumbnail grid (click = preview, focal-aware tiles, optional `metaBadges`) beside a large live **loupe** (`ZoomableImage`); keyboard nav (←/→ / Enter / Space / Esc); **single- or multi-select**; **2-up compare** (mark two → tray → side-by-side → pick winner); responsive collapse to a Quick-Look overlay on narrow viewports. Selection is uncontrolled (`initialSelectedIds`) or **controlled** (`selectedIds` + `onSelectionChange`). Picker-specific UI comes in via `toolbar` / `filterBar` / `uploadSlot` / `footerExtras` slots; defines the normalized `PickerItem` shape. Adopters map their native results → `PickerItem` and keep their own data source + save action:
- `media/cross-session-picker.tsx` (single) — slot standardize/link + body-feature source.
- `people/detail-media-picker-sheet.tsx` (multi, controlled) — body-feature category link; keeps upload + entity-link combobox.
- `sets/media-picker-sheet.tsx`, `people/skill-event-media-picker.tsx` (multi).
- `collections/collection-media-picker-sheet.tsx` — the **mobile Sheet** uses the shell; the **desktop inline draggable panel** (`CollectionMediaPickerPanel`, drag-to-add beside the gallery) is intentionally kept as compact thumbnails.

`/api/media/search` returns `previewUrl` + `zoomUrl` + focal (alongside `thumbUrl`) so the search-backed pickers can drive the loupe + zoom.

### Watchlist Scan Services

**`scrape-source-service.ts`** — The `ScrapeSource` registry (subsumes the legacy hardcoded `DOMAIN_TO_PLATFORM`). `getAllScrapeSources`, `getScannableSources`, `resolvePlatformFromUrl`/`resolveSourceFromUrl` (URL → platform via `domains`, capitalize-domain fallback), and CRUD. `staging-service` resolves the import source URL's platform through this.

**`scan-service.ts`** — Scan cadence + per-platform file building. `getScanCadenceDays`/`setScanCadenceDays` (per-priority intervals in `Setting`), `pageDueLevel` (fresh/due/overdue vs cadence; consumed by `getWatchlist`), and `buildScanFiles(identityIds)` → per-platform `{ fileName, content }` deduped, line-formatted per source (`URL_ONLY` bare, `ICGID_URL` = `icgId\turl`). Stamping of `PersonDigitalIdentity.scannedThroughAt` happens at import time in `import-executor.ts#importDigitalIdentity` (primary source page = DI whose handle is the subject ICG-ID; `extractionDate`, monotonic). See ADR-0012.

### Import Pipeline Services

All import services in `src/lib/services/import/`.

**`parser.ts`** — Pure function: raw file text → `ParsedImportData` (person profile, digital identities, channel appearances, sets with co-model references, co-model directory). Handles edge cases (PowerShell artifacts, em-dash nulls, duplicate detection).

**`matcher.ts`** — Tiered DB matching: exact ID → fuzzy name (pg_trgm). Functions: `matchPerson`, `matchChannel`, `matchLabel`, `matchSet`, `matchAllEntities`. Returns confidence scores (0.0–1.0).

**`staging-service.ts`** — Batch lifecycle: `createBatch` (parse + match + stage), `refreshBatchMatches` (re-run on every page load), `computeDependencies` (block/unblock items), `getAllBatches`, `updateItemStatus`, `markItemImported`. Creates StagingSet records during batch creation with re-import dedup (skips existing by externalId + subjectIcgId). **Completeness** is measured over reviewable item types only (`REVIEWABLE_ITEM_TYPES`) — sets/co-models/credits (`AUTO_FLOW_ITEM_TYPES`) are auto-processed at upload and surfaced as info chips, never gating "Done"; `deriveBatchState` (pure, unit-tested) + `summarizeBatch` produce the enriched `ImportBatchSummary`. **`getImportInbox({ q, sort, doneOffset })`** groups batches per person (by `subjectIcgId`; latest = representative, older = `history` chain) into a `needsReview` head + name/recent-sorted paginated `done` tail; `getImportDonePage` backs `loadMoreImportInboxAction`. **`getImportHistoryForPerson(personId)`** returns a person's import provenance (re-import chain via `subjectIcgId` + `importDeclines`/`deletionTombstones`) for the Research tab's Import History card (`PersonImportHistory`).

**`staging-set-service.ts`** — StagingSet CRUD + querying. `getStagingSetsFiltered` (paginated, filterable by status/person/channel/date/priority/search), `getStagingSetStats`, `getStagingSetComparison` (side-by-side diff vs production Set), `updateStagingSetFields`, `bulkUpdateStatus`, `markStagingSetPromoted` (copies `archiveKey` to promoted Set and linked ArchiveFolder), `getDuplicateCandidates(id)` (the staging set(s) that triggered a duplicate warning — confirmed: same `duplicateGroupId`; probable: same channel + release date AND `isDuplicate`, which excludes the split photo/video **sibling**, `StagingSet.siblingId`). Lifecycle statuses: PENDING → REVIEWING → APPROVED → PROMOTED / INACTIVE / SKIPPED. `StagingSetWithRelations` includes optional `suggestedArchiveFolder?: SuggestedFolderInfo | null` (populated at API layer, not in Prisma include).

**`import-executor.ts`** — Per-entity import: `importItem` dispatches to type-specific functions (`importLabel`, `importChannel`, `importPerson`, `importAlias`, `importDigitalIdentity`, `importSet`, `importCoModel`). Set import routes through `enrichExistingSet` (matched) or `createNewSet` (unresolved), marks StagingSet as PROMOTED.

### Archive Services

**`archive-service.ts`** — Core archive filesystem ↔ DB sync layer.
- `parseRoots(value)` — parse settings value as `string[]` (supports JSON array and legacy single-string)
- `buildFolderName(dateStr, shortName, participant, title)` — pure function, builds folder segment `yyyy-mm-dd-{short} {person} - {title}`
- `buildExpectedPathForStagingSet/Set` — async, computes expected relative path for display
- `buildFullPaths(relativePath, isVideo)` — returns one absolute path per configured root (multi-root support)
- `runMatchingPass(tenant)` (folder→entity) / `runMatchingPassForItem(id, type, tenant)` (entity→folder) — **person-aware** matching over the channel+year window. Scores each candidate by participant-name match (`parseFolderParticipant` extracts the person from the canonical folder name `YYYY-MM-DD-CODE Person - Title`; `folderPersonMatches` compares it against **all** of the entity's participant alias-norms + staging import names) and title `pg_trgm` similarity, then gates via `scoreArchiveMatch` (name match → **HIGH**; else title ≥ `HIGH_TITLE_THRESHOLD` 0.6 → HIGH, ≥ `MEDIUM_TITLE_THRESHOLD` 0.4 → **MEDIUM**, else **no suggestion**) and `pickBestArchiveCandidate` (HIGH → exact-day → similarity). Writes a SUGGESTED `ArchiveLink`. The person signal disambiguates same date+channel collisions; pure helpers are unit-tested in `archive-match-score.test.ts`.
- `upsertArchiveFolders(items)` — ingest scan results; detects renames (by path), moves (by `sidecarKey` → `ArchiveFolder.archiveKey` lookup), and new folders; propagates path changes to linked Set/StagingSet
- `confirmArchiveFolderLink(folderId, setId, type)` — propagates folder's existing `archiveKey` to Set/StagingSet, clears suggestion; returns `{ archiveKey }`. No UUID generation here — key is always already present on ArchiveFolder.
- `rejectArchiveSuggestion(folderId)` — clears `suggestedStagingId/SetId` + `suggestedConfidence`
- `getSuggestedFoldersForStagingSets(ids)` → `Map<stagingSetId, SuggestedFolderInfo>` — batch query keyed by `suggestedStagingId`
- `getSuggestedFoldersForSets(ids)` → `Map<setId, SuggestedFolderInfo>` — batch query keyed by `suggestedSetId`
- `SuggestedFolderInfo` type: `{ folderId, folderName, fileCount, parsedDate, fullPath, confidence: 'HIGH'|'MEDIUM' }`
- `FullIngestItem.sidecarKey?: string` — optional field for scan script to report `_pulseboard.json` archiveKey, enabling cross-drive folder-move detection

**`coherence-service.ts`** — Maintains `SetCoherenceSnapshot` cross-cutting state. Fire-and-forget helpers:
- `onSetPromoted(stagingSetId, setId)` — creates snapshot for newly promoted Set
- `onArchiveFolderLinked(folderId, target)` — updates snapshot archive fields after link confirmation
- `onArchiveScanComplete(folderId, status, fileCount)` — updates snapshot after scan
- `onMediaImportChanged(setId)` — updates `hasMediaInApp` flag

### Infrastructure Services

**`view-service.ts`** — Materialized view refresh (`mv_dashboard_stats`, `mv_person_affiliations`). `PersonCurrentState` is a cache *table*, not an MV — see `current-state-service.ts` for in-tx recomputation
**`stats-service.ts`** — Dashboard KPI counts from `mv_dashboard_stats`
**`activity-service.ts`** — Activity feed queries
**`setting-service.ts`** — App settings (profile image labels, skill level configs)
**`cascade-helpers.ts`** — Transaction-based cascade delete helpers (`TxClient` type)
**`database-maintenance-service.ts`** — Orphan cleanup, duplicate detection, view refresh

---

## 4. Server Actions

All actions in `src/lib/actions/`. Each validates input with Zod, calls services, calls `revalidatePath()`, returns typed results.

**Result types** (from `src/lib/types/action-result.ts`):
- `CrudActionResult` — `{ success: true; id: string } | { success: false; error: string | { fieldErrors } }`
- `SimpleActionResult` — `{ success: boolean; error?: string }`

| File | Key Actions |
|------|------------|
| `person-actions.ts` | `createPerson`, `updatePerson`, `deletePerson`, `updatePersonBio`, `togglePersonWatch`, `markPersonChecked` |
| `scan-actions.ts` | `createScrapeSourceAction`, `updateScrapeSourceAction`, `deleteScrapeSourceAction`, `updateScanCadenceAction` |
| `set-actions.ts` | `createSet`, `updateSet`, `deleteSet`, `addExistingMediaToSetAction`, `reassignSetSessionAction` |
| `session-actions.ts` | `createSession`, `updateSession`, `deleteSession`, `mergeSessionsAction` |
| `media-actions.ts` | `updatePersonMediaLinkAction`, `setRepresentativeAction` (per-category framing rep, ADR-0016), `linkMediaToDetailCategoryAction`, `batchSetUsageAction`, `deleteMediaItemsAction`, `setFocalPointAction`, `resetFocalPointAction`, `reorderPersonMediaAction`, `setPersonMediaFavoriteAction`, `setEntityMediaCoverAction` (body-feature cover, entity-scoped) |
| `motif-template-actions.ts` | `createMotifTemplateAction`, `updateMotifTemplateAction`, `deleteMotifTemplateAction` (all manage slot XOR category binding); `assignMotifImageAction` (slot headshot bake); `assignAlignedImageAction` (category Aligned image — `motifTemplateId`+provenance + DETAIL link, not an annotation); `getAlignmentTemplateForCategoryAction` (lazy fetch for the Details-tab aligner) |
| `appearance-actions.ts` | Body mark/modification/procedure CRUD + event CRUD (~15 actions), `toggleEntityHeroVisibility` |
| `contribution-actions.ts` | `addSessionContributionAction` (accepts `eraId` — propagated across all the person's contribution rows in the session), `updateSessionContributionAction` (same), `removeSessionContributionAction`, `updateContributionConfidenceAction`, `addContributionSkill`, `removeContributionSkill`, `getPersonErasForPickerAction` |
| `skill-actions.ts` | PersonSkill/SkillEvent CRUD, skill event media management |
| `alias-actions.ts` | Alias CRUD, channel linking, bulk import, merge |
| `collection-actions.ts` | Collection CRUD, add/remove items |
| `tag-actions.ts` | Tag group/definition CRUD, entity tagging (add/remove/set), merge |
| `category-actions.ts` | Category group/category CRUD |
| `skill-catalog-actions.ts` | Skill group/definition CRUD |
| `physical-attribute-catalog-actions.ts` | Physical attribute group/definition CRUD |
| `contribution-role-actions.ts` | Role group/definition CRUD |
| `setting-actions.ts` | App setting updates |
| `label-actions.ts`, `network-actions.ts`, `channel-actions.ts`, `project-actions.ts` | Entity CRUD |
| `import-actions.ts` | `getImportBatchesAction`, `deleteImportBatchAction`, `updateImportItemStatusAction`, `importSingleItemAction`, `refreshBatchMatchesAction` |
| `archive-actions.ts` | `recordArchivePathAction`, `clearArchivePathAction`, `confirmArchiveFolderLinkAction` (generates archiveKey, revalidates `/archive`+`/import`+`/sets`), `rejectArchiveSuggestionAction` (revalidates same), `getArchiveItemsAction`, `createStagingSetFromOrphanAction`, `reparseFolderNamesAction`, `deleteArchiveFolderAction`, `toggleMediaQueueAction`, `updateMediaPriorityAction` |
| `database-maintenance-actions.ts` | Orphan/duplicate cleanup, view refresh |

---

## 5. API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/media/upload` | POST | Upload photo → Sharp variants → MinIO → MediaItem |
| `/api/media/search` | GET | Cursor-paginated media search (q, sessionId, personId, excludeSetId) |
| `/api/media/similar` | GET | Find similar images via dHash hamming distance |
| `/api/media/[id]/regenerate-variants` | POST | Re-process profile variants after focal point change |
| `/api/sessions/[id]/media` | GET | Session media with optional DETAIL link status |
| `/api/sessions/[id]/gallery` | GET | Session gallery as `GalleryItem[]` |
| `/api/categories/[id]/media` | GET | Category-linked media for a person |
| `/api/tags/search` | GET | Tag autocomplete search (q, scope) → TagDefinitionWithGroup[] |
| `/api/people/search` | GET | Person search across all aliases (not just common); returns `matchedAlias` when a non-common alias matched |
| `/api/channels/search` | GET | All channels for client-side search |
| `/api/collections/list` | GET | Collections filtered by personId |
| `/api/skill-events/[id]/media` | GET/POST | Skill event media management |
| `/api/import/upload` | POST | Upload text file → parse → create ImportBatch + ImportItems |
| `/api/import/[batchId]` | GET, DELETE | Get batch with items / delete batch |
| `/api/import/[batchId]/refresh` | POST | Force re-run matching for all items |
| `/api/import/[batchId]/items/[itemId]` | PATCH | Update item status or edited data |
| `/api/import/[batchId]/items/[itemId]/import` | POST | Execute import for single item |
| `/api/scan-round/export` | POST | `{ identityIds }` → zip of per-platform scan files (`buildScanFiles`); 400 empty, 404 no scannable URLs |
| `/api/staging-sets` | GET | Filtered staging set list; augments each item with `suggestedArchiveFolder` via batch call to `getSuggestedFoldersForStagingSets` |
| `/api/staging-sets/stats` | GET | Staging set counts by status + match type |
| `/api/staging-sets/[id]` | GET, PATCH | Get/update staging set (fields, status, priority, notes) |
| `/api/staging-sets/[id]/comparison` | GET | Side-by-side diff vs production Set |
| `/api/staging-sets/[id]/duplicates` | GET | The duplicate candidate set(s) that triggered the warning (`getDuplicateCandidates`) — shown in the slide panel |
| `/api/staging-sets/[id]/promote` | POST | Promote staging set to production |
| `/api/staging-sets/bulk-update` | POST | Bulk status change |
| `/api/staging-sets/bulk-promote` | POST | Bulk promote to production |
| `/api/staging-sets/[id]/cover` | POST | Upload cover image (FormData → resize → MinIO) |
| `/api/archive/sidecar/[archiveKey]` | GET | Protected by `ARCHIVE_API_KEY` header. Looks up ArchiveFolder by archiveKey (always present), returns `{ archiveKey, folderName, setId, stagingSetId, title, releaseDate, channel }`. Works for unlinked folders (setId/stagingSetId null). 404 only if archiveKey unknown. |
| `/api/archive/folders/search` | GET | Search unlinked archive folders (`linkedSetId=null AND linkedStagingId=null`). Params: `q` (title search), `shortName` (chanFolderName filter), `year`, `limit` (max 50). Used by `ArchiveFolderPicker` |
| `/api/archive/rebake-worklist` | GET | Protected by `ARCHIVE_API_KEY` + `x-tenant-id` (agent endpoint, ADR-0017). Returns `{ count, entries[] }` — the HD-re-bake worklist (`getHdRebakeWorklist`, `hd-rebake-service.ts`): each `MASTER` Aligned image whose source resolves to an on-disk archive original, with `{ alignedMediaItemId, fullPath, filename, keypoints (0..1 fractions), template geom, sourceHash, source dims }`. Optional `?personId` / `?sessionId` scope. |
| `/api/archive/rebake/[id]` | POST | Protected by `ARCHIVE_API_KEY` + `x-tenant-id` (agent endpoint, ADR-0017). Multipart `file` = the HD bake for Aligned image `id`. Regenerates variants under a fresh prefix (`uploadPhotoToStorage`, cache-bust), **overwrites the Aligned MediaItem in place** (variants/size/dims), flips `bakeSource → ORIGINAL`, stamps `motifProvenance.hdBakedAt`. Guards non-Aligned (`!motifTemplateId` → 400) / missing (404) / undecodable (422). Old blobs orphaned (GC). |
| `/api/flags/[code]` | GET | Country flag image |

---

## 6. Component Architecture

### Directory Structure

```
components/
├── layout/           # AppShell, Sidebar, TopBar, MobileDrawer, BackToTop, nav-items (shared nav list + getSectionLabel), providers (theme, palette, density, hero, sidebar)
├── dashboard/        # KpiGrid, KpiCard, ActivityFeed, QuickActions
├── gallery/          # GalleryLightbox, GalleryInfoPanel, GalleryFilmstrip, JustifiedGrid, CarouselHeader
├── media/            # MediaManager, MediaGrid, BatchUploadZone, DuplicateReviewDialog
├── people/           # 35+ files: list/detail/add/edit, body features, aliases, eras, skills, career
├── sets/             # 15+ files: list/detail, credits, sessions, evidence, media picker
├── sessions/         # 15+ files: list/detail, contributions, merge, status
├── projects/         # ProjectList, ProjectCard, add/edit sheets
├── labels/           # LabelList, LabelCard, add/edit sheets
├── channels/         # ChannelList, ChannelCard, add/edit sheets
├── networks/         # NetworkList, NetworkCard, add/edit sheets
├── collections/      # CollectionList, CollectionDetailGallery, media picker
├── staging-sets/     # StagingSetsWorkspace, StagingSetFilterBar, StagingSetGrid, StagingSetRow (inline archive section), ArchiveFolderPicker (sheet for linking unlinked folders)
├── import/           # ImportWorkspace, ImportItemDetail, ImportStatusBadge, ImportUploadZone, ImportBatchList
├── settings/         # SkillCatalogManager, MediaCategoryManager, ContributionRoleManager
├── shared/           # TagInput, TagPicker, TagChips, PartialDateInput (supports modifier+source props), CountryPicker, EntityCombobox, DeleteButton, BrowserToolbar (+ GroupBy dropdown), BodyRegionPicker, FlagImage, GroupHeader (collapsible section header, level 1 + 2)
└── ui/               # shadcn/ui primitives (auto-generated, do not edit)
```

### App Shell & Scrolling (invariant)

`AppShell` (`components/layout/app-shell.tsx`) uses **independent scroll regions**, not document scrolling. The outer row is `flex h-screen overflow-hidden`; the chrome — `Sidebar` (left, `h-screen`, internal `overflow-y-auto` nav) and `TopBar` (top, persistent, shows the route's section label via `getSectionLabel()` + the mobile drawer trigger) — never moves. **Only `<main id="app-scroll">` scrolls** (`overflow-y-auto overflow-x-hidden`, no top padding so the sticky filter toolbar can stick flush under the top bar).

Invariants:
- The window does **not** scroll (`window.scrollY` is always 0). Use `getAppScrollEl()` (`lib/scroll-container.ts`) for any scroll read/write. Browse scroll-restoration (`person-list`, `set-grid`, `session-grid`) and the career year-jump all target the container's `scrollTop`.
- Because `<main>` is the scroll container, it is the containing block for `position: sticky` descendants. `BrowserToolbar` is `sticky top-0` and publishes its measured height to the `--toolbar-h` CSS var (ResizeObserver); nested sticky headers (`GroupHeader` level 1, career year headers) offset beneath it via `top-[var(--toolbar-h,0px)]`.
- `BackToTop` is rendered once in the shell, watches `#app-scroll`, and fades in past 600px.
- Nav items live in one place (`layout/nav-items.tsx`) consumed by `Sidebar`, `MobileDrawer`, and `TopBar` — do not redeclare them.

### Key Component Relationships

**Person Detail Page:**
```
page.tsx (Server Component — calls ~12 service functions)
  └── PersonDetailTabs (Client — receives all data as props, manages tab state)
        ├── OverviewTab — HeroCard (plausibility badge), BasicInfoPanel, PhysicalStatsPanel, HistoryPanel, KpiStatsPanel, DataQualityCard (plausibility warnings)
        ├── AppearanceTab (extracted file) — Physical stats, BodyFeaturesCard (Phase G Slice 11: unified Body Marks + Body Modifications with populated-only subsections + "+ Add body feature" type-picker popover). Each row's expanded view uses the ExpandedEntityView shell (Phase G Slice 12: 4-section structure — toolbar + status pill at top-right, then PROPERTIES / PHOTOS / LIFECYCLE labelled sections separated by faint dividers; populated-only per section). Phase G Slice 13: AppearanceBodyMap is Level-2 interactive — region click toggles a filter chip on the features card; hovering a region or a list row glows the matching counterpart (bidirectional via shared `hoveredRegion` / `selectedRegion` state in AppearanceTab). Removed entities render as outlined dots in the map's region tooltip. Phase G Slice 14: the region tooltip is the shared `EntityHoverTooltip` component (bounded ~280px, focal-cropped thumbnail + type/region/description per entity, 300ms reveal delay). Each list row carries DOM id `body-feature-{entityId}`; clicking a tooltip entity scrolls that row into view and briefly highlights it via `hoveredRegion`. Cosmetic Procedures card removed in Phase G Slice 5; surgical changes flow through ScalarDelta with cause=SURGICAL.
        ├── PersonDetailsTab — Category groups with expandable photo galleries via /api/categories/[id]/media
        ├── PersonSkillsTab — Category-grouped skills, event timeline, inline media
        ├── PersonAliasesTab — By-alias/by-channel views, multi-select, import/merge
        ├── CareerTab — Unified chronological timeline (ADR-0011). Header stack: compact career row · Label affiliation pills (act as multi-select filter via `clabel` URL param; show `n/m` photo/video counts; computed by `deriveAffiliations(workHistory, stagingWorkHistory)`) · multifacet toolbar (channel/rating/era/archive — channel dropdown filters to count > 0; URL params `channel`, `crating`, `era`, `archive`, `clabel`, `csort`) · `CareerStatsStrip` (claimed-vs-promoted-vs-staged gap view: photosets/videos/covers × have/claimed + completeness bar; covers derived; data from `getCareerStats()` — claimed read from `Person.claimedPhotosets/claimedVideos`, promoted = `set.count` by type, staged = pipeline-status `stagingSet.count` with `matchedSetId: null` AND a CONFIRMED `archiveLinks` (only staged sets actually held on disk); claimed parsed from the imported biography by `parseClaimedStats()`, guarded against re-import by `Person.claimedStatsUserSet`, with a free-text `Person.claimedStatsNote` provenance shown under the table) · type tabs (with `have/claimed` badges). Timeline driven by `career-service.ts` primitives: `TimelineSection` (year groups + sticky headers + narrow density-by-bg-fill `YearScrubber`), `TimelineSetRow` (cover · meta lines · status pill · archive pill · star rating; 3rd line for co-participants on multi-cast sets; right-side strip of 4 sample thumbnails for promoted photo rows). Cover-hover `SetHoverPreview` shows just an enlarged cover (240×320 photos / 480×270 videos) anchored to the small cover with viewport-clamped fallback.
        ├── ConnectionsTab (ADR-0022; renamed from "Network") — three sections: **Personal** (curated `PersonRelationship`, typed via `RelationshipRole` with inverse label; add via role+counterpart picker incl. "new contact" → name-only `Contact`; delete) via `relationship-actions.ts`; **Work — held** (`getPersonCoOccurrence`, ranked); **Claimed** (`ClaimedCollaboration`, refs outlined). A **Lists | Graph** toggle switches to `ConnectionsGraph` — an ego force-graph (`d3-force`, rendered to SVG; center = the person, edges typed/coloured by category, work width by shared-set count, claimed dashed, refs outlined; click a node to navigate; capped at 70 nodes). The sidebar `/networks` entity is unrelated (org grouping above Labels).
        └── PhotosTab — JustifiedGrid → GalleryLightbox with full info panel
```

**Session Detail Page:**
```
page.tsx (Server Component)
  ├── [type=REFERENCE] → MediaManager → MediaGrid + GalleryLightbox + GalleryInfoPanel (with ReferenceContext)
  ├── [type=PRODUCTION] → SessionProductionGallery → JustifiedGrid + GalleryLightbox
  ├── BatchUploadZone — drag-drop upload with duplicate detection
  └── SessionContributionSkills — contribution management with skill picker
```

**Gallery/Lightbox System:**
```
JustifiedGrid or MediaGrid (thumbnail display)
  → GalleryLightbox (modal viewer)
       ├── SimpleLightbox (image display with focal point overlay)
       ├── GalleryFilmstrip (bottom thumbnail strip)
       └── GalleryInfoPanel (right sidebar metadata editor)
            ├── Usage toggles (PROFILE/HEADSHOT/DETAIL/PORTFOLIO)
            ├── Headshot slot assignment
            ├── Category/entity linking
            ├── Collection assignment
            ├── Focal point section (click-to-set, fire-and-forget regeneration)
            ├── Tags, notes, body regions
            └── Delete action
```

**Import Workspace:**
```
page.tsx (Server Component — calls refreshBatchMatches)
  └── ImportWorkspace (Client — split panel layout)
        ├── Header — batch info, status summary, Refresh + Import All buttons
        ├── Entity tabs — Person | Aliases | Identities | Channels | Sets | Co-Models
        ├── Left panel — item list with status badges, match details, blocked reasons
        └── Right panel → ImportItemDetail
              ├── Match info (green) / Blocked warning (orange) / Duplicate warning (amber)
              ├── Type-specific detail views (PersonDetail, SetDetail, etc.)
              └── Import / Skip action buttons
```

**Shared Helpers** (`person-detail-helpers.tsx`):
- `SectionCard` — glassmorphism card with icon, title, badge
- `EmptyState` — italic placeholder text
- `InfoRow` — label + value row for detail displays

---

## 7. State Management

| Pattern | Where Used | Mechanism |
|---------|-----------|-----------|
| URL searchParams | `/people`, `/sets`, `/sessions`, `/projects` filters, sort, groupBy | `useSearchParams()` + `router.push()` |
| React `useState` | Modals, selections, form inputs, lightbox index | Local component state |
| React Context | Theme, palette, density, hero layout, sidebar | Provider components in `layout/` |
| Server revalidation | After all mutations | `revalidatePath()` in server actions |
| Optimistic UI | Focal point setting, tag edits | Local state updated before server confirms |
| sessionStorage | Group collapse state (people/sets browsers) | `useCollapseState(storageKey, groupBy)` — dual-mode (defaultCollapsed + exceptions Set); keyed by `${storageKey}:${groupBy}` |

No external state library (Redux, Zustand, etc.).

### Grouping Architecture

Browser pages (`/people`, `/sets`) support a `groupBy` URL param. When active:
- Server loads up to 500 items (instead of the default 50-per-page cursor)
- Client groups the flat array using `computeGroups` / `buildNestedGroups` from `src/lib/grouping.ts`
- `sortGroupKeys` orders sections (alpha, year/newest-first, age-bracket order)
- `GroupHeader` renders collapsible section headers (level 1 = primary, level 2 = nested sub-sections)
- `useCollapseState` manages expand/collapse per section, persisted to sessionStorage
- Infinite scroll is disabled when groupBy is active (all items loaded at once)

---

## 8. Database Schema & Relationships

### Entity Relationship Overview

```
Person ──┬── PersonAlias[] ──── PersonAliasChannel[] ──── Channel
         ├── Era[] ──┬── ScalarDelta[] ──── PhysicalAttributeDefinition ──── PhysicalAttributeGroup
         │           ├── BodyMarkEvent[] ──── BodyMark
         │           ├── BodyModificationEvent[] ──── BodyModification
         │           ├── DigitalIdentityEvent[] ──── PersonDigitalIdentity
         │           ├── InterestEvent[] ──── PersonInterest
         │           └── PersonSkillEvent[] ──── PersonSkill ──── SkillDefinition ──── SkillGroup
         ├── PersonCurrentState (1:1, cache for the fold output)
         ├── PersonMediaLink[] ──── MediaItem ──── Session
         ├── PersonRelationship[] ──── RelationshipEvent[]
         ├── PersonEducation[], PersonAward[]
         ├── SessionContribution[] ──┬── ContributionSkill[] ──── SkillDefinition
         │                           └── ContributionRoleDefinition ──── ContributionRoleGroup
         └── referenceSession (Session, 1:1 unique)

Session ──┬── MediaItem[]
          ├── SessionContribution[]
          └── SetSession[] ──── Set

ImportBatch ──── ImportItem[] (staged entities with match data, dependency tracking)

StagingSet ──┬── SetCoherenceSnapshot? (archiveStatus, archiveFileCount, archiveFolder link)
             └── ArchiveFolder? (via linkedStagingId or suggestedStagingId)

Set ──┬── SetCoherenceSnapshot? (archiveStatus, archiveFileCount, archiveFolder link)
      └── ArchiveFolder? (via linkedSetId or suggestedSetId)

ArchiveFolder ──┬── Set? (linkedSetId)
               ├── StagingSet? (linkedStagingId)
               ├── suggestedSet? (suggestedSetId + suggestedConfidence)
               └── suggestedStagingSet? (suggestedStagingId + suggestedConfidence)

Set ──┬── SetMediaItem[] ──── MediaItem
      ├── SetParticipant[] (derived from contributions)
      ├── SetCreditRaw[] (unresolved credits)
      ├── SetLabelEvidence[]
      └── Channel ──── ChannelLabelMap[] ──── Label ──── LabelNetworkLink[] ──── Network

MediaItem ──┬── PersonMediaLink[] (usage: PROFILE/HEADSHOT/DETAIL/PORTFOLIO)
            ├── SetMediaItem[]
            ├── MediaCollectionItem[] ──── MediaCollection
            └── SkillEventMedia[] ──── PersonSkillEvent
```

### Key Fields

- **Set**: `externalId` (optional, unique) — external source ID from import files; `archiveKey` (optional, unique) — stable UUID propagated from ArchiveFolder at link-confirm time; survives folder moves and drive migrations
- **StagingSet**: `archiveKey` (optional, unique) — same as Set; copied to promoted Set via `markStagingSetPromoted`
- **ArchiveFolder**: `archiveKey` (**required**, unique, `@default(uuid())`) — stable folder identity UUID generated at first scan time; independent of Set/StagingSet link status; enables sidecar-based lookup for cross-drive folder move detection; `suggestedConfidence` (`'HIGH'` | `'MEDIUM'` | null) — set by `runMatchingPass`
- **ImportBatch**: `subjectIcgId`, `rawContent`, `status` (PARSING→REVIEW→IMPORTING→COMPLETED), `previousBatchId` (self-relation for versioning)
- **ImportItem**: `type` (PERSON/PERSON_ALIAS/DIGITAL_IDENTITY/CHANNEL/LABEL/SET/CO_MODEL/CREDIT), `status` (NEW/MATCHED/PROBABLE/BLOCKED/IMPORTED/SKIPPED/FAILED), `data` (JSON), `editedData` (JSON), `dependsOn` (String[]), `matchedEntityId`, `matchConfidence`
- **Person**: `icgId` (unique, mandatory), `status` (active/inactive/wishlist/archived), `rating`, `pgrade`
- **PersonAlias**: `type` (common/birth/alias), `nameNorm` for search. One `common` alias = display name
- **Era**: `isBaseline` (one per person, **dateless** — see ADR-0001), `isDraft` (auto-created via `findOrCreateEraForDate`; cleared by `updateEra` on any edit), `date` + `datePrecision` + `dateModifier` for non-baseline
- **ScalarDelta**: one row per attribute change, filed into an Era; has `attributeDefinitionId` + `value` + own `date`/`datePrecision`/`dateModifier`. Folded into `PersonCurrentState` via `app_recompute_person_current_state` SQL function (mirrors TS `foldScalarDeltas`)
- **PersonCurrentState**: cache table holding folded physical state per person (1:1). Recomputed in-tx with every fold-input mutation via `recomputePersonCurrentState(tx, personId)`. Unique index on `personId`
- **Session**: `type` (REFERENCE/PRODUCTION), `status` (DRAFT/CONFIRMED), `personId` (unique FK for REFERENCE type)
- **MediaItem**: `variants` (JSON — profile/gallery sizes), `focalX`/`focalY` (0-1 normalized), `hash` (SHA256), `phash` (dHash)
- **PersonMediaLink**: `usage` enum, `slot` (for HEADSHOT), `categoryId` (for DETAIL), entity FKs (`bodyMarkId`, etc.)
- **PhysicalAttributeGroup/Definition**: Admin catalog for typed scalar attributes — every ScalarDelta points at one definition. Mirrors SkillGroup/SkillDefinition pattern. `statusBearing` (Boolean, default FALSE) gates the AttributeStatus UI per definition
- **PersonCurrentState.presentBodyFeatureTypes** (Slice 15): String[] of distinct mark + modification types where `status <> 'removed'`. Drives the hero's binary type-presence chips. GIN-indexed for future filter queries. Populated by `app_recompute_person_current_state`. Replaces the per-mark `heroVisible/heroOrder` UI; the legacy `has*` booleans stay in the schema until Slice 17 (people-search-service still queries them)
- **ScalarDelta.cause** (ADR-0007): `DeltaCause` enum (`NATURAL` / `SURGICAL` / `OTHER`). Drives the derived `AttributeStatus` (NATURAL / ENHANCED / RESTORED) on status-bearing attrs; cached in `PersonCurrentState.attributeStatuses` (JSON)
- **CosmeticProcedure / CosmeticProcedureEvent** (legacy, deprecated Phase G Slice 5): tables remain in the schema during soak but are no longer authored — the import workflow and the Appearance tab no longer create or surface them. To be dropped in Slice 17 after the new model has soaked in prod

### Materialized Views

| View | Purpose | Refresh |
|------|---------|---------|
| `mv_dashboard_stats` | KPI counts | After bulk ops, startup |
| `mv_person_affiliations` | Person→label set counts | After set/contribution changes |

`mv_person_current_state` was **replaced** by the `PersonCurrentState` cache
**table** (Phase B / ADR-0003). The cache is recomputed in-transaction with
every fold-input mutation via `recomputePersonCurrentState(tx, personId)` —
no MV refresh needed.

### Normalized Search

All searchable entities have `nameNorm`/`titleNorm` fields with `pg_trgm` trigram GIN indexes + `unaccent` extension for accent-insensitive fuzzy matching.

---

## 9. Key Architectural Invariants

1. **Hard deletes only** — No soft-delete, no `deletedAt`. All deletes cascade via `cascade-helpers.ts` inside `$transaction` blocks.

2. **Reference sessions** — Auto-created one-per-person (type=REFERENCE, `personId` unique FK). Cannot be manually created/edited/deleted/merged. The authoritative source for a person's photos.

3. **Guard clauses inside transactions** — All check-then-act patterns (e.g., "is this a reference session?") run inside `$transaction` to avoid TOCTOU races.

4. **Server actions are the write boundary** — Components never call services directly for mutations. Actions validate with Zod, call services, revalidate paths.

5. **Photo variants** — Every uploaded image generates: `master_4000` (WebP q88, 4000px LS — processing master, replaces raw original), `gallery_512` (WebP q85, 512px LS), `view_1200` (WebP q83, 1200px LS), `full_2400` (WebP q85, 2400px LS), `profile_128/512/768` (WebP q82, 4:5 cover crop). Legacy variants `original`, `gallery_1024`, `gallery_1600`, `profile_256` remain in DB for existing images (backward-compat). Stored as JSON in `MediaItem.variants`. URLs built via `buildPhotoUrls()` / `buildUrl()` from `src/lib/media-url.ts`. Lightbox uses `full_2400 ?? gallery_1600 ?? gallery_1024 ?? original`.

6. **Focal points** — `focalX`/`focalY` (0-1 normalized) on MediaItem. `focalStyle()` utility returns `{ objectPosition }` CSS. Variant regeneration is fire-and-forget via `/api/media/[id]/regenerate-variants`.

7. **Contribution → skill progression** — `addContributionSkill()` auto-creates/upgrades PersonSkill and creates DEMONSTRATED event tagged with `[session:ID]`.

8. **Entity media linking** — DETAIL usage on PersonMediaLink can be categorized (`categoryId`) and linked to specific entities (`bodyMarkId`, `bodyModificationId`). Categories driven by `entityModel` field on MediaCategory. The first photo by `sortOrder` is the entity's body-map cover; reorder via `setEntityMediaCover` (entity-FK-scoped). (The `cosmeticProcedureId` column remains in the schema during the Slice 5 → Slice 17 soak but is no longer written by any code path.)

8b. **Alignment templates & Aligned images** (ADR-0013/0014) — `MotifTemplate` (aspect, `bakeLongSide`, target keypoints) binds to a locus `MediaCategory` (`MediaCategory.alignmentTemplateId`, 0:1). A baked **Aligned image** carries `MediaItem.motifTemplateId` + `motifProvenance` ({sourceMediaItemId, points, matrix}) — its identity, **never** `isAnnotation` (annotations are a separate crop/highlight concept). Aligned images are a derived copy in the reference session that retains provenance (re-bakeable). **Visibility:** excluded from the raw reference gallery and cross-session source pickers (`getPersonMediaGallery` / `getPersonMediaAcrossSessions` / `getPersonSessionsWithMedia` filter `motifTemplateId: null`), shown in their category (Details tab, with an "aligned" badge) and the cross-person Atlas (`/atlas`). Aligned headshots display via an aspect-preserving variant (not the 4:5 `profile_*` crop). The legacy `MotifTemplate.slot` weld was retired in ADR-0016 — every template is category-bound (the former profile slots are now `cat_profile_slot{N}` categories of the **Profile** group).

8c. **Profile framings are ordinary categories** (ADR-0016, slice 6e-2 landed) — the former 5 profile slots are categories of a **Profile** `MediaCategoryGroup` (`grp_profile`; `cat_profile_slot{N}`, Headshot = `isAvatarSource`). A category holds many aligned images; the displayed image per `(person, category)` is the **representative** (`PersonMediaLink.isRepresentative`; explicit, else most recent). The **avatar ≡ the Headshot representative**. The reference-session **ProfileManager** (`components/people/profile-manager.tsx`) is the home for filling framings (per category: rep image, ★ rep picker when >1, Standardize/Link). The people browser's **ProfileViewSelector** picks which framing's representative the cards show (Headshot = default; number-key hotkeys). The retired `slot`/`isAvatar` columns, `HEADSHOT` links, the Slot Manager, the metadata-panel/lightbox slot-assign UIs, and the `p-img` slot-label settings are all gone.

8a. **Image editing sources the master** — the crop/annotation editor (`AnnotationEditor`) always loads `urls.original` (the best-quality master: `master_4000` for new uploads, raw `original` for legacy), never a display variant, so edits aren't silently downscaled.

9. **SetParticipant is derived** — Rebuilt from SessionContribution via `rebuildSetParticipantsFromContributions()`. Never edited directly.

10. **Server action serialization** — Cannot pass arrow functions from Server → Client components. Use `.bind()` for callbacks (e.g., `onDelete={deleteAction.bind(null, id)}`).

11. **Era fold canon (ADR-0001)** — The mapping `(eras + scalar deltas + events) → current state` lives in two places: `foldScalarDeltas` (TS, `person-service.ts`) and `app_recompute_person_current_state` (SQL function). They must produce identical winners; opposite literal sort directions but same semantics. When changing one, audit the other.

12. **In-tx cache recompute (ADR-0003)** — Every mutation that writes a fold input (ScalarDelta, BodyMarkEvent, etc.) MUST end its `$transaction` with `recomputePersonCurrentState(tx, personId)`. The `PersonCurrentState` cache is the only thing the read path queries — it cannot drift because the mutation path can't commit without writing it.

13. **Event-derived status projections (ADR-0002)** — `BodyMark.status` and `BodyModification.status` are projections of their event logs. Every event mutation calls the matching `recompute*Status(tx, id)` helper from `cascade-helpers.ts` in the same transaction. (Legacy `CosmeticProcedure.status` followed the same pattern but is no longer surfaced — see invariant about the Slice 5 deprecation.)

14. **Era-linked participation lives on SessionContribution, not SetParticipant (ADR-0004)** — A Session is one shoot = one Era. A Set may be a compilation spanning multiple Eras for the same person. The `eraId` is therefore authored on `SessionContribution` (source of truth); `SetParticipant` is derived. `addSessionContribution` / `updateSessionContribution` propagate `eraId` across every contribution row for the same `(sessionId, personId)` in one tx.

15. **Baseline Era is dateless** — Every Person has exactly one baseline Era (`isBaseline: true`, `date: null`). It is folded first by virtue of its flag, not its date. The only hard temporal floor for sanity checks is the Person's birthdate.

16. **Draft Eras are nudges, not gates** — `findOrCreateEraForDate` and `autoClusterDeltaIntoDraftEra` set `isDraft: true` when they spawn an Era to host a quick-edit. Drafts behave identically to curated Eras; the flag is cleared on any user edit (`updateEra`). The History panel surfaces drafts with an amber dashed dot + pill.

17. **Emergent Era authoring (ADR-0006, Slices 7+8+9)** — The record-physical-change sheet has **no Era picker**. The user picks one of three intents: `on-date` (auto-cluster into a draft Era around the date, ±AUTO_CLUSTER_WINDOW_MONTHS), `dateless` (file into the person's dedicated dateless draft Era — semantically distinct from baseline), or `baseline` ("this was always true"). Initial radio value is inferred from history: if the person has no prior physical data, default to `baseline`; otherwise default to `on-date`. **Sticky-only-for-curated (Slice 8):** when a physical change is edited, the new intent/date routes through `autoClusterDeltaIntoDraftEra`. Source rules:
    - **Curated source** (`!isDraft && !isBaseline`) → deltas stay in source; date fields update in place.
    - **Baseline source** → deltas move only if the user explicitly picks a non-baseline intent.
    - **Draft source** → free re-cluster on every date/intent change.
    After any move, the source draft Era is garbage-collected via `deleteDraftEraIfEmpty` if it has zero remaining members. **Per-delta editing (Slice 9):** the same sticky-rule logic applies at delta granularity via `editScalarDeltaAction(deltaId, ...)` — used by the inline editor in the Undated drawer so individual changes can be dated without disturbing siblings.

18. **Curation nudge + promotion (ADR-0006, Slice 9)** — Draft Eras with ≥`NUDGE_THRESHOLD_DELTAS` (3) populated `ScalarDelta`s surface a soft inline nudge on the Overview History panel. Dismissal is per-Era in `localStorage` with `NUDGE_SUPPRESSION_DAYS` (7-day) freshness; SSR-safe via `useNudgeDismissal(eraId)`. Aggregate count of eligible drafts appears as a badge on the **Overview tab label** via `useDraftErasReadyCount(eras)`. Clicking the nudge opens an inline promotion sheet: name input + checkbox list of member deltas (default all checked). Save calls `promoteEraAction(eraId, personId, { name, splitDeltaIds })` — the source Era becomes curated (`isDraft = false`, `label = name`); unchecked deltas move out to per-date draft Eras via `autoClusterDeltaIntoDraftEra` (one per delta date). Refuses to leave the source Era completely empty.

19. **Undated drawer (ADR-0006, Slice 9)** — The dateless draft Era (one per person, `date IS NULL && isDraft`) renders as an **"Undated changes"** card with soft-amber treatment. Each member delta gets an inline `Set date` affordance opening `ScalarDeltaInlineEditor` — a per-delta mini-form with value + 3-way intent radio + date + cause (if status-bearing). Saving via `editScalarDeltaAction` re-clusters the delta into a dated draft per Slice 8's routing.

---

## 10. Data Flow Examples

### Creating a Person
```
AddPersonSheet (form submit)
  → createPerson(raw) server action
  → createPersonSchema.safeParse(raw)
  → createPersonRecord(data) service
  → Creates Person + common alias + baseline Era (dateless) + Reference Session
  → revalidatePath("/people")
  → Returns { success: true, id }
  → Client navigates to /people/[id]
```

### Uploading a Photo
```
BatchUploadZone (file drop)
  → Compute SHA256 hash + dHash client-side
  → POST /api/media/upload (FormData: file, sessionId, personId)
  → Route: check duplicates by hash/phash
  → If duplicate → return { duplicates } → DuplicateReviewDialog
  → uploadPhotoToStorage() → Sharp variants → MinIO
  → createMediaItemForPerson() → MediaItem + PersonMediaLink
  → Return { mediaItem: { id, filename } }
```

### Setting a Focal Point
```
GalleryInfoPanel → FocalPointSection (click on thumbnail)
  → setFocalPointAction(mediaItemId, x, y, sessionId, personId) — instant DB update
  → Return success immediately
  → Client fires fetch(/api/media/[id]/regenerate-variants) — fire-and-forget
  → API route: download original from MinIO → Sharp crop 4 profile variants → re-upload
  → Panel shows "regenerating..." indicator, fully interactive
```

### Adding a Contribution Skill
```
SessionContributionSkills → skill picker
  → addContributionSkillAction(contributionId, skillDefId, level)
  → addContributionSkill() service (in $transaction):
    1. Create ContributionSkill
    2. Find/create PersonSkill (progressive level upgrade)
    3. Create DEMONSTRATED PersonSkillEvent tagged with [session:ID]
  → revalidatePath
```

### Confirming an Archive Folder Link

```
StagingSetRow — user clicks "Confirm" on HIGH/MEDIUM suggestion
  → confirmArchiveFolderLinkAction(folderId, stagingSetId, 'staging')
  → confirmArchiveFolderLink() service:
    1. Read ArchiveFolder.archiveKey (always present — generated at scan time)
    2. prisma.stagingSet.update({ archiveKey: key })    // propagate folder key to staging set
    3. prisma.archiveFolder.update({ linkedStagingId, suggestedStagingId: null, suggestedConfidence: null })
    4. propagate archivePath to StagingSet
  → onArchiveFolderLinked() — updates SetCoherenceSnapshot
  → revalidatePath('/archive', '/import', '/sets')
  → Row re-renders with green dot + folder name strip
```

### Archive Folder Move Detection via Sidecar

```
External scan script visits a folder on a different drive than before:
  → Reads _pulseboard.json → { archiveKey: "uuid-..." }
  → Sends FullIngestItem { action: 'create', sidecarKey: 'uuid-...', fullPath: newPath, ... }
  → upsertArchiveFolders():
    1. action='create' but sidecarKey present → prisma.archiveFolder.findUnique({ archiveKey: sidecarKey })
    2. Found → treat as move: update fullPath, recompute relativePath
    3. Propagate new relativePath to linked Set.archivePath or StagingSet.archivePath
    4. Call onArchiveScanComplete() for status update
    5. counts.renamed++ (skip normal create)
```

---

## 11. Utilities & Constants

### `lib/utils.ts`
- `cn()` — Tailwind class merge
- `formatRelativeTime(date)` → "2 days ago"
- `getDisplayName(alias, icgId)` → "John (JD-96ABF)"
- `formatPartialDate(date, precision)` → "March 1995" / "Unknown"
- `formatPartialDateWithModifier(date, precision, modifier)` → "~March 1995" / "est. 2020" / "before March 1995"
- `getModifierSymbol(modifier)` → "", "~", "est.", "before", "after"
- `computeAge()`, `computeAgeFromPartialDate()`, `computeAgeAtEvent()`
- `computeAgeWithModifier(birthdate, precision, modifier)` → "~29" (incorporates modifier uncertainty into display)
- `focalStyle(focalX, focalY)` → `{ objectPosition: "X% Y%" }`

### `lib/media-url.ts`
- `buildUrl(key)` → MinIO URL from variant key
- `buildPhotoUrls(variants, fileRef)` → `PhotoUrls` object with all sizes

### `lib/types/action-result.ts`
- `CrudActionResult` — for create/update actions returning an id
- `SimpleActionResult` — for simple success/failure operations

### `lib/constants/`
- `body-regions.ts` — region names, groups, `expandRegionFilter()`
- `body.ts` — body type, hair, ethnicity, nationality options
- `skill.ts` — `SKILL_LEVEL_VALUE/LABEL/STYLES`, `SKILL_EVENT_STYLES`
- `countries.ts` — country list with codes
- `date.ts` — `DATE_MODIFIER_OPTIONS`, `DATE_MODIFIER_SYMBOLS` (EXACT→"", APPROXIMATE→"~", ESTIMATED→"est.", BEFORE→"before", AFTER→"after")

### `lib/validations/`
- Zod schemas for all CRUD inputs: person, set, session, project, label, network, channel, media, era, body-mark, body-modification, cosmetic-procedure, education, interest
