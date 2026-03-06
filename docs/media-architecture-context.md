# Media Architecture Redesign — Full Context

> **Purpose:** This document captures all background research, schema analysis, industry findings, and architectural reasoning for the media architecture redesign. It enables any session to resume work from where the previous session left off.
>
> **Last updated:** 2026-03-04
> **Status:** Decision phase — working through decisions sequentially with user
> **Companion doc:** `docs/media-architecture-review.md` (decision tracker)

---

## 1. The Task

The user wrote `docs/image_media_usacases.md` describing 7 use cases for images within Pulseboard. The goal is to review the current data architecture against these use cases, identify gaps, research industry best practices, and write a detailed coding spec for any structural changes needed.

---

## 2. User's Use Cases (from `docs/image_media_usacases.md`)

### 2.1 Media Anchoring
All images are anchored with **sessions**. Two groups:
- **Production sessions**: Record of collaboration/capture during real-world content creation
- **Reference sessions**: Record of all media referring to a specific person, with possibly unknown creation info

Sessions are **sources** for media-items. Media-items are then **used** in various downstream contexts.

### 2.2 The Seven Use Cases

**UC1 — Production Sets**
Publication artifacts referencing media from usually one production session. Can be curated, re-released, re-labeled.

**UC2 — Production Compilation Sets**
Special form of production sets compiled from multiple production sessions. Connected to a "collaboration session" that hosts its own media-items and may reference source production sessions.

**UC3 — Profile Sets**
Selection of media-items shown in a person's profile gallery. Selected from:
- The person's reference session
- Multiple production sessions the person contributed to

**UC4 — Headshots**
Media-items from the reference session assigned to 1-of-N slots. Used as profile picture on person card (people browser) and hero section (person detail page).

**UC5 — Personal Detail Sets (CRITICAL)**
Selection of media connected to a person's detail categories. Categories are:
- **Open and changeable** — can be added, removed, labels changed
- **Generic tagging** — not hardcoded per entity type
- Examples: Physical characteristics (eyes, nose, belly button), Body characteristics (scars, marks, tattoos), Body modifications (piercings, implants, brandings), Body procedures (breast enlargement, botox)
- Shown on person detail page in a suitable way

**UC6 — User Sets**
User-defined selections shown in themed galleries (Favorites, Best of, special skills, special themes). Can pull from **any** media-item (reference or production), potentially cross-person.

**UC7 — User Article Sets**
User-defined selections to be used as images within articles (wiki-like system).

---

## 3. Current Schema Analysis

### 3.1 Core Media Models (from `prisma/schema.prisma`)

**MediaItem** — The master asset record
- Anchored to a `Session` via `sessionId` FK
- Stores: filename, fileRef, mimeType, size, hash, phash, dimensions, variants (JSON), focal point fields, caption, tags, notes
- Relations: `setMediaItems`, `personMediaLinks`, `coverForSets`, `collectionItems`

**Session** — The ingest container
- Types: `PRODUCTION` | `REFERENCE` (enum `SessionType`)
- Status: `DRAFT` | `CONFIRMED` (enum `SessionStatus`)
- Reference sessions: one-to-one with Person via `personId @unique`
- Relations: `mediaItems`, `participants`, `setSessionLinks`
- Links to: `Project` (optional), `Label` (optional)

**Set** — The publication artifact
- Has: `channelId`, `type` (photo/video), `title`, `isCompilation`, `coverMediaItemId`
- Relations: `setMediaItems` (join), `sessionLinks` (SetSession join), `creditsRaw`, `participants`, `labelEvidence`

**SetMediaItem** — Join: Set ↔ MediaItem
- Composite PK: `[setId, mediaItemId]`
- Fields: `sortOrder`, `isCover`, `caption`, `notes`

**SetSession** — Join: Set ↔ Session
- Composite PK: `[setId, sessionId]`
- Fields: `isPrimary`, `createdAt`

**PersonMediaLink** — Join: Person ↔ MediaItem with usage semantics
- Fields: `usage` (enum), `isFavorite`, `sortOrder`, `notes`, `slot`, `bodyRegion`
- Entity FKs: `bodyMarkId`, `bodyModificationId`, `cosmeticProcedureId`
- Unique constraint: `[personId, mediaItemId, usage]`

**PersonMediaUsage enum** (CURRENT — hardcoded):
```
PROFILE | HEADSHOT | BODY_MARK | BODY_MODIFICATION | COSMETIC_PROCEDURE | PORTFOLIO
```

**MediaCollection** — User-defined album
- Fields: `name`, `description`, `personId` (FK, nullable)
- Join: `MediaCollectionItem` with `sortOrder`

### 3.2 Related Entity Models

**BodyMark** — Tattoos, scars, marks on a person
- Has `PersonMediaLink[]` relation (media linked to specific body marks)
- Fields: type, bodyRegion, side, position, description, motif, colors, size, status

**BodyModification** — Piercings, implants, brandings
- Has `PersonMediaLink[]` relation
- Fields: type, bodyRegion, side, position, description, material, gauge, status

**CosmeticProcedure** — Surgical/cosmetic procedures
- Has `PersonMediaLink[]` relation
- Fields: type, bodyRegion, description, provider, status

### 3.3 Supporting Models

**SessionParticipant** — Who participated in a session (person + role MODEL/PHOTOGRAPHER)
**SetParticipant** — Who participated in a set
**SetCreditRaw** — Raw credit names with resolution status
**ProfileImageLabel** — Headshot slot labels stored in `Setting` table (key-value), configured in Settings page. Currently 5 slots (p-img01 through p-img05).

---

## 4. Industry Research Findings

### 4.1 DAM Architecture Patterns

**Master-Derivative Architecture** (Cloudinary, Adobe AEM, ResourceSpace)
- Master asset is immutable after ingest
- Derivatives/renditions generated from master, tracked separately
- Pulseboard's `MediaItem` with `variants` JSON is a pragmatic simplification — sufficient unless variant-level querying is needed

**Ingest-Manage-Publish Lifecycle** (industry standard)
- Ingest: raw capture → master assets
- Manage: tagging, categorization, enrichment, quality review
- Publish: curated subsets with custom ordering for specific channels
- Pulseboard already implements this: Session → PersonMediaLink/tags → Set/Collection

**Content Lifecycle Management (CLM)** — The formal name for the end-to-end process (Aprimo, Hyland, OrangeLogic)

### 4.2 Multi-Context Membership Patterns

Three patterns exist for "an image appears in multiple contexts":

**Pattern A: Join table per context** (ResourceSpace, AEM, Pulseboard current)
- Separate join tables: `SetMediaItem`, `PersonMediaLink`, `MediaCollectionItem`
- Each carries context-specific metadata
- Strong referential integrity via FKs
- **Industry recommendation: This is the correct pattern** when relationships carry metadata

**Pattern B: Single polymorphic membership table**
- One table with `contextType` + `contextId` (polymorphic FK)
- **Explicitly recommended against** by GitLab engineering, Hashrocket, DoltHub
- Loses FK constraints, degrades query performance

**Pattern C: Tag/label system**
- Flat tags on assets
- Loses structural relationships (no sort order, no featured flag, no role)
- Only suitable for lightweight folksonomy

### 4.3 Talent Management Media Patterns

Research from Casting Networks, Actors Access, Central Casting, Skybolt, AgencyPro, Staragent:

**Slot-based systems** are universal for headshots:
- Central Casting: specific slots to fill (headshot, artist choice)
- Actors Access: typed photo slots (Theatrical, Commercial, Other)
- One primary per category is enforced

**Media categorized by usage/purpose**, not content type:
- Headshot (Primary), Commercial, Theatrical, Body Shot, Composite/Comp Card, Portfolio, Demo Reel
- Maps directly to Pulseboard's `PersonMediaUsage` concept

**Additional patterns not yet in Pulseboard:**
- Submission packages (curated photo subset per casting submission)
- Comp card generation (template + slot → image layout)
- Freshness tracking (flag photos older than N months)

### 4.4 Content Categorization Patterns

For user-defined categories like "eyes", "tattoos", "scars":

| Approach | Best For | Tradeoffs |
|---|---|---|
| **Enum** | Fixed small sets (<20) that rarely change | Requires migration. Fast, type-safe. |
| **Category table** | Controlled vocabulary managed by admins | Flexible without migrations. Needs admin UI. |
| **Flat tags** | Uncontrolled folksonomy | Maximum flexibility, inconsistency risk. |
| **Hierarchical taxonomy** | Deep multi-level classification | Most powerful, most complex. |

**Hierarchy storage strategies for PostgreSQL:**
- **Adjacency list** (`parentId` FK): simple, good for shallow trees, uses recursive CTEs
- **Materialized path** (`path` column like `/body/arm/upper-arm/tattoo`): excellent read performance with `LIKE 'path%'` + GIN indexes
- **Closure table** (separate ancestor table): best for deep hierarchies with complex ancestor/descendant queries

**Recommended hybrid for Pulseboard:** Keep enums for structural usages (HEADSHOT, PROFILE) + Category table with `parentId` + materialized `path` for user-defined detail categories.

### 4.5 Research Sources

- [GeeksforGeeks: DAM Database Design](https://www.geeksforgeeks.org/sql/how-to-design-a-relational-database-for-digital-asset-management-and-media-libraries/)
- [ResourceSpace Database Schema](https://www.resourcespace.com/knowledge-base/developers/database_schema)
- [Cloudinary Derivative Files](https://cloudinary.com/glossary/derivative-files)
- [Cloudinary Eager/Incoming Transformations](https://cloudinary.com/documentation/eager_and_incoming_transformations)
- [AEM Content Fragment Models](https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/content-fragments/content-fragments-models)
- [GitLab: Polymorphic Associations Guidance](https://docs.gitlab.com/ee/development/database/polymorphic_associations.html)
- [Hashrocket: Modeling Polymorphic Associations](https://hashrocket.com/blog/posts/modeling-polymorphic-associations-in-a-relational-database)
- [DoltHub: Polymorphic Schema Choices](https://www.dolthub.com/blog/2024-06-25-polymorphic-associations/)
- [Hyland: DAM Process Flow](https://www.hyland.com/en/resources/articles/dam-process-flow)
- [OrangeLogic: DAM Content Lifecycle](https://www.orangelogic.com/blog/from-planning-to-archiving-how-dam-powers-content-lifecycle-management)
- [Aprimo: Content Lifecycle Management](https://www.aprimo.com/blog/content-lifecycle-management)
- [Ackee: Hierarchical Models in PostgreSQL](https://www.ackee.agency/blog/hierarchical-models-in-postgresql)
- [VibePanda: Closure Tables in SQL 2025](https://www.vibepanda.io/resources/guide/handling-hierarchical-data-closure-tables-sql)
- [Casting Networks: Managing Media](https://support.castingnetworks.com/hc/en-us/articles/29328844163725)
- [Actors Access: Managing Photos](https://actorsaccess.freshdesk.com/support/solutions/articles/17000056253)
- [Central Casting: Profile Photos](https://www.centralcasting.com/support/profile-photos/)
- [Skybolt Talent Agency Software](https://www.skybolt.net/)
- [Staragent Agency Software](https://staragent.co/features/)
- [AgencyPro Software](https://agencyprosoftware.com/)

---

## 5. Architectural Analysis & Recommendations

### 5.1 What's Already Right

| Aspect | Assessment |
|---|---|
| Master-Derivative model | `MediaItem` with `variants` JSON is sufficient |
| Ingest-Manage-Publish lifecycle | Session → PersonMediaLink → Set/Collection is correct |
| Join-table-per-context pattern | `SetMediaItem`, `PersonMediaLink`, `MediaCollectionItem` — matches industry best practice |
| Headshot slot system | Working well, slot labels configurable via Settings |
| Session as media anchor | Correct — all media flows from sessions |

### 5.2 What Needs to Change

| Gap | Impact | Use Cases Affected |
|---|---|---|
| `PersonMediaUsage` is a hardcoded enum | **Critical** — blocks user-defined categories | UC5 (Personal Detail Sets) |
| No session-to-session linking | **Medium** — blocks compilation session references | UC2 (Compilation Sets) |
| `MediaCollection` is person-scoped | **Medium** — blocks cross-person user sets | UC6 (User Sets) |
| No explicit profile set concept | **Low** — works implicitly but not formalized | UC3 (Profile Sets) |
| No article system | **Low** — future feature | UC7 (Article Sets) |

### 5.3 Recommended Decisions (pre-user-discussion)

| # | Decision | Recommended Option | Reasoning |
|---|---|---|---|
| 1 | Session-to-session linking | **Join table (SessionLink)** | Referential integrity, allows metadata on the relationship |
| 2 | Profile set sourcing enforcement | **Application-level** | Eligibility is a UX concern, not data integrity |
| 3 | Dynamic detail categories | **Hybrid: enum (structural) + MediaCategory table (user-defined)** | Preserves special HEADSHOT/PROFILE behavior while enabling dynamic categories |
| 4 | Category hierarchy depth | **TBD — awaiting user input** | Flat vs. two-tier vs. hierarchical |
| 5 | Entity linking approach | **Category-aware FKs** — keep specific FKs, add `entityModel` to MediaCategory | Referential integrity AND category flexibility |
| 6 | Collection scope/typing | **Unified MediaCollection with type** (PROFILE/USER/ARTICLE) | Single model, nullable personId for global sets |
| 7 | Article system | **TBD — awaiting user input** | Include now or defer |

---

## 6. Proposed Schema Changes (Draft — Subject to Decisions)

### 6.1 New: MediaCategory Table

```prisma
model MediaCategory {
  id          String  @id @default(cuid())
  name        String                        // "Tattoos", "Eyes", "Piercings"
  slug        String  @unique               // "tattoos", "eyes", "piercings"
  parentId    String?
  parent      MediaCategory?  @relation("CategoryTree", fields: [parentId], references: [id])
  children    MediaCategory[] @relation("CategoryTree")
  path        String?                       // Materialized: "/body-marks/arm/upper-arm"
  depth       Int     @default(0)
  icon        String?                       // Lucide icon name or emoji
  color       String?                       // Hex color for UI pill
  sortOrder   Int     @default(0)
  entityModel String?                       // "BodyMark", "BodyModification", etc. — which entity picker to show
  deletedAt   DateTime?

  personMediaLinks PersonMediaLink[]

  @@index([parentId])
  @@index([slug])
  @@index([path])
  @@index([deletedAt])
}
```

### 6.2 Modified: PersonMediaUsage Enum

```prisma
enum PersonMediaUsage {
  HEADSHOT    // Slot-based, reference session only
  PROFILE     // Profile gallery selection
  PORTFOLIO   // Extended portfolio
  DETAIL      // Dynamic category — categoryId required
}
```

Removed: `BODY_MARK`, `BODY_MODIFICATION`, `COSMETIC_PROCEDURE` — these become `MediaCategory` rows with `usage = DETAIL`.

### 6.3 Modified: PersonMediaLink

```prisma
model PersonMediaLink {
  // ... existing fields ...
  usage       PersonMediaUsage
  categoryId  String?                       // FK → MediaCategory (required when usage = DETAIL)
  category    MediaCategory? @relation(fields: [categoryId], references: [id])
  // ... bodyMarkId, bodyModificationId, cosmeticProcedureId stay ...
}
```

### 6.4 New: SessionLink Table

```prisma
model SessionLink {
  parentSessionId String
  parentSession   Session @relation("ParentSession", fields: [parentSessionId], references: [id])
  childSessionId  String
  childSession    Session @relation("ChildSession", fields: [childSessionId], references: [id])
  relationship    String  @default("source")  // "source", "reference"
  notes           String?
  createdAt       DateTime @default(now())

  @@id([parentSessionId, childSessionId])
}
```

### 6.5 Modified: MediaCollection

```prisma
enum CollectionType {
  PROFILE   // Person's curated profile gallery
  USER      // User-defined themed collection
  ARTICLE   // Images for an article
}

model MediaCollection {
  // ... existing fields ...
  type     CollectionType @default(USER)
  personId String?                          // Required for PROFILE, optional for USER/ARTICLE
}
```

### 6.6 Data Migration Notes

When migrating from the old enum to the new structure:
1. Create `MediaCategory` rows for: "Body Mark", "Body Modification", "Cosmetic Procedure" (with appropriate `entityModel` values)
2. Update existing `PersonMediaLink` rows:
   - `usage = BODY_MARK` → `usage = DETAIL`, `categoryId` = body-mark category ID
   - `usage = BODY_MODIFICATION` → `usage = DETAIL`, `categoryId` = body-modification category ID
   - `usage = COSMETIC_PROCEDURE` → `usage = DETAIL`, `categoryId` = cosmetic-procedure category ID
3. Existing `bodyMarkId`, `bodyModificationId`, `cosmeticProcedureId` FKs stay populated — no data loss

---

## 7. Progress Log

| Date | Action |
|---|---|
| 2026-03-04 | Read user's use cases doc, analyzed current schema, performed industry research |
| 2026-03-04 | Identified 5 gaps, formulated 7 decisions with options |
| 2026-03-04 | Created `media-architecture-review.md` (decision tracker) and this context doc |
| 2026-03-04 | **Next step:** Work through decisions sequentially with user, then write coding spec |
