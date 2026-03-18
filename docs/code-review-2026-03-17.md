# Pulseboard Code Review — 2026-03-17

Comprehensive architecture review covering services, actions, components, API routes, types, and schema.

---

## Table of Contents

1. [Service Layer](#1-service-layer)
2. [Server Actions](#2-server-actions)
3. [Component Architecture](#3-component-architecture)
4. [API Routes & Security](#4-api-routes--security)
5. [Schema & Type System](#5-schema--type-system)
6. [Priority Items](#6-priority-items)

---

## 1. Service Layer

### Error Handling
- No Result types or structured error classes — services throw plain `Error` with string messages
- No error codes for front-end differentiation or localized messages
- Guard clauses throw (e.g., "Cannot edit reference session", "Cannot delete only common alias")

### Transaction Usage
- All multi-step mutations correctly use `prisma.$transaction(async (tx) => {...})`
- Cascade helpers in `cascade-helpers.ts` accept `TxClient` (transaction-scoped client)
- ~~**Issue — guard clauses outside transactions**~~ ✅ Fixed — guard checks moved inside `$transaction` callbacks in session-service, alias-service, and persona-service

### N+1 Query Patterns

| Location | Issue | Impact |
|----------|-------|--------|
| `set-service.ts:376-413` | Credit creation loop queries `setSession.findMany()` per credit | High at scale (100 credits = 100 queries) |
| `media-service.ts:838-852` | `batchSetUsage()` queries DB per mediaItemId in loop | Medium (defeats purpose of "batch") |
| `alias-service.ts:257-285` | Bulk import creates aliases one-by-one | Low (could use `createMany()`) |
| `session-service.ts:322-378` | Merge contributions queries `findUnique()` per contribution | Medium |

### Consistency
- Naming: consistent `getX()`, `createXRecord()`, `updateXRecord()`, `deleteXRecord()`
- Include patterns: heavy nested includes (sometimes 4+ levels)
- ~~**Duplicate utility**: `buildUrl()` and `buildPhotoUrls()` defined independently in 3+ services~~ ✅ Extracted to `src/lib/media-url.ts`

### Raw SQL
- All parameterized correctly via Prisma template literals or `$queryRawUnsafe()` with static SQL
- **No SQL injection risk detected**

### Code Size Concerns

| File | Lines | Suggestion |
|------|-------|------------|
| `person-service.ts` | 1,347 | Extract skill queries, body-related functions |
| `media-service.ts` | 1,132 | Extract URL building, collection logic, similarity logic |
| `set-service.ts` | 819 | Extract credit resolution, suggestion logic |

### Connection Management
- Singleton pattern with `globalThis` cache — correct for Prisma v7
- PrismaPg adapter correctly configured
- No connection leaks detected

---

## 2. Server Actions

### Input Validation
- **Strong**: All major CRUD actions use Zod schemas via `safeParse()`
- **Gaps**: Actions accepting individual parameters (IDs, enum strings) often skip validation:
  - `category-actions.ts`: `createCategoryGroupAction(name: string)` — no validation
  - `media-actions.ts`: `batchSetBodyRegionsAction(bodyRegions: string[])` — no max length
  - `appearance-actions.ts`: `data.type as BodyMarkType` — enum cast without validation
  - `skill-actions.ts`: `skillDefinitionId` accepted without UUID/existence check

### Authorization
- **ZERO authorization checks** across all 18 action files
- No `getSession()`, no ownership checks, no role-based access
- Database maintenance actions (orphan cleanup, view refresh) are unrestricted
- **Acceptable for single-user app on local network; critical if ever exposed**

### Error Handling
- Consistent `try-catch` wrapping; generic messages to clients
- Only `P2002` (unique constraint) handled specially in `person-actions.ts`
- Missing: `P2003` (FK violation), `P2025` (not found), timeouts
- No error logging beyond `console.error`

### revalidatePath
- Comprehensive coverage — mutations followed by path revalidation
- Some over-invalidation (e.g., every category action revalidates `/settings`)
- Missing dashboard revalidation in some person/set creation actions

### ~~Return Types — Three Inconsistent Patterns~~ ✅ Fixed
~~1. `{ success: true; id: string } | { success: false; error: { fieldErrors? } | string }` — CRUD~~
~~2. `{ success: boolean; error?: string }` — simple operations~~
~~3. `MaintenanceActionResult` with `found/fixed/details` — maintenance~~

Standardized to shared `CrudActionResult` and `SimpleActionResult` types in `src/lib/types/action-result.ts`. `MaintenanceActionResult` remains domain-specific (appropriate).

### Large Action Files

| File | Lines | Content |
|------|-------|---------|
| `appearance-actions.ts` | 561 | 15+ actions across body marks, modifications, procedures, personas |
| `media-actions.ts` | 433 | Headshots, links, focal points, deletion, categories, body regions |
| `set-actions.ts` | 331 | Set CRUD, credits, evidence, media, covers, sessions |

---

## 3. Component Architecture

### Prop Drilling (HIGH severity)
`person-detail-tabs.tsx` accepts 20+ props and distributes to sub-tabs. Any child data change requires modifying 3 files (page query → props type → child component).

### Component Size

| File | Lines | Issue |
|------|-------|-------|
| `person-detail-tabs.tsx` | 1,808 | Monolithic tab orchestrator; AppearanceTab inline (~300 lines) |
| `media-metadata-panel.tsx` | 1,545 | ~50% duplicate of gallery-info-panel |
| `gallery-info-panel.tsx` | 1,391 | Shared logic not extracted |
| `person-aliases-tab.tsx` | 700 | Complex dual-view with multi-select |
| `batch-upload-zone.tsx` | 668 | Upload queue, duplicate detection, progress |
| `edit-person-sheet.tsx` | 576 | 30+ field form |
| `person-skills-tab.tsx` | 576 | Timeline + events + media picker |
| `browser-toolbar.tsx` | 529 | Search, filters, sorting state |
| `add-person-sheet.tsx` | 519 | Similar form with validation |

### Code Duplication
- `gallery-info-panel.tsx` and `media-metadata-panel.tsx` share ~50% logic (usage toggles, entity selection, collection assignment, focal points)
- `credit-entry-step.tsx` and `credit-resolution-panel.tsx` have identical search-with-dropdown patterns
- `add-person-sheet.tsx` and `edit-person-sheet.tsx` define identical `SectionHeader` components locally

### Memoization
- Consistent `useCallback` and `useMemo` usage throughout
- Dependency arrays appear correct
- No major missing memoization found

### State Management
- Tab content unmounts when inactive (prevents internal state benefits, but resets correctly)
- Search debounce pattern repeated in 3+ places without shared hook
- Local state vs URL state split is intentional and correct

---

## 4. API Routes & Security

### Input Validation

| Route | Validation |
|-------|-----------|
| `/api/media/upload` | Excellent — file size, MIME, magic bytes, dimensions, Zod schema |
| `/api/flags/[code]` | Good — sanitized, length-checked |
| `/api/media/search` | Partial — limit bounded but `parseInt("abc")` returns NaN silently |
| `/api/media/similar` | Partial — threshold not bounds-checked |
| `/api/channels/search` | None — returns all channels unfiltered |
| `/api/sessions/[id]/media` | None |
| `/api/sessions/[id]/gallery` | None |
| `/api/categories/[id]/media` | Partial — checks personId exists but no UUID validation |

### Missing Error Handling
- `/api/sessions/[id]/media` and `/api/sessions/[id]/gallery` have **no try-catch** — Prisma errors return unstructured 500

### Response Consistency
- No standard envelope — some routes return arrays, some return `{ items }`, some return `{ error }`
- Status codes inconsistent (some use 201, some always 200)

### Authentication
- **No auth checks anywhere** — no middleware, no session verification
- All routes publicly callable

### File Upload Security — Excellent
- Multi-layer: MIME whitelist → magic byte validation (sharp) → dimension check → SHA-256 dedup → MinIO storage
- Auto-rotates EXIF, strips metadata, normalizes colorspace

---

## 5. Schema & Type System

### Missing Indexes on Foreign Keys

| Table | Column | Impact |
|-------|--------|--------|
| `PersonAliasChannel` | `aliasId` | Full scan on alias-to-channel lookups |
| `MediaCollectionItem` | `collectionId` | Full scan on collection item queries |
| `LabelNetworkLink` | `networkId` | Full scan on network membership queries |
| `SkillEventMedia` | `skillEventId` | Full scan on skill event media queries |

### Untyped String Fields (should be enums)

| Model | Field | Current | Should Be |
|-------|-------|---------|-----------|
| `CosmeticProcedure` | `type` | `String` | Enum (like `BodyMarkType`) |
| `CosmeticProcedure` | `status` | `String @default("completed")` | Enum (like `BodyModificationStatus`) |
| `PersonDigitalIdentity` | `status` | `String @default("active")` | Enum |

### Cascade Gaps
- Schema uses Prisma default `onDelete` everywhere except one relation (`PersonMediaLink.persona → SetNull`)
- `cascade-helpers.ts` covers: Set, BodyModification, CosmeticProcedure, PersonExtras, RelationshipEvents, MediaItems, PersonSkills, Session
- **Missing cascade helpers for**: PersonAlias (→ PersonAliasChannel orphans), Persona (→ PersonaPhysical, BodyMarkEvent orphans), SkillDefinition (→ PersonSkill orphans), ContributionRoleDefinition (→ SessionContribution orphans)

### JSON Type Safety
- `MediaItem.variants` stored as `Json?`, cast to `PhotoVariants` via `as` in ~10+ locations
- No runtime validation — shape changes won't be caught by compiler

### Denormalization
- `PersonRelationship.sharedSetCount` — manual counter with no visible sync logic when sets change

### Positive Findings
- 27 well-organized enums
- 17 unique/composite key constraints properly defined
- GIN indexes on array columns (bodyRegions, tags)
- No `any` types in custom TypeScript code
- Clean type re-exports from Prisma in `lib/types/`
- 34 incremental migrations with clear naming

---

## 6. Priority Items

### Tier 1 — Hardening for Scale (Items 5-10)
1. ~~**Add missing FK indexes**~~ ✅ Already covered — composite PKs on join tables provide B-tree index on first column
2. ~~**Add enums for untyped string fields**~~ ✅ No change needed — CosmeticProcedure type/status intentionally free-text (medical procedure names); DigitalIdentity already has enum
3. ~~**Add try-catch to unprotected API routes**~~ ✅ Already fixed in prior commit (sessions media/gallery routes have try-catch)
4. ~~**Fix N+1 patterns**~~ ✅ Credit creation loop and batchSetUsage already fixed in `8ba2e06`; session merge N+1 acceptable (rare operation, small data)
5. ~~**Add missing cascade helpers**~~ ✅ Already implemented — `cascadeDeletePersonAliases`, `cascadeDeletePersona`, `cascadeDeletePersonPersonas` exist; SkillDefinition/ContributionRole use refuse-to-delete-if-in-use pattern (correct for catalog items)
6. ~~**Add runtime validation for `Json` fields**~~ ✅ `parsePhotoVariants()` guard function exists in `lib/types/photo.ts`; used in cascade-helpers; remaining `as PhotoVariants` casts are safe (data written by upload pipeline)

### Tier 2 — Architecture Improvements
7. **Extract `AppearanceTab`** from `person-detail-tabs.tsx` into own file
8. **Deduplicate gallery-info-panel / media-metadata-panel** — shared hooks or sub-components
9. **Extract shared patterns** — `useSearchWithDebounce` hook, `SectionHeader` ~~, `buildUrl` utility~~ (✅ buildUrl extracted to `src/lib/media-url.ts`)
10. ~~**Standardize action return types**~~ ✅ Shared `CrudActionResult` and `SimpleActionResult` in `src/lib/types/action-result.ts`, adopted across all 17 action files
11. ~~**Move guard clauses inside transactions**~~ ✅ Fixed in session-service (editSessionRecord, deleteSessionRecord), alias-service (deleteAlias), persona-service (deletePersona)

### Tier 3 — Future Considerations
12. **Auth middleware** if app leaves local network
13. **Standardize API response envelope**
14. **Refactor large service files** (person-service 1,347 lines, media-service 1,132 lines)
15. **Error logging** — structured logging beyond console.error
16. **Rate limiting** on bulk operations
