# Media Architecture Review

## Current State Assessment

The existing architecture follows the **Ingest → Manage → Publish** pattern used by professional DAMs (Adobe Experience Manager, Cloudinary, ResourceSpace):

| Layer | Implementation |
|---|---|
| **Ingest** | `Session` (PRODUCTION/REFERENCE) → `MediaItem` |
| **Manage** | `PersonMediaLink` (usage tagging), focal points, tags |
| **Publish** | `Set` + `SetMediaItem`, `MediaCollection` + `MediaCollectionItem` |

---

## Gap Analysis: Use Cases vs. Current Schema

### 1. Production Sets
**Status: Fully supported**

`Set` + `SetMediaItem` + `SetSession` → production session. Cover image, sort order, credits — all present.

**Decision: None needed.**

---

### 2. Production Compilation Sets
**Status: Partially supported**

`Set.isCompilation = true` exists, and `SetSession` allows multiple session links. But the use case document says compilation sets have their own "collaboration session" that *may reference source production sessions*.

**Gap: Sessions cannot reference other sessions.** No session-to-session linking exists.

**Decision needed:** How to model session-to-session relationships.

| Option | Description | Pros | Cons |
|---|---|---|---|
| **A: SessionLink table** | Join table with `parentSessionId`, `childSessionId`, `relationship` | Referential integrity, metadata on relationship | Extra table |
| **B: sourceSessionIds array** | `String[]` field on `Session` | Simple, minimal change | No referential integrity, no metadata |

**Recommendation: Option A** — join table for referential integrity.

---

### 3. Profile Sets
**Status: Implicitly handled, not explicit**

`PersonMediaLink` with usage PROFILE/PORTFOLIO can link any `MediaItem` to a person regardless of source session. But there's no formal "profile gallery" concept — it's just "all media linked to this person."

**Gap:** No explicit profile set model. No clear distinction between "this person's curated profile gallery" and "all media associated with this person."

**Sub-decision — sourcing constraint:** The use case says profile sets draw from the person's reference session AND production sessions the person contributed to. Should this be enforced?

| Option | Description | Pros | Cons |
|---|---|---|---|
| **A: Application-level** | UI only shows eligible media | Flexible, simple | No DB guarantee |
| **B: Database-level** | Trigger/constraint validates source | Strict integrity | Rigid, hard to override |

**Recommendation: Option A** — enforce at application level.

**Decision needed:** See Decision 3 (Collection scope and typing) below — profile sets may become a `MediaCollection` type.

---

### 4. Headshots
**Status: Fully supported**

`PersonMediaLink` with usage `HEADSHOT` + `slot` field, constrained by UI to reference session images. Slot labels configurable via `Setting` table.

**Decision: None needed.**

---

### 5. Personal Detail Sets (CRITICAL GAP)
**Status: Fundamentally blocked by current design**

The use case requires:
> *"The list of 'detail categories' is open and changeable. Categories can be added or removed and their labels can be changed. Therefore the tagging to the categories has to be generic."*

But `PersonMediaUsage` is a **hardcoded Prisma enum**:
```
PROFILE | HEADSHOT | BODY_MARK | BODY_MODIFICATION | COSMETIC_PROCEDURE | PORTFOLIO
```

Adding "eyes", "nose", "belly button" or removing "BODY_MODIFICATION" requires a **database migration**. This directly contradicts the requirement for user-configurable categories.

**Decision needed:** How to handle dynamic detail categories.

| Option | Description | Pros | Cons |
|---|---|---|---|
| **A: Category table (hybrid)** | Add `MediaCategory` table for user-defined categories. Simplify enum to structural values only: `HEADSHOT \| PROFILE \| PORTFOLIO \| DETAIL`. When `usage = DETAIL`, a `categoryId` FK points to the dynamic category. | Clean separation of structural vs. content. Future-proof. Users manage categories in Settings. | Slightly more complex queries (join for category name). |
| **B: Pure category table** | Eliminate enum entirely. Every usage (including HEADSHOT, PROFILE) becomes a `MediaCategory` row. | Maximum flexibility, single system. | HEADSHOT and PROFILE have special behavior (slot assignment, hero display) that doesn't apply to detail categories. Mixing structural and content categories adds complexity. |
| **C: Keep enum + freeform tags** | Keep enum as-is. Add `detailTags: String[]` to `PersonMediaLink`. | Minimal schema change. | No referential integrity, no hierarchy, no icons/colors, typo-prone. Doesn't solve the "labels are configurable in settings" requirement. |

**Recommendation: Option A** — hybrid approach preserves special behavior for structural usages while enabling user-defined categories.

**Sub-decision — category hierarchy depth:**

| Option | Description | Pros | Cons |
|---|---|---|---|
| **Flat** | Single level of categories | Simple | Can't express "Body → Arm → Upper Arm → Tattoo" |
| **Two-tier** | Category groups + categories | Covers most real-world needs | Doesn't handle deeper nesting |
| **Hierarchical (materialized path)** | `parentId` FK + `path` column for arbitrary depth | Maximum flexibility | More complex queries, tree management |

**Sub-decision — entity linking:**

Currently `PersonMediaLink` has direct FKs to `BodyMark`, `BodyModification`, `CosmeticProcedure`. If categories become dynamic, what happens to these links?

| Option | Description | Pros | Cons |
|---|---|---|---|
| **A: Keep FKs alongside categoryId** | Existing FKs stay. `categoryId` added. Both populated when relevant. | No data migration. Existing queries work. | Implicit relationship between category and FK — needs validation. |
| **B: Generic entityId + entityType** | Replace 3 FKs with `entityType: String?` + `entityId: String?` | Extensible to future entity types. | Loses referential integrity (polymorphic FK). Industry best practice advises against. |
| **C: Keep FKs, make categories entity-aware** | `MediaCategory` gets optional `entityModel` field ("BodyMark", "BodyModification", etc.) telling the UI which entity picker to show. Specific FKs on `PersonMediaLink` stay. | Referential integrity AND category flexibility. | Adding a new entity type still requires a FK column + migration. |

**Recommendation: Option C** — entity types are stable domain concepts; the number of entity-linkable categories is small.

---

### 6. User Sets
**Status: Partially supported**

`MediaCollection` exists but is **person-scoped** (`personId` FK). The use case describes user sets that pull from "every media-item (reference or production)" — potentially cross-person.

**Gap:** `personId` constraint on `MediaCollection` prevents cross-person collections like "Best of 2025" or "Special themes."

**Decision needed:** Collection scope and typing.

| Option | Description | Pros | Cons |
|---|---|---|---|
| **A: Unified MediaCollection with type** | Add `type` field: `PROFILE \| USER \| ARTICLE`. Make `personId` nullable (null for global sets). | Single model, simple queries. | Some types have constraints (PROFILE must have personId) requiring validation. |
| **B: Separate models** | Dedicated `PersonProfileSet` for profile gallery. Keep `MediaCollection` for user/article sets with nullable `personId`. | Clear separation of concerns. | More models, more join tables, more queries. |

**Recommendation: Option A** — unified model with type discriminator. Validation constraints are simple.

---

### 7. User Article Sets
**Status: Not implemented**

No article/wiki model exists. The use case describes "user defined selection to be used as image within an article (wikijs-like)."

**Decision needed:** Include article system in this spec or defer?

| Option | Description |
|---|---|
| **A: Include now** | Design the article model alongside the media restructuring |
| **B: Defer** | Handle as separate future effort. Reserve `ARTICLE` as a collection type but don't build the article system yet. |

---

## Decision Summary

| # | Topic | Options | Recommendation |
|---|---|---|---|
| 1 | Session-to-session linking | A: Join table, B: Array field | A |
| 2 | Profile set sourcing | A: App-level, B: DB-level | A |
| 3 | Dynamic detail categories | A: Hybrid (enum + category table), B: Pure category table, C: Enum + tags | A |
| 4 | Category hierarchy depth | Flat, Two-tier, Hierarchical | TBD |
| 5 | Entity linking approach | A: Keep FKs + categoryId, B: Generic polymorphic, C: Category-aware FKs | C |
| 6 | Collection scope/typing | A: Unified with type, B: Separate models | A |
| 7 | Article system | A: Include now, B: Defer | TBD |
