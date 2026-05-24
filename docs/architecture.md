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
| `/people` | `getPersonsPaginated()`, `getHeadshotsForPersons()`, `getDistinct*()` | `PersonList`, `BrowserToolbar`, `AddPersonSheet` |
| `/sets` | `getSetsPaginated()`, `getCoverPhotosForSets()`, `getHeadshotsForPersons()`, `getSuggestedFoldersForSets()`, `getChannelsWithLabelMaps()` | `SetGrid`, `SetCard`, `BrowserToolbar`, `AddSetSheet` |
| `/sessions` | `getSessionsPaginated()`, `getCoverPhotosForSessions()` | `SessionList`, `SessionCard`, `AddSessionSheet` |
| `/projects` | `getProjectsPaginated()` | `ProjectList`, `ProjectCard`, `AddProjectSheet` |
| `/labels` | `getAllLabels()` | `LabelList`, `LabelCard`, `AddLabelSheet` |
| `/channels` | `getChannels()` | `ChannelList`, `ChannelCard`, `AddChannelSheet` |
| `/artists` | `getArtists()` | `ArtistCard`, `ArtistSearch`, `AddArtistButton` |
| `/networks` | `getNetworks()` | `NetworkList`, `NetworkCard`, `AddNetworkSheet` |
| `/collections` | `getAllCollections()` | `CollectionList`, `AddCollectionDialog` |
| `/settings` | `getAllSkillGroups()`, `getAllCategoryGroups()`, `getAllContributionRoleGroups()` | `SkillCatalogManager`, `MediaCategoryManager`, `ContributionRoleManager` |
| `/import` | `getAllBatches()` | `ImportUploadZone`, `ImportBatchList` |
| `/staging-sets` | (client-fetched via `/api/staging-sets` — augmented with `suggestedArchiveFolder` from `getSuggestedFoldersForStagingSets`) | `StagingSetsWorkspace` → `StagingSetFilterBar`, `StagingSetGrid` → `StagingSetRow` (with inline archive section + `ArchiveFolderPicker`), `StagingSetSlidePanel` |

### Detail Pages

| Route | Services Called | Key Components |
|-------|----------------|----------------|
| `/people/[id]` | `getPersonWithDetails()`, `getPersonWorkHistory()`, `getPersonConnections()`, `getPersonReferenceSession()`, `getPersonHeadshots()`, `getFilledHeadshotSlots()`, `getPersonMediaGallery()`, `getPopulatedCategoriesForPerson()`, `getAllSkillGroups()`, `getPersonAliases()`, `getPersonSessionWorkHistory()`, `getPersonProductionSessions()`, `getPersonEntityMedia()` | `PersonDetailTabs` → `OverviewTab`, `AppearanceTab`, `PersonDetailsTab`, `PersonSkillsTab`, `PersonAliasesTab`, `CareerTab`, `NetworkTab`, `PhotosTab` |
| `/sets/[id]` | `getSetById()`, `getSetMediaGallery()`, `getAllContributionRoleGroups()` | `SetDetailGallery`, `CreditResolutionPanel`, `EditSetSheet`, `SetSessionManager` |
| `/sessions/[id]` | `getSessionById()`, `getMediaItemsForSession()` or `getMediaItemsWithLinks()`, `getSessionContributions()` | `MediaManager` (reference) or `SessionProductionGallery` (production), `SessionContributionSkills`, `BatchUploadZone` |
| `/collections/[id]` | `getCollectionWithItems()`, `getCollectionGalleryItems()` | `CollectionDetailGallery` |
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

**`media-service.ts`** (~1,130 lines) — MediaItem CRUD, gallery item construction (`toGalleryItem`), person/session/set gallery queries, headshot management, usage/link management, batch operations, duplicate detection, similar image search

**`set-service.ts`** (~820 lines) — Set CRUD, credit resolution, participant rebuilding, session link management, media bridging (`addExistingMediaToSet`, `syncSetSessionLinks`). `getSuggestedResolutions(rawName, channelId)` uses a three-tier priority: (1) alias+channel exact match ("Known alias on this channel"), (2) previously-resolved same rawName, (3) frequent in channel. `resolveCreditRaw()` auto-matches `rawName` to `PersonAlias.nameNorm`, sets `resolvedAliasId`, populates `creditNameOverride` on `SessionContribution`, and returns `suggestNewAlias: true` when no alias exists.

**`session-service.ts`** (~450 lines) — Session CRUD, merging, reference session management (auto-created per-person, type=REFERENCE)

**`contribution-service.ts`** (~500 lines) — Session contributions (person+role), contribution skills with auto PersonSkill/DEMONSTRATED event creation, skill media mapping, SetParticipant rebuild. `addSessionContribution()` auto-matches `creditNameOverride` to `PersonAlias.nameNorm` and sets `resolvedAliasId`.

### Domain Services

**`alias-service.ts`** — Alias CRUD, channel linking, bulk import, merge. `getPersonAliases()` returns `creditCount` (combined `SetCreditRaw` + `SessionContribution` usages via `resolvedAliasId`). `createAlias()` also accepts `channelIds` to link at creation time and triggers participant-status refresh.
**`skill-service.ts`** — PersonSkill/SkillEvent CRUD, timeline, event media
**`skill-catalog-service.ts`** — SkillGroup/SkillDefinition catalog CRUD
**`physical-attribute-catalog-service.ts`** — PhysicalAttributeGroup/PhysicalAttributeDefinition catalog CRUD
**`era-service.ts`** — Era CRUD: `getBaselineEraId`, `findOrCreateEraForDate` (auto-creates year-bucket draft eras and marks `isDraft: true`), `getPersonEras` (picker list), `createEraBatch` (one-shot create with deltas + body mark/mod/procedure events), `updateEra` (clears `isDraft` on any edit), `deleteEra` (cascades + orphan cleanup), `getPersonEraContributions` (ADR-0004 reverse-nav — sessions filed into each era).
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

### Import Pipeline Services

All import services in `src/lib/services/import/`.

**`parser.ts`** — Pure function: raw file text → `ParsedImportData` (person profile, digital identities, channel appearances, sets with co-model references, co-model directory). Handles edge cases (PowerShell artifacts, em-dash nulls, duplicate detection).

**`matcher.ts`** — Tiered DB matching: exact ID → fuzzy name (pg_trgm). Functions: `matchPerson`, `matchChannel`, `matchLabel`, `matchSet`, `matchAllEntities`. Returns confidence scores (0.0–1.0).

**`staging-service.ts`** — Batch lifecycle: `createBatch` (parse + match + stage), `refreshBatchMatches` (re-run on every page load), `computeDependencies` (block/unblock items), `getAllBatches`, `updateItemStatus`, `markItemImported`. Creates StagingSet records during batch creation with re-import dedup (skips existing by externalId + subjectIcgId).

**`staging-set-service.ts`** — StagingSet CRUD + querying. `getStagingSetsFiltered` (paginated, filterable by status/person/channel/date/priority/search), `getStagingSetStats`, `getStagingSetComparison` (side-by-side diff vs production Set), `updateStagingSetFields`, `bulkUpdateStatus`, `markStagingSetPromoted` (copies `archiveKey` to promoted Set and linked ArchiveFolder). Lifecycle statuses: PENDING → REVIEWING → APPROVED → PROMOTED / INACTIVE / SKIPPED. `StagingSetWithRelations` includes optional `suggestedArchiveFolder?: SuggestedFolderInfo | null` (populated at API layer, not in Prisma include).

**`import-executor.ts`** — Per-entity import: `importItem` dispatches to type-specific functions (`importLabel`, `importChannel`, `importPerson`, `importAlias`, `importDigitalIdentity`, `importSet`, `importCoModel`). Set import routes through `enrichExistingSet` (matched) or `createNewSet` (unresolved), marks StagingSet as PROMOTED.

### Archive Services

**`archive-service.ts`** — Core archive filesystem ↔ DB sync layer.
- `parseRoots(value)` — parse settings value as `string[]` (supports JSON array and legacy single-string)
- `buildFolderName(dateStr, shortName, participant, title)` — pure function, builds folder segment `yyyy-mm-dd-{short} {person} - {title}`
- `buildExpectedPathForStagingSet/Set` — async, computes expected relative path for display
- `buildFullPaths(relativePath, isVideo)` — returns one absolute path per configured root (multi-root support)
- `runMatchingPass()` — two-tier matching: **HIGH** (exact date + exact shortName) → **MEDIUM** (same year + shortName + `pg_trgm similarity ≥ 0.4`). Writes `suggestedStagingId/SetId` + `suggestedConfidence` to ArchiveFolder
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
| `person-actions.ts` | `createPerson`, `updatePerson`, `deletePerson`, `updatePersonBio` |
| `set-actions.ts` | `createSet`, `updateSet`, `deleteSet`, `addExistingMediaToSetAction`, `reassignSetSessionAction` |
| `session-actions.ts` | `createSession`, `updateSession`, `deleteSession`, `mergeSessionsAction` |
| `media-actions.ts` | `assignHeadshotSlot`, `updatePersonMediaLinkAction`, `batchSetUsageAction`, `deleteMediaItemsAction`, `setFocalPointAction`, `resetFocalPointAction` |
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
| `/api/staging-sets` | GET | Filtered staging set list; augments each item with `suggestedArchiveFolder` via batch call to `getSuggestedFoldersForStagingSets` |
| `/api/staging-sets/stats` | GET | Staging set counts by status + match type |
| `/api/staging-sets/[id]` | GET, PATCH | Get/update staging set (fields, status, priority, notes) |
| `/api/staging-sets/[id]/comparison` | GET | Side-by-side diff vs production Set |
| `/api/staging-sets/[id]/promote` | POST | Promote staging set to production |
| `/api/staging-sets/bulk-update` | POST | Bulk status change |
| `/api/staging-sets/bulk-promote` | POST | Bulk promote to production |
| `/api/staging-sets/[id]/cover` | POST | Upload cover image (FormData → resize → MinIO) |
| `/api/archive/sidecar/[archiveKey]` | GET | Protected by `ARCHIVE_API_KEY` header. Looks up ArchiveFolder by archiveKey (always present), returns `{ archiveKey, folderName, setId, stagingSetId, title, releaseDate, channel }`. Works for unlinked folders (setId/stagingSetId null). 404 only if archiveKey unknown. |
| `/api/archive/folders/search` | GET | Search unlinked archive folders (`linkedSetId=null AND linkedStagingId=null`). Params: `q` (title search), `shortName` (chanFolderName filter), `year`, `limit` (max 50). Used by `ArchiveFolderPicker` |
| `/api/flags/[code]` | GET | Country flag image |

---

## 6. Component Architecture

### Directory Structure

```
components/
├── layout/           # AppShell, Sidebar, MobileDrawer, providers (theme, palette, density, hero, sidebar)
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

### Key Component Relationships

**Person Detail Page:**
```
page.tsx (Server Component — calls ~12 service functions)
  └── PersonDetailTabs (Client — receives all data as props, manages tab state)
        ├── OverviewTab — HeroCard (plausibility badge), BasicInfoPanel, PhysicalStatsPanel, HistoryPanel, KpiStatsPanel, DataQualityCard (plausibility warnings)
        ├── AppearanceTab (extracted file) — Physical stats, BodyMarkCard, BodyModificationCard + add/edit sheets (Cosmetic Procedures card removed in Phase G Slice 5; surgical changes now flow through ScalarDelta with cause=SURGICAL)
        ├── PersonDetailsTab — Category groups with expandable photo galleries via /api/categories/[id]/media
        ├── PersonSkillsTab — Category-grouped skills, event timeline, inline media
        ├── PersonAliasesTab — By-alias/by-channel views, multi-select, import/merge
        ├── CareerTab — CareerSessionList, ProductionPhotoList
        ├── NetworkTab — PersonConnection cards
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

8. **Entity media linking** — DETAIL usage on PersonMediaLink can be categorized (`categoryId`) and linked to specific entities (`bodyMarkId`, `bodyModificationId`). Categories driven by `entityModel` field on MediaCategory. (The `cosmeticProcedureId` column remains in the schema during the Slice 5 → Slice 17 soak but is no longer written by any code path.)

9. **SetParticipant is derived** — Rebuilt from SessionContribution via `rebuildSetParticipantsFromContributions()`. Never edited directly.

10. **Server action serialization** — Cannot pass arrow functions from Server → Client components. Use `.bind()` for callbacks (e.g., `onDelete={deleteAction.bind(null, id)}`).

11. **Era fold canon (ADR-0001)** — The mapping `(eras + scalar deltas + events) → current state` lives in two places: `foldScalarDeltas` (TS, `person-service.ts`) and `app_recompute_person_current_state` (SQL function). They must produce identical winners; opposite literal sort directions but same semantics. When changing one, audit the other.

12. **In-tx cache recompute (ADR-0003)** — Every mutation that writes a fold input (ScalarDelta, BodyMarkEvent, etc.) MUST end its `$transaction` with `recomputePersonCurrentState(tx, personId)`. The `PersonCurrentState` cache is the only thing the read path queries — it cannot drift because the mutation path can't commit without writing it.

13. **Event-derived status projections (ADR-0002)** — `BodyMark.status` and `BodyModification.status` are projections of their event logs. Every event mutation calls the matching `recompute*Status(tx, id)` helper from `cascade-helpers.ts` in the same transaction. (Legacy `CosmeticProcedure.status` followed the same pattern but is no longer surfaced — see invariant about the Slice 5 deprecation.)

14. **Era-linked participation lives on SessionContribution, not SetParticipant (ADR-0004)** — A Session is one shoot = one Era. A Set may be a compilation spanning multiple Eras for the same person. The `eraId` is therefore authored on `SessionContribution` (source of truth); `SetParticipant` is derived. `addSessionContribution` / `updateSessionContribution` propagate `eraId` across every contribution row for the same `(sessionId, personId)` in one tx.

15. **Baseline Era is dateless** — Every Person has exactly one baseline Era (`isBaseline: true`, `date: null`). It is folded first by virtue of its flag, not its date. The only hard temporal floor for sanity checks is the Person's birthdate.

16. **Draft Eras are nudges, not gates** — `findOrCreateEraForDate` sets `isDraft: true` when it spawns an Era to host a quick-edit. Drafts behave identically to curated Eras; the flag is cleared on any user edit (`updateEra`). The History panel surfaces drafts with an amber dashed dot + pill.

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
