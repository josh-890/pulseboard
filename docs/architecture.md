# Pulseboard — Architecture Reference

> **Last updated:** 2026-03-18
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
| `/sets` | `getSetsPaginated()`, `getCoverPhotosForSets()`, `getChannelsForSelect()` | `SetList`, `SetCard`, `BrowserToolbar`, `AddSetSheet` |
| `/sessions` | `getSessionsPaginated()`, `getCoverPhotosForSessions()` | `SessionList`, `SessionCard`, `AddSessionSheet` |
| `/projects` | `getProjectsPaginated()` | `ProjectList`, `ProjectCard`, `AddProjectSheet` |
| `/labels` | `getAllLabels()` | `LabelList`, `LabelCard`, `AddLabelSheet` |
| `/channels` | `getChannels()` | `ChannelList`, `ChannelCard`, `AddChannelSheet` |
| `/networks` | `getNetworks()` | `NetworkList`, `NetworkCard`, `AddNetworkSheet` |
| `/collections` | `getAllCollections()` | `CollectionList`, `AddCollectionDialog` |
| `/settings` | `getAllSkillGroups()`, `getAllCategoryGroups()`, `getAllContributionRoleGroups()` | `SkillCatalogManager`, `MediaCategoryManager`, `ContributionRoleManager` |

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
| `/networks/[id]` | `getNetworkById()` | `NetworkDetail`, `EditNetworkSheet` |

---

## 3. Service Layer

All services in `src/lib/services/`. All functions are async, return Promises. Services are the only layer that touches Prisma.

### Core Services

**`person-service.ts`** (~1,350 lines) — Person CRUD, paginated listing, work history, connections, affiliations, current state derivation, entity media queries, cover photos

**`media-service.ts`** (~1,130 lines) — MediaItem CRUD, gallery item construction (`toGalleryItem`), person/session/set gallery queries, headshot management, usage/link management, batch operations, duplicate detection, similar image search

**`set-service.ts`** (~820 lines) — Set CRUD, credit resolution, participant rebuilding, session link management, media bridging (`addExistingMediaToSet`, `syncSetSessionLinks`)

**`session-service.ts`** (~450 lines) — Session CRUD, merging, reference session management (auto-created per-person, type=REFERENCE)

**`contribution-service.ts`** (~500 lines) — Session contributions (person+role), contribution skills with auto PersonSkill/DEMONSTRATED event creation, skill media mapping, SetParticipant rebuild

### Domain Services

**`alias-service.ts`** — Alias CRUD, channel linking, bulk import, merge
**`skill-service.ts`** — PersonSkill/SkillEvent CRUD, timeline, event media
**`skill-catalog-service.ts`** — SkillGroup/SkillDefinition catalog CRUD
**`physical-attribute-catalog-service.ts`** — PhysicalAttributeGroup/PhysicalAttributeDefinition catalog CRUD
**`persona-service.ts`** — Persona CRUD, physical changes, body mark/modification/procedure events
**`category-service.ts`** — MediaCategoryGroup/MediaCategory CRUD, person category population counts
**`collection-service.ts`** — MediaCollection CRUD, item management

### Entity Services

**`label-service.ts`**, **`network-service.ts`**, **`channel-service.ts`**, **`project-service.ts`** — Standard CRUD for each entity

### Infrastructure Services

**`view-service.ts`** — Materialized view refresh (`mv_dashboard_stats`, `mv_person_current_state`, `mv_person_affiliations`)
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
| `contribution-actions.ts` | `addContribution`, `removeContribution`, `addContributionSkill`, `removeContributionSkill` |
| `skill-actions.ts` | PersonSkill/SkillEvent CRUD, skill event media management |
| `alias-actions.ts` | Alias CRUD, channel linking, bulk import, merge |
| `collection-actions.ts` | Collection CRUD, add/remove items |
| `category-actions.ts` | Category group/category CRUD |
| `skill-catalog-actions.ts` | Skill group/definition CRUD |
| `physical-attribute-catalog-actions.ts` | Physical attribute group/definition CRUD |
| `contribution-role-actions.ts` | Role group/definition CRUD |
| `setting-actions.ts` | App setting updates |
| `label-actions.ts`, `network-actions.ts`, `channel-actions.ts`, `project-actions.ts` | Entity CRUD |
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
| `/api/channels/search` | GET | All channels for client-side search |
| `/api/collections/list` | GET | Collections filtered by personId |
| `/api/skill-events/[id]/media` | GET/POST | Skill event media management |
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
├── people/           # 35+ files: list/detail/add/edit, body features, aliases, personas, skills, career
├── sets/             # 15+ files: list/detail, credits, sessions, evidence, media picker
├── sessions/         # 15+ files: list/detail, contributions, merge, status
├── projects/         # ProjectList, ProjectCard, add/edit sheets
├── labels/           # LabelList, LabelCard, add/edit sheets
├── channels/         # ChannelList, ChannelCard, add/edit sheets
├── networks/         # NetworkList, NetworkCard, add/edit sheets
├── collections/      # CollectionList, CollectionDetailGallery, media picker
├── settings/         # SkillCatalogManager, MediaCategoryManager, ContributionRoleManager
├── shared/           # TagInput, PartialDateInput, CountryPicker, EntityCombobox, DeleteButton, BrowserToolbar, BodyRegionPicker, FlagImage
└── ui/               # shadcn/ui primitives (auto-generated, do not edit)
```

### Key Component Relationships

**Person Detail Page:**
```
page.tsx (Server Component — calls ~12 service functions)
  └── PersonDetailTabs (Client — receives all data as props, manages tab state)
        ├── OverviewTab — HeroCard, BasicInfoPanel, PhysicalStatsPanel, HistoryPanel, KpiStatsPanel
        ├── AppearanceTab (extracted file) — Physical stats, BodyMarkCard, BodyModificationCard, CosmeticProcedureCard + add/edit sheets
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

**Shared Helpers** (`person-detail-helpers.tsx`):
- `SectionCard` — glassmorphism card with icon, title, badge
- `EmptyState` — italic placeholder text
- `InfoRow` — label + value row for detail displays

---

## 7. State Management

| Pattern | Where Used | Mechanism |
|---------|-----------|-----------|
| URL searchParams | `/people`, `/sets`, `/sessions`, `/projects` filters | `useSearchParams()` + `router.push()` |
| React `useState` | Modals, selections, form inputs, lightbox index | Local component state |
| React Context | Theme, palette, density, hero layout, sidebar | Provider components in `layout/` |
| Server revalidation | After all mutations | `revalidatePath()` in server actions |
| Optimistic UI | Focal point setting, tag edits | Local state updated before server confirms |

No external state library (Redux, Zustand, etc.).

---

## 8. Database Schema & Relationships

### Entity Relationship Overview

```
Person ──┬── PersonAlias[] ──── PersonAliasChannel[] ──── Channel
         ├── Persona[] ──┬── PersonaPhysical?
         │               ├── BodyMarkEvent[] ──── BodyMark
         │               ├── BodyModificationEvent[] ──── BodyModification
         │               ├── CosmeticProcedureEvent[] ──── CosmeticProcedure ──?── PhysicalAttributeDefinition
         │               ├── PersonDigitalIdentity[]
         │               └── PersonSkillEvent[] ──── PersonSkill ──── SkillDefinition ──── SkillGroup
         ├── PersonMediaLink[] ──── MediaItem ──── Session
         ├── PersonRelationship[] ──── RelationshipEvent[]
         ├── PersonEducation[], PersonAward[], PersonInterest[]
         ├── SessionContribution[] ──┬── ContributionSkill[] ──── SkillDefinition
         │                           └── ContributionRoleDefinition ──── ContributionRoleGroup
         └── referenceSession (Session, 1:1 unique)

Session ──┬── MediaItem[]
          ├── SessionContribution[]
          └── SetSession[] ──── Set

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

- **Person**: `icgId` (unique, mandatory), `status` (active/inactive/wishlist/archived), `rating`, `pgrade`
- **PersonAlias**: `type` (common/birth/alias), `nameNorm` for search. One `common` alias = display name
- **Persona**: `isBaseline` (one per person, auto-created), `date` + `datePrecision`
- **Session**: `type` (REFERENCE/PRODUCTION), `status` (DRAFT/CONFIRMED), `personId` (unique FK for REFERENCE type)
- **MediaItem**: `variants` (JSON — profile/gallery sizes), `focalX`/`focalY` (0-1 normalized), `hash` (SHA256), `phash` (dHash)
- **PersonMediaLink**: `usage` enum, `slot` (for HEADSHOT), `categoryId` (for DETAIL), entity FKs (`bodyMarkId`, etc.)
- **PhysicalAttributeGroup/Definition**: Admin catalog for extensible physical measurements (mirrors SkillGroup/SkillDefinition pattern)
- **PersonaPhysicalAttribute**: Key-value measurements per PersonaPhysical (unique on physicalId + definitionId)
- **CosmeticProcedure**: Optional `attributeDefinitionId` FK to PhysicalAttributeDefinition — links procedure to the physical attribute it affects. Enables derived `AttributeStatus` (NATURAL/ENHANCED/RESTORED) on extensible attributes
- **CosmeticProcedureEvent**: `valueBefore`/`valueAfter`/`unit` — observation fields for before/after values of a procedure

### Materialized Views

| View | Purpose | Refresh |
|------|---------|---------|
| `mv_dashboard_stats` | KPI counts | After bulk ops, startup |
| `mv_person_current_state` | Folded physical state per person | After persona mutations |
| `mv_person_affiliations` | Person→label set counts | After set/contribution changes |

### Normalized Search

All searchable entities have `nameNorm`/`titleNorm` fields with `pg_trgm` trigram GIN indexes + `unaccent` extension for accent-insensitive fuzzy matching.

---

## 9. Key Architectural Invariants

1. **Hard deletes only** — No soft-delete, no `deletedAt`. All deletes cascade via `cascade-helpers.ts` inside `$transaction` blocks.

2. **Reference sessions** — Auto-created one-per-person (type=REFERENCE, `personId` unique FK). Cannot be manually created/edited/deleted/merged. The authoritative source for a person's photos.

3. **Guard clauses inside transactions** — All check-then-act patterns (e.g., "is this a reference session?") run inside `$transaction` to avoid TOCTOU races.

4. **Server actions are the write boundary** — Components never call services directly for mutations. Actions validate with Zod, call services, revalidate paths.

5. **Photo variants** — Every uploaded image generates responsive variants (profile_128/256/512/768, gallery_512/1024/1600) via Sharp. Stored as JSON in `MediaItem.variants`. URLs built with `buildUrl(key)` from `src/lib/media-url.ts`.

6. **Focal points** — `focalX`/`focalY` (0-1 normalized) on MediaItem. `focalStyle()` utility returns `{ objectPosition }` CSS. Variant regeneration is fire-and-forget via `/api/media/[id]/regenerate-variants`.

7. **Contribution → skill progression** — `addContributionSkill()` auto-creates/upgrades PersonSkill and creates DEMONSTRATED event tagged with `[session:ID]`.

8. **Entity media linking** — DETAIL usage on PersonMediaLink can be categorized (`categoryId`) and linked to specific entities (bodyMarkId, bodyModificationId, cosmeticProcedureId). Categories driven by `entityModel` field on MediaCategory.

9. **SetParticipant is derived** — Rebuilt from SessionContribution via `rebuildSetParticipantsFromContributions()`. Never edited directly.

10. **Server action serialization** — Cannot pass arrow functions from Server → Client components. Use `.bind()` for callbacks (e.g., `onDelete={deleteAction.bind(null, id)}`).

---

## 10. Data Flow Examples

### Creating a Person
```
AddPersonSheet (form submit)
  → createPerson(raw) server action
  → createPersonSchema.safeParse(raw)
  → createPersonRecord(data) service
  → Creates Person + common alias + baseline Persona + Reference Session
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

---

## 11. Utilities & Constants

### `lib/utils.ts`
- `cn()` — Tailwind class merge
- `formatRelativeTime(date)` → "2 days ago"
- `getDisplayName(alias, icgId)` → "John (JD-96ABF)"
- `formatPartialDate(date, precision)` → "March 1995" / "Unknown"
- `computeAge()`, `computeAgeFromPartialDate()`, `computeAgeAtEvent()`
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

### `lib/validations/`
- Zod schemas for all CRUD inputs: person, set, session, project, label, network, channel, media, persona, body-mark, body-modification, cosmetic-procedure, education, interest
