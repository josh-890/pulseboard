# Temporal Model — Phase G+ Implementation Plan

> **Status: PROPOSED (2026-05-24).** Drafted from the `/grill-with-docs` design session of 2026-05-23–24. No code shipped yet. For the current (Phase A–F) model, read `CONTEXT.md`, `docs/adr/0001`–`0004`, and `docs/data-model.md`.

Implements the design agreed during the 2026-05-23–24 design review. **Read first:**
- `CONTEXT.md` (glossary)
- `docs/adr/0005-unified-scalar-storage-with-mutability-policy.md`
- `docs/adr/0006-emergent-era-authoring-sticky-only-for-curated.md`
- `docs/adr/0007-drop-cosmetic-procedure-cause-on-delta.md`
- Memory: `project_emergent_era_workflow.md`, `project_scalar_attribute_ui.md`, `project_identity_bearing_ui.md`, `project_catalog_data_quality_cleanup.md`

---

## 0. Context

Phases A–F landed the Era + delta + fold + cache redesign. This phase (G) carries it the rest of the way: the changes the prior design left unfinished, plus three new architectural decisions that came out of the May 2026 grill session.

**Three structural decisions in this phase:**

1. **ADR-0005** — Static-vs-changing is a *policy* on the attribute definition, not a storage location. Every catalog attribute lives in one delta path; truly-static values are a stream of length 1 at Baseline. Eye color, height, ethnicity migrate off `Person` into the catalog.
2. **ADR-0006** — Eras are *emergent*, not pre-planned. No Era picker at filing time. Auto-cluster into draft Eras by date proximity. Sticky membership applies **only** to curated Eras; drafts re-cluster freely on date edits. Curation surfaces as an in-context nudge.
3. **ADR-0007** — Drop `CosmeticProcedure` entirely. Causation moves onto the delta itself (`cause` enum). Attribute status (`NATURAL` / `ENHANCED` / `RESTORED`) is derived from cause history.

**Plus comprehensive UX work** on the scalar grid (3 mutability primitives + populated-only sections + cross-group picker), identity-bearing entities (unified Body Features card + 4-section expanded layout + body map Level 2 interactivity + hover tooltip with image + hero type-presence chips), and a catalog data-quality cleanup pass.

**Strategy: expand-then-contract.** Phases A–F used "phased cutover, not dual-write." Phase G shifts to **expand-then-contract** because (a) the schema additions are mostly purely additive (cheap), (b) several slices are user-facing UX that benefits from a soak before the destructive cleanup, and (c) the user has confirmed forward-only behaviour for the trickiest data shift (existing draft Eras).

**Deploy model:** every commit is pushed and deployed to prod via SSH per the standing user preference (`feedback_always_push_and_deploy.md`). Each slice is a separate commit. Multi-tenant migrations apply via `scripts/deploy-migrations.sh` (iterates both `pulseboard` and `xpulseboard`).

**`migrate dev` is BROKEN project-wide** (shadow-DB enum issue per `MEMORY.md`). All migrations in this plan are hand-written and applied via `npx prisma migrate deploy`.

---

## 1. Slice dependency graph

```
        ┌── 1. Mutability policy + grid primitives (HITL)
        │       │
        │       └── 2. Glance/fill grid behaviour (AFK)
        │              │
        │              └── 7. Record-change sheet redesign (HITL)
        │                     │
        │                     ├── 8. Sticky-only-for-curated date-edit (AFK)
        │                     ├── 9. Curation nudge + undated section (HITL)
        │                     └── 10. Per-person Re-cluster drafts action (HITL)
        │
        ├── 3. Migrate eyeColor/height/ethnicity off Person (AFK)
        │       │
        │       └── 16. Catalog data-quality cleanup batch (HITL)
        │
        └── 4. cause-on-delta + hero Pattern Y (HITL)
                │
                ├── 5. Migrate CosmeticProcedureEvent → cause=SURGICAL deltas (AFK)
                │       │
                │       └── 11. Body Features unification (HITL)
                │              │
                │              ├── 12. 4-section expanded view (HITL)
                │              ├── 13. Body map Level 2 interactivity (AFK)
                │              │       │
                │              │       └── 14. Hover tooltip with image (AFK)
                │              └── 15. Hero type-presence chips (AFK)
                │
                └── 6. People search status sub-filter (AFK)

                                                ───all of the above─── 17. Schema contraction (AFK, ≥1wk soak)
```

**Recommended ordering for commits:** 1 → 4 → 3 → 5 → 2 → 7 → 6 → 8 → 11 → 16 → 9 → 10 → 12 → 13 → 14 → 15 → (1-week soak) → 17.

Rationale: schema additions early (1, 4); migrations and data shifts next (3, 5); then the UX layers consume the new model; the contraction (17) gates on the whole stack soaking in prod.

---

## 2. Cross-cutting concerns

### 2.1 Testing workflow

Per `feedback_testing_workflow.md`:
- **Every code change** ships with a test plan + Playwright tests where UI is touched.
- Keep tests in sync with code; full suite (`vitest` + Playwright) runs before commit + push + deploy.
- Per `feedback_manual_check_before_tests.md`: **ask the user for manual review** before running the final test suite on each slice.

Per slice in this plan, the **Verification** subsection enumerates:
- Unit tests (Vitest) — fold logic, services, helpers
- Integration tests (Vitest) — cross-service flows against the dev DB
- Playwright tests — UI affordances + routes
- Manual checks — what to eyeball in the browser
- Post-deploy validation — sample queries on prod to confirm the migration

### 2.2 Migration safety pattern (every schema change)

1. **Backup prod first**: `scripts/db-backup.sh` (`pulseboard` + `xpulseboard`) to `backups/` directory.
2. **Hand-write the migration** under `prisma/migrations/<timestamp>_<name>/migration.sql`. Wrap data migrations in `BEGIN; … COMMIT;` and include row-count assertions where applicable.
3. **Apply on dev first**: `npx prisma migrate deploy` against `.env` (`pulseboard_dev`). Run the full test suite. Validate sample queries.
4. **Apply on prod via deploy script**: `echo y | bash scripts/deploy-migrations.sh` — iterates both tenants. Tail logs.
5. **Refresh derived state**: where the migration affects `PersonCurrentState`, call `app_recompute_person_current_state(NULL)` to recompute all rows. Where MVs are involved, refresh per existing patterns.
6. **Smoke check on prod**: sample a known person on `10.66.20.65:3000`, verify expected behaviour. If anything is wrong, roll back via backup + revert.

### 2.3 Deploy procedure (every commit)

1. Run full Vitest + Playwright suites locally.
2. Manual browser check on the affected pages.
3. Commit (Co-Authored-By line per project standard).
4. `git push`.
5. Ask the user to run the SSH rebuild on Unraid:
   ```
   ssh root@10.66.1.233 'cd /mnt/user/appdata/dashboard && git pull && docker-compose down && docker-compose build --no-cache && docker-compose up -d'
   ```
6. Wait for container healthcheck.
7. Smoke check at `http://10.66.20.65:3000/`.

### 2.4 Rollback patterns

- **Schema rollback**: each migration file has a comment-block at the top listing the exact SQL to undo it (drop new columns, restore drops from backup). Migrations are reversible in principle; preferring forward-fix in practice.
- **Data rollback**: restore from `backups/` if a data migration corrupted state. Backups are tenant-scoped.
- **Code rollback**: `git revert` + redeploy. The SSH rebuild step is the same as forward deploy.

### 2.5 What this plan does NOT cover

- Performance benchmarking of the new fold under load. (Out of scope; ADR-0003's per-tx recompute is the design budget.)
- Plausibility validation updates. (Surveyed during grill; deferred. Add a follow-up if any new constraint emerges from the new model.)
- Documentation regeneration. (`docs/architecture.md` and `docs/user-guide.md` must be updated as part of each slice's PR — already a standing user preference.)

---

## Slice 1 — Mutability policy + 3 grid primitives

**Type:** HITL  
**Blocked by:** None  
**References:** ADR-0005, `project_scalar_attribute_ui.md`

### Scope
Add the `mutability` enum to `PhysicalAttributeDefinition`. Implement the three deterministic visual primitives in the Appearance grid and the catalog manager UI. No data migration of attributes' positions on `Person` yet (that's slice 3).

### Implementation outline
1. Schema migration: add enum `Mutability { ALWAYS_STATIC, RARELY_CHANGES, VOLATILE }`; add column `mutability Mutability @default(RARELY_CHANGES)` to `PhysicalAttributeDefinition`.
2. Seed update (`prisma/seed.ts`): annotate seeded definitions with sensible mutability values per the table in `project_scalar_attribute_ui.md`.
3. Backfill SQL: set `mutability` on all existing definitions based on a hand-curated mapping (Handedness, Eye Pattern, Limbal Ring, Brushfield Spots → ALWAYS_STATIC; Build, Face Shape, Inseam, Hair Pattern, etc. → RARELY_CHANGES; Weight, Hair Color, Hair Length, Body Fat, Roots Showing → VOLATILE).
4. Update `lib/services/attribute-definition-service.ts` to read `mutability`.
5. New component: `<MutabilityPrimitive>` switching on the enum → renders `<StaticLabelRow>` / `<ValueWithChangeButton>` / `<ValueWithSparklineRow>`.
6. `appearance-tab.tsx` rows route through `<MutabilityPrimitive>`.
7. `/settings/catalogs/attributes` UI exposes the mutability field on the attribute edit sheet.

### Acceptance criteria
- [ ] `Mutability` enum and column exist in DB on both tenants
- [ ] Every existing definition has a sensible mutability backfilled (no NULLs, no random defaults)
- [ ] The Appearance grid renders the correct primitive per attribute (Eye color → inline label; Build → value+change; Weight → sparkline+change)
- [ ] Catalog manager UI lets a user change the mutability and the grid reflects the new primitive on refresh
- [ ] Reclassification does not modify any existing `ScalarDelta` rows (verified by row-count + content checksum before/after)

### Verification
- **Unit:** `attribute-definition-service.test.ts` — read returns mutability; default is `RARELY_CHANGES`.
- **Integration:** `appearance-tab.test.tsx` — render a fixture with all three mutability values, assert the correct primitive child renders for each row.
- **Playwright:** `appearance-mutability-primitives.spec.ts` — load Nancy A's Appearance tab; assert Eye color row has no record-change button; Weight row has the sparkline + record-change as primary affordance.
- **Manual:** Open `/settings/catalogs/attributes` → edit Weight → change mutability `VOLATILE → RARELY_CHANGES` → reload Nancy's Appearance tab → confirm primitive changed.
- **Post-deploy:** `SELECT slug, mutability, count(*) OVER (PARTITION BY mutability) FROM "PhysicalAttributeDefinition" ORDER BY mutability, slug;` — sanity-check distribution.

### Risks
- **Backfill mis-classification.** Some attributes may land in the wrong bucket. → Mitigated by the user being able to reclassify in Settings without data risk.
- **HITL review on the primitive visuals.** Show the user the three rendered primitives on a real person before merging; iterate on styling.

### Rollback
- Migration revert: drop `mutability` column. Service falls back to no policy (every attribute uses the generic primitive — the pre-Phase-G look).
- Code revert: `git revert` the commit.

---

## Slice 2 — Glance/fill grid behaviour

**Type:** AFK  
**Blocked by:** Slice 1  
**References:** `project_scalar_attribute_ui.md` (Grid behaviour under a growing catalog)

### Scope
Replace today's flat 2-column grid with the populated-only-sections layout + pinned-core section + cross-group picker.

### Implementation outline
1. Service: `getAttributeGridForPerson(personId)` returns groups → attributes-with-deltas, plus the pinned-core set.
2. New component: `<ScalarAttributeGrid>` rendering populated `<AttributeGroupSection>`s.
3. New component: `<PinnedCoreSection>` — system defaults (Height, Weight, Eye color, Hair color, Build) always visible, even if no deltas.
4. Per-row context menu (`<AttributeRowMenu>`): `Pin to top` / `Unpin` / `Remove all values`.
5. New component: `<AddAttributePicker>` — modal opened from the card footer `+ Track another attribute` button. Search bar + collapsible groups; populated rows muted; unpopulated rows active.
6. Picker → record-change sheet (slice 7) pre-selected attribute.
7. Persist per-person pinned overrides in a new `PersonPinnedAttribute` table or as an array on `Person` (decision: array column for simplicity).
8. New schema: `Person.pinnedAttributeSlugs String[] @default([])`.

### Acceptance criteria
- [ ] Empty groups are hidden entirely (not shown as empty cards)
- [ ] Pinned-core section is visible even when its rows have no deltas (shown as `Eye color    —    + Add`)
- [ ] `+ Track another attribute` footer button opens picker; picker shows all catalog attrs grouped, with populated ones muted
- [ ] Selecting an unpopulated attribute opens the record-change sheet with baseline-fill as the default action (since no prior history)
- [ ] After save, the grid auto-scrolls/highlights the newly-populated row; previously-hidden group section appears if needed
- [ ] Per-row context menu allows pin/unpin per-person

### Verification
- **Unit:** `attribute-grid-service.test.ts` — given a person with deltas on 5 attrs across 3 groups, return only those 3 groups.
- **Integration:** `attribute-grid.test.tsx` — fixture with mixed populated/unpopulated; assert hidden groups not rendered; assert pinned-core always visible.
- **Playwright:** `attribute-grid-glance-fill.spec.ts` — load a person; assert empty group is hidden; click `+ Track another attribute`; select Hair Texture; complete sheet; assert Facial Features section appears with Hair Texture row.
- **Manual:** Verify hero "Physique" panel and grid pinned-core stay coherent (same set).
- **Post-deploy:** smoke-check a person with many attributes (e.g., Nancy A) and a person with few; grid should look proportionate in both cases.

### Risks
- **Pinned-core source-of-truth.** System default vs per-person override needs clear precedence (per-person wins). → Encoded in service.
- **Picker performance** at large catalogs. → Catalog has ~50 entries today, well under any perf threshold; revisit if it ever exceeds ~500.

### Rollback
- Code revert; pinned-array column can stay (no harm in carrying the data).

---

## Slice 3 — Migrate `eyeColor` / `height` / `ethnicity` off `Person`

**Type:** AFK  
**Blocked by:** Slice 1  
**References:** ADR-0005, `project_catalog_data_quality_cleanup.md` (#1, #6)

### Scope
Three structurally-similar field migrations bundled into one slice. Add the attributes to the catalog (if absent); convert existing Person column values to Baseline `ScalarDelta` rows; update read paths to source from the catalog. Person columns retained as no-ops (drop in slice 17).

### Implementation outline
1. Migration SQL:
   - Insert catalog entries: `Eye color` (group: Eye Features, mutability: ALWAYS_STATIC, valueType: SINGLE_SELECT bound to `color_catalog`), `Height` (group: Core Body Measurements, mutability: ALWAYS_STATIC, valueType: NUMERIC, unit: cm), `Ethnicity` (new group "Demographics" or Core Physical, mutability: ALWAYS_STATIC, valueType: SINGLE_SELECT).
   - For each Person with non-null `eyeColor`/`height`/`ethnicity`: create a `ScalarDelta` in their Baseline Era with the value. Row-count assertion: post-migration delta count = pre-migration non-null Person field count.
2. Service updates: `getPersonAppearance(personId)` now reads from the fold (already populates `PersonCurrentState.eyeColor` etc., but also needs `currentAttributes` to carry the catalog versions).
3. Update `app_recompute_person_current_state()` SQL to populate the migrated attributes correctly through the catalog path.
4. Remove the eye-color / height / ethnicity fields from `edit-person-sheet.tsx`. Adding/editing happens via the grid.
5. Hero "Physique" panel: source these values from the catalog-driven cache instead of `Person` columns.

### Acceptance criteria
- [ ] All three attributes exist in the catalog with correct mutability + value types
- [ ] Every Person with a previous `eyeColor`/`height`/`ethnicity` value has a corresponding Baseline `ScalarDelta` (row counts match)
- [ ] Hero Physique panel still shows the values correctly
- [ ] Editing height/eye color/ethnicity in the new Appearance grid persists; `Person` columns are NOT updated (orphaned writes guard)
- [ ] No regression on the People search filters that used these fields

### Verification
- **Unit:** `migration-eye-color-height-ethnicity.test.ts` — given a fixture Person with all three set, run migration, assert deltas exist on Baseline, assert old columns untouched.
- **Integration:** `person-detail.test.tsx` — render Nancy A; assert hero shows correct height/eye color from the cache.
- **Playwright:** `migrated-attributes.spec.ts` — load a known person; assert hero shows expected values; edit eye color via grid; refresh; verify it persists.
- **Manual:** Pick 3 people of varying data densities; eyeball hero + grid for each.
- **Post-deploy:** 
  ```sql
  SELECT COUNT(*) FROM "Person" WHERE "eyeColor" IS NOT NULL;  -- N1
  SELECT COUNT(*) FROM "ScalarDelta" sd
    JOIN "PhysicalAttributeDefinition" d ON sd."attributeDefinitionId" = d.id
    WHERE d.slug = 'eye-color';  -- expect N1
  ```
  Repeat for height and ethnicity. Identical counts.

### Risks
- **`ethnicity` may not have a clear value type.** Today it's free text. → For the migration, valueType=TEXT; the cleanup batch (slice 16) tightens to SINGLE_SELECT with a curated vocabulary.
- **Hero rendering coherence.** Old code read `person.eyeColor`; new code reads cache. Ensure no remaining old-path reads. → Grep gate before merging.
- **Tenant-specific `PhysicalAttributeGroup` IDs.** The S3a migration as-shipped hardcoded dev's group UUIDs for `Eye Features` and `Core Body Measurements`, which broke on prod tenants whose catalog groups have different IDs. The migration was recovered manually via `docs/migration-recipes/slice-3a-portable.sql` (name-based lookup + `ON CONFLICT DO NOTHING`) and marked applied via `prisma migrate resolve --applied`. **Lesson for any future catalog-seeding migration: never hardcode group IDs.** Use name-based subqueries (`SELECT id FROM "PhysicalAttributeGroup" WHERE name = '…'`).

### Rollback
- Migration revert: delete the new deltas (keyed by `dateSource = 'migration-2026-05-phase-g'`), drop the new catalog entries. Person columns are still present; old code paths work again.

---

## Slice 4 — `cause` enum + status derivation + hero Pattern Y

**Type:** HITL  
**Blocked by:** None  
**References:** ADR-0007

### Scope
Add the `cause` enum and column to `ScalarDelta`, `BodyMarkEvent`, `BodyModificationEvent`. Update the fold to derive `attributeStatuses` from cause. Render Pattern Y in the hero for `ENHANCED`/`RESTORED` attributes.

### Implementation outline
1. Schema migration:
   - Enum `DeltaCause { NATURAL, SURGICAL, OTHER }`.
   - Add `cause DeltaCause @default(NATURAL)` to `ScalarDelta`, `BodyMarkEvent`, `BodyModificationEvent`.
2. Update `foldScalarDeltas` (TS) and `app_recompute_person_current_state` (SQL) to derive `attributeStatuses` per attribute:
   - `NATURAL` — no SURGICAL delta in history
   - `ENHANCED` — winning delta has `cause = SURGICAL`
   - `RESTORED` — SURGICAL exists in history but a later non-SURGICAL has overridden
3. Backfill: recompute `PersonCurrentState` for all persons (`app_recompute_person_current_state(NULL)`).
4. Hero rendering: switch `Physique` panel to Pattern Y for `ENHANCED`/`RESTORED` attributes — `B (Natural) → D (Enhanced)`. NATURAL renders as plain value.
5. The Appearance grid `<ValueWithSparklineRow>` primitive (VOLATILE) gains status labels per pill in the sequence-of-pills view.

### Acceptance criteria
- [ ] All three event tables have `cause` column with `NATURAL` default
- [ ] `attributeStatuses` JSON in `PersonCurrentState` is correctly populated based on cause derivation (verified against hand-coded test fixtures)
- [ ] Hero shows Pattern Y for any attribute whose status is `ENHANCED` or `RESTORED`
- [ ] Hero shows plain value (no badge) for `NATURAL`
- [ ] TS fold and SQL fold produce byte-identical `attributeStatuses` for a deterministic test person

### Verification
- **Unit:** `fold-status-derivation.test.ts` — fixture deltas with various cause patterns; assert correct status output.
- **Cross-fold parity test:** `fold-parity.test.ts` — run a fixture person through `foldScalarDeltas` AND `app_recompute_person_current_state`; assert JSON equality on attributeStatuses + currentAttributes.
- **Integration:** `person-hero-pattern-y.test.tsx` — fixture with breast_size ENHANCED; assert rendering matches `B (Natural) → D (Enhanced)` exactly.
- **Playwright:** `hero-pattern-y.spec.ts` — using a person we'll create in dev with a SURGICAL delta on breast_size, verify the hero renders Pattern Y.
- **Manual:** Create a test person; manually `UPDATE "ScalarDelta" SET cause='SURGICAL' WHERE ...`; recompute cache; verify hero updates.
- **Post-deploy:** spot-check a few existing persons; the only ones with `attributeStatuses` set should be those where the import flagged an `enhanced or fake` value (these will become non-NATURAL post-slice-5).

### Risks
- **The TS and SQL folds must stay in sync** (ADR-0001 amendment 3). Both encode the same logic with opposite literal sort directions; both must derive status identically. → Cross-parity test is the gate.
- **HITL review on Pattern Y rendering.** Show the user the Pattern Y rendering on Nancy or a synthetic person before merging.

### Rollback
- Migration revert: drop the `cause` columns. Fold falls back to all-NATURAL derivation. Hero always shows plain value.

---

## Slice 5 — Migrate `CosmeticProcedureEvent` → `ScalarDelta` with `cause = SURGICAL`

**Type:** AFK  
**Blocked by:** Slice 4  
**References:** ADR-0007

### Scope
The big data migration. Convert each `CosmeticProcedureEvent` into a `ScalarDelta` with `cause = SURGICAL`. Re-point photo links. Remove the `Cosmetic Procedures` card from the UI. Keep the old tables in place (drop in slice 17).

### Implementation outline
1. Schema migration: add `scalarDeltaId String?` to `PersonMediaLink`; index it.
2. Data migration script (runs as `BEGIN; ... COMMIT;`):
   - For each `CosmeticProcedureEvent`:
     - If `cosmeticProcedure.attributeDefinitionId` is non-null:
       - Insert `ScalarDelta` with `value = valueAfter` (fallback: `value = ''`), `cause = SURGICAL`, `date = event.date`, `eraId = event.eraId`, `notes = trim(coalesce(event.notes, '') || ' [provider: ' || coalesce(provider, '?') || ']')`.
     - Else (procedure without a scalar target — should be zero per user's confirmation, but defensive):
       - Insert a `BodyMark` of type `other` with `cause = SURGICAL` and the description preserved.
3. Re-target photos: `UPDATE "PersonMediaLink" SET "scalarDeltaId" = <new-id> WHERE "cosmeticProcedureId" = <old-id>;`.
4. Row-count assertions: every `CosmeticProcedureEvent` maps to exactly one new row; every `PersonMediaLink.cosmeticProcedureId` is re-pointed.
5. UI: remove the `Cosmetic Procedures` card from `appearance-tab.tsx` and its child sheet (`add-cosmetic-procedure-sheet.tsx`, `edit-cosmetic-procedure-sheet.tsx`, `add-cosmetic-procedure-event-dialog.tsx` — keep files for now, remove from imports).
6. Update import workflow's `enhanced or fake` breast handling to emit a `cause = SURGICAL` `ScalarDelta` instead of a `CosmeticProcedure`.
7. Recompute `PersonCurrentState` (the cache must reflect new status derivation from the migrated deltas).

### Acceptance criteria
- [ ] Every `CosmeticProcedureEvent` row produces exactly one new authoring record (ScalarDelta or BodyMark)
- [ ] Every photo previously linked via `cosmeticProcedureId` is now linked via `scalarDeltaId` (or `bodyMarkId` for the rare defensive case)
- [ ] `attributeStatuses` post-migration correctly reflects ENHANCED for breast_size on persons who had an augmentation procedure
- [ ] Hero shows Pattern Y on those persons
- [ ] `Cosmetic Procedures` card is no longer rendered on `/people/[id]?tab=appearance`
- [ ] Import workflow no longer creates `CosmeticProcedure` rows; new imports with `enhanced or fake` create `cause = SURGICAL` deltas

### Verification
- **Pre-migration backup**: `scripts/db-backup.sh` for both tenants.
- **Unit:** `cosmetic-procedure-migration.test.ts` — fixture with 5 procedures (3 with attributeDefinitionId, 2 without); run migration; assert 3 ScalarDeltas + 2 BodyMarks created; row counts match.
- **Integration:** `import-enhanced-or-fake.test.ts` — feed an import containing `enhanced or fake` breast value; assert ScalarDelta with cause=SURGICAL is created, NOT a CosmeticProcedure.
- **Playwright:** `cosmetic-procedure-removed.spec.ts` — load a person who had a procedure; assert no `Cosmetic Procedures` card; assert hero shows ENHANCED Pattern Y.
- **Manual:** Before merge — run the migration on a dev DB seeded with prod data; pick 5 persons known to have procedures; manually verify their hero + grid + photos before and after.
- **Post-deploy:**
  ```sql
  -- Source count
  SELECT COUNT(*) FROM "CosmeticProcedureEvent";  -- N1
  -- Target count (deltas + body marks created by migration)
  SELECT COUNT(*) FROM "ScalarDelta" WHERE "dateSource" = 'migration-2026-05-phase-g-procedures';
  SELECT COUNT(*) FROM "BodyMark" WHERE "type" = 'other' AND <criteria>;
  -- Sum should match N1
  -- Photo re-targeting
  SELECT COUNT(*) FROM "PersonMediaLink" WHERE "cosmeticProcedureId" IS NOT NULL AND "scalarDeltaId" IS NULL;
  -- Should be 0 (every old link re-pointed)
  ```

### Risks
- **Data loss on misclassification.** A procedure with `attributeDefinitionId = NULL` could be mis-mapped. → Defensive fallback to BodyMark of type `other`; row-count gate catches discrepancies.
- **Photo link orphaning.** Mistargeted `scalarDeltaId` could orphan photos. → Re-target inside the same transaction as the insert; assert no NULL `scalarDeltaId` for previously-linked photos.
- **Import workflow regression.** Imports that ran during the migration window could create orphan procedure rows. → Schedule migration for off-hours; pause the import service if active.

### Rollback
- Restore both tenants from backup (`backups/` dir).
- Revert code.
- Important: the old `CosmeticProcedure` tables are untouched by this slice — the data still exists in them, so rollback is restoring the migration's NEW rows from backup. Old data remains valid.

---

## Slice 6 — People search status sub-filter

**Type:** AFK  
**Blocked by:** Slice 4  
**References:** ADR-0007

### Scope
Add the status sub-filter to attribute filters in the People search sidebar. Backed by the GIN index on `PersonCurrentState.attributeStatuses`.

### Implementation outline
1. Schema: ensure GIN index exists on `PersonCurrentState.attributeStatuses` (already in schema; verify).
2. Service `people-search-service.ts`: add `attributeStatus` filter param `{ slug: string, status: 'NATURAL' | 'ENHANCED' | 'RESTORED' | 'ANY' }[]`.
3. Query construction: `WHERE pcs."attributeStatuses"->>'breast_size' = 'NATURAL'` (or absent for default).
4. UI: extend the existing attribute filter row in `people-search-sidebar.tsx` to include a status dropdown alongside the value dropdown — e.g., `Breast size: [B ▾] [Natural ▾]`.

### Acceptance criteria
- [ ] Filter `breast_size status = NATURAL` returns only persons with that derived status (manual count verification on dev DB)
- [ ] Filter is composable with the existing value filter (Status AND Value both apply)
- [ ] No regression in existing filter combinations
- [ ] Filter is fast (uses GIN index — verified via `EXPLAIN ANALYZE`)

### Verification
- **Unit:** `people-search-service.test.ts` — add cases for status filter alone, status + value combined.
- **Integration:** `people-search-sidebar.test.tsx` — render sidebar with status sub-filter; toggle; assert URL searchParams update correctly.
- **Playwright:** `people-search-status-filter.spec.ts` — load /people, filter by `breast_size status = ENHANCED`, verify only the expected persons appear.
- **Post-deploy:** run `EXPLAIN ANALYZE` on a representative status query; confirm GIN index usage.

### Risks
- **`attributeStatuses` JSON shape drift.** If slice 4 changes the JSON keys, this filter breaks. → Lock the JSON shape in slice 4's tests.

### Rollback
- Code revert. No schema change in this slice.

---

## Slice 7 — Record-physical-change-sheet redesign

**Type:** HITL  
**Blocked by:** Slice 1  
**References:** ADR-0006, `project_emergent_era_workflow.md`

### Scope
Redesign `record-physical-change-sheet.tsx` per the agreed anatomy: no Era picker; value + date + "I don't know yet" + notes + collapsed baseline-fill disclosure + brief one-line info on auto-clustering. Implement auto-cluster service.

### Implementation outline
1. New service: `autoClusterDeltaIntoDraftEra(personId, date)` — returns the Era ID:
   - If `date` is null → return the person's dateless draft Era (create one if absent).
   - Else: find any existing draft Era for the person whose member-date range overlaps `[date - 6mo, date + 6mo]`; if found, return it; else create a new draft Era.
2. UI: rewrite `record-physical-change-sheet.tsx`:
   - Remove the Era selector.
   - Add `<DateInputWithUnknown>` — date input + "I don't know yet" checkbox; when checked, save with `date = null, datePrecision = UNKNOWN`.
   - Add collapsed `<details><summary>Actually, this was always true (add to baseline)</summary></details>` disclosure at the bottom; when expanded and selected, save the delta on Baseline (dateless) instead.
   - Add the info line above the buttons: "This will be filed into a draft Era and clustered with nearby changes."
   - Inferred default for the baseline-fill: if the attribute has no prior delta, default-open the disclosure; otherwise default-closed.
3. Save flow: call `autoClusterDeltaIntoDraftEra()` to determine Era; insert delta; trigger cache recompute.
4. Apply the same flow to `edit-physical-change-sheet.tsx` (editing keeps the existing Era unless date moves the delta out of a draft — covered in slice 8).

### Acceptance criteria
- [ ] No Era picker visible in the record-change sheet
- [ ] "I don't know yet" checkbox saves the delta with `date = null` and routes it to a dateless draft Era
- [ ] Baseline-fill disclosure default-open for attributes with no prior delta; default-closed otherwise
- [ ] Brief auto-cluster info line visible
- [ ] Saved delta correctly lands in the right draft Era per the auto-cluster algorithm (verified by unit tests on the service)

### Verification
- **Unit:** `auto-cluster-service.test.ts` — fixtures: existing drafts at 2018-06 and 2022-01; assert a new delta dated 2018-09 joins the 2018 draft; 2020-02 starts a new draft; null date goes to dateless draft.
- **Integration:** `record-physical-change-sheet.test.tsx` — fixtures with prior history vs. no prior history; assert disclosure default state.
- **Playwright:** `record-change-no-era-picker.spec.ts` — open the sheet for an existing person's Weight (has history); assert no Era picker; assert baseline-fill disclosure default-closed; save; verify delta in correct draft.
- **Manual:** Test the dateless flow — open sheet, check "I don't know yet", save; verify delta appears in "Undated changes" section once slice 9 lands (until then, verify via DB).
- **Post-deploy:** smoke-test on a real person.

### Risks
- **The auto-cluster algorithm's ±6mo default may need tuning.** → Make `N` a constant in one place so it's a 1-line change to tune; revisit empirically after 2 weeks of use.
- **HITL review** on the redesigned sheet's visual layout — show user before merge.

### Rollback
- Code revert. Existing deltas untouched.

---

## Slice 8 — Sticky-only-for-curated on delta date-edit

**Type:** AFK  
**Blocked by:** Slice 7  
**References:** ADR-0006

### Scope
When a delta's date is edited, check if its containing Era is `isDraft`; if so, run auto-cluster and potentially move the delta to a different draft. Curated Eras retain their sticky membership.

### Implementation outline
1. Service `editScalarDeltaDate(deltaId, newDate, newPrecision)`:
   - Load delta + Era.
   - Update delta's date fields.
   - If `era.isDraft`: re-run `autoClusterDeltaIntoDraftEra` with the new date; if it returns a different Era, move the delta there; if the old draft Era ends up empty, delete it.
   - If `era.isCurated`: do not move; just update the date.
2. Same logic in `edit-physical-change-sheet.tsx`'s save handler.

### Acceptance criteria
- [ ] Editing a delta date in a draft Era moves the delta if a better draft fits the new date
- [ ] Editing a delta date in a curated Era leaves the delta in place
- [ ] Empty draft Eras (after a move-out) are auto-deleted

### Verification
- **Unit:** `edit-scalar-delta-date.test.ts` — fixtures: draft Era A with delta D dated 2018; edit D to 2022; assert D moved to/created draft Era B; A deleted if empty.
- **Integration:** `edit-physical-change-sheet.test.tsx` — fixture, change date, assert correct Era movement.
- **Playwright:** `delta-date-edit-recluster.spec.ts` — open a person with deltas in draft; edit a date; refresh; verify the delta now appears under the new Era in the History panel.

### Risks
- **Cascade deletion of empty draft Eras.** Must run inside the same transaction as the delta move to avoid orphaning. → Test with concurrent operations? (Phase G doesn't introduce concurrent users; deferred.)

### Rollback
- Code revert.

---

## Slice 9 — Overview History panel — curation nudge + "Undated changes" + promotion sheet

**Type:** HITL  
**Blocked by:** Slice 7  
**References:** ADR-0006

### Scope
The Overview History panel gains the curation nudge for drafts with ≥3 deltas, the aggregate Overview-tab badge, an "Undated changes" section for dateless draft Eras, and the inline promotion sheet (name + checkbox list of deltas).

### Implementation outline
1. UI: `entity-event-timeline.tsx` — for each draft Era with `deltaCount >= 3`, render a soft prompt next to the year label: `... · 4 changes · Name this phase?`.
2. Dismissal: store dismissals as `(personId, eraId, dismissedAt)` in a new `EraNudgeDismissal` table or in `localStorage` (decision: localStorage for simplicity; cross-device dismissal doesn't matter much).
3. 7-day suppression: hide the nudge if `dismissedAt > now() - 7 days`.
4. Aggregate badge: count drafts over-threshold for the person; render on the Overview tab label as `Overview · 2 draft eras ready`.
5. "Undated changes" section: render dateless draft Era(s) at the top or bottom of the Era spine with a soft-flagged style; per-delta `Set date` affordance.
6. Promotion sheet: inline editor with name field + checkbox list of the Era's deltas (default all checked); uncheck splits into a separate draft on Save; Save sets `isDraft = false` and `label = entered-name`.

### Acceptance criteria
- [ ] Nudge appears on draft Eras with ≥3 deltas
- [ ] Dismissal hides the nudge for 7 days
- [ ] Overview tab badge shows correct count
- [ ] Dateless draft Era renders as "Undated changes" with `Set date` affordance per delta
- [ ] Promotion sheet works: enter name, save, Era becomes curated; sticky kicks in
- [ ] Unchecking deltas during promotion splits them into a new draft Era

### Verification
- **Unit:** `nudge-eligibility.test.ts` — fixtures with various draft Era sizes; assert eligibility.
- **Integration:** `entity-event-timeline.test.tsx` — render with draft Era ≥3 deltas; assert nudge appears; click dismiss; reload; assert nudge hidden.
- **Playwright:** `curation-nudge.spec.ts` — load a person with a 4-delta draft; assert nudge; dismiss; assert hidden; force-clear localStorage; assert reappears; promote with name; assert Era now curated.
- **Manual:** HITL review on visual treatment of the nudge — should be soft, not nagging.
- **Post-deploy:** spot-check; nudges should appear on persons with existing 3+ delta draft Eras (e.g., persons with import history).

### Risks
- **Nudge fatigue.** If the suppression isn't honoured or 7 days feels wrong, user habituates. → 7 days is configurable in one place; revisit.
- **Splitting on uncheck is non-trivial UX.** Make sure the user sees what they're splitting into. → Show preview in the sheet.

### Rollback
- Code revert. Existing Eras unaffected.

---

## Slice 10 — Per-person `Re-cluster drafts` action

**Type:** HITL  
**Blocked by:** Slice 7  
**References:** ADR-0006 (amendment 2026-05-24)

### Scope
Per-person opt-in to re-cluster existing draft Eras (created under the old sticky-always rule) using the new ±6-month algorithm. Preview pane shows old vs new grouping; user applies or cancels.

### Implementation outline
1. Service: `previewRecluster(personId)` — returns `{ currentDrafts: Era[], newDrafts: Era[], deltaMappings: { deltaId, fromEraId, toEraId }[] }`. Read-only.
2. Service: `applyRecluster(personId)` — atomically applies the mapping; creates/deletes Eras as needed; curated Eras never touched.
3. UI: button in History panel header (visible when ≥1 draft Era exists) → opens preview pane.
4. UI: preview pane shows two columns side-by-side ("Current grouping" / "After re-cluster") with deltas in each Era listed; `Apply` / `Cancel` buttons.

### Acceptance criteria
- [ ] Button visible only for persons with ≥1 draft Era
- [ ] Preview pane correctly shows old vs new grouping
- [ ] Apply moves deltas as previewed; curated Eras untouched
- [ ] Cancel discards no state
- [ ] After apply, fold + cache are recomputed

### Verification
- **Unit:** `recluster-preview.test.ts` — fixtures: person with 3 drafts (2017/2018/2019, calendar buckets); assert preview shows new groupings (e.g., 2017 splits, 2018+2019 merge if proximate).
- **Integration:** `recluster-apply.test.ts` — apply preview; assert deltas moved correctly; cache recomputed.
- **Playwright:** `recluster-drafts.spec.ts` — load person; click Re-cluster; preview; apply; verify History panel reflects new structure.
- **Manual:** HITL review of preview pane layout.

### Risks
- **User confusion about what changed.** Side-by-side diff must be clear. → HITL design pass.
- **Transactional safety.** Re-cluster involves many writes; must be one transaction. → Use `prisma.$transaction`.

### Rollback
- Per-person rollback isn't trivial after apply. → Optional: snapshot the affected Eras+deltas to a JSON column for 7 days, allow restore. Defer this if user agrees the action is unlikely to be regretted (drafts have no semantic claim).

---

## Slice 11 — Body Features unification

**Type:** HITL  
**Blocked by:** Slice 5  
**References:** `project_identity_bearing_ui.md`

### Scope
Replace the three separate cards (`Body Marks`, `Body Modifications`, `Cosmetic Procedures` — last already gone from slice 5) with one unified `Body Features` card. Type-grouped sections with section accents; populated-only; footer `+ Add body feature` picker.

### Implementation outline
1. New component: `<BodyFeaturesCard>` — renders `<BodyFeatureSection>` per type with ≥1 entry.
2. Section accent colors preserved per category (orange marks, teal modifications).
3. Footer `+ Add body feature` opens type picker → routes to the relevant add sheet pre-selected.
4. Remove the three separate cards from `appearance-tab.tsx`.

### Acceptance criteria
- [ ] One card replaces the previous three
- [ ] Empty types hidden; populated types shown with accent
- [ ] `+ Add body feature` picker surfaces all type options
- [ ] No regression on body-mark/body-modification CRUD

### Verification
- **Integration:** `body-features-card.test.tsx` — fixture with marks + no modifications; assert only marks section rendered.
- **Playwright:** `body-features-unification.spec.ts` — load Nancy A; assert one card; assert empty Body Modifications section hidden.
- **Manual:** HITL design review on the visual unification.

### Risks
- **Cross-category data inconsistency** during the transition. → Slice 5 must be complete (procedures migrated) before this lands.

### Rollback
- Code revert; old cards still in components/people/.

---

## Slice 12 — 4-section expanded view for identity-bearing entities

**Type:** HITL  
**Blocked by:** Slice 11  
**References:** `project_identity_bearing_ui.md`

### Scope
Expanding an entity row in the Body Features card shows four distinct sections: Status pill, Current properties (folded), Photos, Lifecycle (dot-line + event log + "+ Record event" button).

### Implementation outline
1. Helper: `foldEntityProperties(entity)` — for body marks: fold `BodyMarkEvent` overrides (`bodyRegions/motif/colors/size/description`) to current values.
2. Component: `<ExpandedEntityView>` — Status pill (top-right), Current properties (labelled), Photos (existing `PersonMediaLink.bodyMarkId` strip), Lifecycle (re-uses `<EntityEventTimeline>` already implemented + a `+ Record event` button at bottom).
3. Apply to body marks AND body modifications uniformly.

### Acceptance criteria
- [ ] Expanding a body mark row shows the four distinct sections
- [ ] Status pill correctly reflects last event's effect
- [ ] Current properties show folded values (not original)
- [ ] Lifecycle dot-line + event log + `+ Record event` button all functional
- [ ] Same layout for body modifications

### Verification
- **Unit:** `fold-entity-properties.test.ts` — fixture with `added` event setting motif="X" then `modified` event setting motif="Y"; assert current motif is "Y".
- **Integration:** `expanded-entity-view.test.tsx` — render with multi-event entity; assert all four sections + correct current values.
- **Playwright:** `body-features-expanded.spec.ts` — load Nancy A; expand a tattoo; verify four sections.
- **Manual:** HITL review.

### Risks
- **Fold logic for entity properties is new.** → Unit-test extensively.

### Rollback
- Code revert.

---

## Slice 13 — Body map Level 2 interactivity

**Type:** AFK  
**Blocked by:** Slice 11  
**References:** `project_identity_bearing_ui.md` (Body map behaviour)

### Scope
Make the body map interactive: linked highlight (hover dot ↔ list row), click region → filter list, outlined dots for removed entities, all types shown with section accents.

### Implementation outline
1. State management: a `selectedRegion` context shared between `<BodyMap>` and `<BodyFeaturesCard>`.
2. `<BodyMap>`:
   - Render dots for all marks + modifications, color-coded by section accent.
   - Removed entities → outlined dot style.
   - Hover dot → emit highlight event → list row glows; click dot → scroll to list row.
   - Hover region → highlight; click region → set `selectedRegion` filter.
3. `<BodyFeaturesCard>` consumes `selectedRegion` → renders a filter chip + filtered rows.

### Acceptance criteria
- [ ] Hover dot highlights matching list row
- [ ] Hover list row highlights matching dot
- [ ] Click region filters list (chip visible)
- [ ] Removed entities render as outlined dots
- [ ] All types visible (no per-type toggle)

### Verification
- **Integration:** `body-map-interactivity.test.tsx` — simulate hover + click; assert event propagation.
- **Playwright:** `body-map-level-2.spec.ts` — load Nancy A; hover a mark; verify list row highlights; click a region; verify filter applied.

### Risks
- **SVG hit-target sizing.** Small dots may be hard to hover. → Larger invisible hit area around each dot.

### Rollback
- Code revert.

---

## Slice 14 — Hover tooltip with bounded image

**Type:** AFK  
**Blocked by:** Slice 13  
**References:** `project_identity_bearing_ui.md` (Hover tooltip)

### Scope
Shared `<EntityHoverTooltip>` component used on both body-map dots and list-row hovers. Bounded thumbnail (~100px), 300-400ms hover delay, one image only, text-only fallback.

### Implementation outline
1. New component: `<EntityHoverTooltip>` — accepts entity + optional media item; renders ~280×120px popover with thumbnail (left) + type/region/description (right).
2. Use existing `MediaItem.variants` for thumbnail URL; focal-crop using `focalX/focalY`.
3. Wire into `<BodyMap>` dots and `<BodyFeaturesCard>` rows.

### Acceptance criteria
- [ ] Tooltip appears after 300-400ms hover
- [ ] Bounded size; no layout reflow
- [ ] Image loaded from thumbnail variant; focal-cropped
- [ ] Text-only fallback when no photo linked
- [ ] One tooltip component used in both surfaces

### Verification
- **Integration:** `entity-hover-tooltip.test.tsx` — render with + without media; assert layout.
- **Playwright:** `body-map-hover-tooltip.spec.ts` — hover dot; assert tooltip with image appears.

### Risks
- **Tooltip flicker on rapid hover-out.** → Use established Radix Tooltip primitive with delay + close-on-hover-out animation.

### Rollback
- Code revert.

---

## Slice 15 — Hero type-presence chips

**Type:** AFK  
**Blocked by:** Slice 11  
**References:** `project_identity_bearing_ui.md` (Hero — type-presence chips)

### Scope
Replace today's per-mark hero chips with type-presence chips driven by a new `PersonCurrentState.presentBodyFeatureTypes String[]` array.

### Implementation outline
1. Schema migration: add `presentBodyFeatureTypes String[] @default([])` to `PersonCurrentState`; GIN index.
2. Update `app_recompute_person_current_state()` to populate the array based on present (non-removed) body marks + modifications.
3. Backfill: `app_recompute_person_current_state(NULL)`.
4. Hero rendering: replace per-mark chip loop with type-chip loop sourced from the array. Text-only pill, subtle accent, no count. Click chip → scroll to + filter Body Features.

### Acceptance criteria
- [ ] `presentBodyFeatureTypes` array populated correctly for every person (verified against entity tables)
- [ ] Hero shows one chip per type (e.g., one `Tattoo` chip regardless of count)
- [ ] Chips are text-only, subtle, no count
- [ ] Click chip filters the Body Features section
- [ ] When the last instance of a type is removed, the chip disappears on next recompute

### Verification
- **Unit:** `recompute-present-types.test.ts` — fixtures with various entity sets; assert correct array.
- **Integration:** `hero-type-chips.test.tsx` — fixture with multiple tattoos; assert one `Tattoo` chip rendered.
- **Playwright:** `hero-type-chips.spec.ts` — load Nancy A; assert chips for Tattoo + Scar; click Tattoo chip; verify Body Features filter applied.
- **Post-deploy:**
  ```sql
  -- Sanity: every person with ≥1 present tattoo has 'tattoo' in their array
  SELECT p.id FROM "Person" p
    JOIN "PersonCurrentState" pcs ON pcs."personId" = p.id
    WHERE EXISTS (SELECT 1 FROM "BodyMark" bm WHERE bm."personId" = p.id AND bm.type = 'tattoo' AND bm.status = 'present')
    AND NOT ('tattoo' = ANY(pcs."presentBodyFeatureTypes"));
  -- Should return 0 rows
  ```

### Risks
- **Recompute completeness.** Backfill must run for every person, not just touched ones.
- **Race with slice 17 (column drops).** The boolean cache columns (`hasTattoo` etc.) stay until slice 17; queries that still read them must be audited.

### Rollback
- Migration revert: drop the column. Hero falls back to per-mark chips temporarily.

---

## Slice 16 — Catalog data-quality cleanup batch

**Type:** HITL  
**Blocked by:** Slice 3  
**References:** `project_catalog_data_quality_cleanup.md` (items 1–7)

### Scope
The deferred cleanup pass: drop derived attributes (BMI, WHR); tighten text→single-select; resolve group hygiene + overlaps; fix typo; rename `Current X` labels.

### Implementation outline
1. Drop `BMI` and `Waist-to-Hip Ratio` from the catalog. Any existing deltas on these become orphaned — delete them (after backup).
2. Bind `Hair Color`, `Skin Tone` to `color_catalog` (change valueType to SINGLE_SELECT, allowedValues from color_catalog).
3. Tighten others to SINGLE_SELECT with curated vocabularies: `Handedness` (Left/Right/Ambidextrous), `Build` (Slim/Athletic/Curvy/Plus), `Breast Size` (cup vocabulary), `Undertone` (Warm/Cool/Neutral), `Complexion` (Oily/Dry/Combination/Normal), `Hair Texture` (Straight/Wavy/Curly/Coily), `Hair Length` (Short/Medium/Long/Very Long), `Face Shape` (Oval/Round/Square/Heart/Long), `Facial Hair` (None/Stubble/Beard/Mustache/Goatee), `Fitness Level` (Sedentary/Active/Athletic/Elite).
4. Resolve overlap: consolidate hair-attribute groups (move Hair Texture + Hair Length from Facial Features into Hair Features); pick one of `Bra Size` / `Breast Size` / `Bust/Chest` as canonical (recommend keeping `Breast Size` + `Bust/Chest`; drop `Bra Size`).
5. Fix typo: `Freckle Intesity` → `Freckle Intensity`.
6. UI rename: drop `Current ` prefix from hero "Physique" labels (`Current hair` → `Hair color`, `Current breasts` → `Breast size`).
7. Update `Measurements` (Core Physical, text) — consider deleting (duplicates Bust/Waist/Hips); or keep as a free-text alternative.

### Acceptance criteria
- [ ] BMI + WHR removed from catalog and any prior deltas deleted
- [ ] Color attrs bound to `color_catalog`
- [ ] Closed-vocabulary attrs tightened to SINGLE_SELECT with curated values
- [ ] Hair attrs consolidated in one group
- [ ] Typo fixed
- [ ] Hero labels updated

### Verification
- **Unit:** none specific; this is data-shape work.
- **Integration:** smoke test of attribute edit flow on a few tightened attrs.
- **Playwright:** `catalog-cleanup.spec.ts` — load settings catalog; assert BMI gone; assert Hair Color now SINGLE_SELECT with color_catalog values.
- **Manual:** HITL — user must approve specific vocabularies for each SINGLE_SELECT before they're seeded.
- **Post-deploy:** sample a few persons; verify their attribute values still display correctly (any orphans from vocabulary changes flagged for cleanup).

### Risks
- **Existing free-text values may not map cleanly** to the new closed vocabularies. → Pre-migration audit: list existing values per attribute; surface non-matches for manual mapping decision before applying.

### Rollback
- Restore from backup if vocabularies turn out wrong.

---

## Slice 17 — Schema contraction — drop all dead fields

**Type:** AFK (gated)  
**Blocked by:** ALL previous slices + ≥1 week prod soak  
**References:** ADR-0005, ADR-0007, `project_catalog_data_quality_cleanup.md` (items 8–9)

### Scope
Drop every field that was deprecated by earlier slices. Single atomic migration. Irreversible — only run after at least one week of clean prod operation.

### Implementation outline
1. Grep gate: confirm no code path reads any of:
   - `Person.eyeColor`, `Person.height`, `Person.ethnicity`
   - `CosmeticProcedure*`
   - `BodyMark.heroVisible`, `BodyMark.heroOrder`, same on `BodyModification`
   - `PersonCurrentState.hasTattoo`, `hasScar`, `hasPiercing`, `hasModification`, `hasProcedure`
2. Migration: drop columns, drop tables, drop enums in one transaction.
3. Update Prisma schema; regenerate client.
4. Final cache recompute (defensive).

### Acceptance criteria
- [ ] All dead columns/tables/enums dropped
- [ ] Prisma client regenerates without errors
- [ ] Full test suite passes
- [ ] App works in prod after deploy (24h soak)

### Verification
- **Grep audit before deploy**:
  ```
  grep -rn 'eyeColor\|\.height\b\|\.ethnicity\b' src/ --include='*.ts' --include='*.tsx' \
    | grep -v 'PhysicalAttributeDefinition\|attribute-definition\|prisma/schema\|migrations/'
  ```
  Should return no matches (or only allowed matches like seed data that's been updated).
- **Full Vitest + Playwright suite green.**
- **Post-deploy:** monitor errors for 24h; sample-check a few persons; revert if any orphan-field reads surface.

### Risks
- **Irreversible.** A missed code path that still reads a dropped column = production error. → Grep gate + soak time + ready rollback path.
- **Prisma client regeneration may break unrelated code** if shared models. → Run full suite locally before deploy.

### Rollback
- Restore from backup (only meaningful within a few hours; data accumulates).
- This is why the soak is critical — the longer you wait, the more painful any rollback.

---

## 18. Sign-off checklist

Before declaring Phase G+ complete:

- [ ] All 17 slices deployed
- [ ] ADRs 0005, 0006, 0007 marked "Implemented" with the actual deploy dates
- [ ] `docs/architecture.md` updated (services, components, routes, data flows)
- [ ] `docs/user-guide.md` updated for all user-visible changes
- [ ] `docs/data-model.md` updated to reflect schema changes
- [ ] `CONTEXT.md` glossary is accurate
- [ ] Stale Persona-related code paths confirmed removed (final sweep)
- [ ] Memory files in `~/.claude/projects/-home-josh-projects-pulseboard/memory/` updated with "landed" dates
- [ ] Final fold-parity test passes (TS vs SQL fold byte-identical on representative dataset)
- [ ] Sample of 5 prod persons spot-checked for visual + data correctness
- [ ] One full backup of both tenants taken as the "Phase G+ baseline" snapshot
