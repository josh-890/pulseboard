# Temporal Model Migration — Implementation Plan

> **Status: COMPLETE (2026-05-23).** All six phases A–F + all Phase-F
> follow-ups landed in prod across both tenants. This document is kept as a
> historical record of how the redesign happened. For the *current* model,
> read **`CONTEXT.md`** (glossary), **`docs/adr/0001`–`0004`** (design
> decisions), and **`docs/data-model.md`** (concept reference). For the
> active live state of routes, services, and components, read
> **`docs/architecture.md`**.

Implements the design agreed in the 2026-05-21 design review (rounds 1–2). Read
first: `CONTEXT.md` (glossary) and `docs/adr/0001`–`0004`.

## 0. Context

The persona/delta model is being rebuilt around one uniform shape: **every delta
is `(Era, target, value, own date)`**. This touches the schema, the fold, every
appearance data-entry path, the `/people` list, the person detail page, the
search/advanced-search service, the SQL views, the import pipeline, and the docs.

**Strategy: phased cutover, not dual-write.** Pulseboard is a single-container
personal tool with `scripts/db-backup.sh` and dev/prod separation — it can take a
short maintenance window per deploy. Each phase below is a self-contained,
independently-deployable unit that moves schema + data + readers + writers
*together* and leaves the app fully working. Zero-downtime dual-write would
double the code churn for no real benefit here.

**Phase order is chosen so the app never has a broken read path:**

| Phase | Delivers | Why this order |
|---|---|---|
| A | Rename `Persona`→`Era`, add `isDraft`, baseline becomes dateless | Pure rename + one isolated semantic change |
| B | `PersonCurrentState` cache table, drop the MV | Insulates search from physical storage *before* C changes it |
| C | `ScalarDelta` replaces `PersonaPhysical` | Cache table from B already shields search/list |
| D | Event logs replace `validFrom`/`validTo` | Independent of A–C; identity-bearing attrs |
| E | Projection hardening, plausibility, cleanup, table rename | Final tidy once all readers are on the new model |
| F | Era-linked participation (`SessionContribution.eraId`) | Independent feature; needs only Era (Phase A); sequenced last |

Every phase ends with the **verification protocol** in §11.

---

## 1. Target schema (end state)

### 1.1 `Era` (renamed from `Persona`)

```prisma
model Era {
  id         String   @id @default(cuid())
  personId   String
  person     Person   @relation(fields: [personId], references: [id])
  label      String
  notes      String?
  isBaseline Boolean  @default(false)
  isDraft    Boolean  @default(false)   // NEW — un-named auto-created / unreviewed era
  // `date` = a loose anchor only (see ADR-0001). Used for ordering when members
  // are undated. The BASELINE era is always dateless (date = null) — it is
  // folded first by virtue of isBaseline; see ADR-0001 amendment.
  date          DateTime?
  datePrecision DatePrecision @default(UNKNOWN)
  dateModifier  DateModifier  @default(EXACT)
  dateSource    String?
  createdAt  DateTime @default(now())

  scalarDeltas            ScalarDelta[]
  bodyMarkEvents          BodyMarkEvent[]
  bodyModificationEvents  BodyModificationEvent[]
  cosmeticProcedureEvents CosmeticProcedureEvent[]
  skillEvents             PersonSkillEvent[]
  digitalIdentityEvents   DigitalIdentityEvent[]
  interestEvents          InterestEvent[]
  mediaLinks              PersonMediaLink[]
  contributions           SessionContribution[]   // Phase F

  @@index([personId])
  // Phase A keeps @@map("Persona"); Phase E does the physical table rename.
}
```

### 1.2 `ScalarDelta` (replaces `PersonaPhysical` + `PersonaPhysicalAttribute`)

```prisma
model ScalarDelta {
  id                    String  @id @default(cuid())
  eraId                 String
  era                   Era     @relation(fields: [eraId], references: [id])
  attributeDefinitionId String
  attributeDefinition   PhysicalAttributeDefinition @relation(fields: [attributeDefinitionId], references: [id])
  value                 String
  date                  DateTime?
  datePrecision         DatePrecision @default(UNKNOWN)
  dateModifier          DateModifier  @default(EXACT)
  dateSource            String?
  notes                 String?       // holds raw import provenance, e.g. "import: 'enlarged or fake'"
  createdAt             DateTime @default(now())

  @@index([eraId])
  @@index([attributeDefinitionId])
  @@index([date])
}
```

No `@@unique([eraId, attributeDefinitionId])` — the same attribute may change
more than once within one era.

### 1.3 `DigitalIdentityEvent`, `InterestEvent` (new event logs)

Mirror the `BodyMarkEvent` shape — parent FK, `eraId`, `eventType`
(`added`/`modified`/`removed`), own `date`/`datePrecision`/`dateModifier`,
`notes`, and nullable property-override fields for the parent's mutable columns.

### 1.4 `PersonCurrentState` (cache table, replaces `mv_person_current_state`)

One row per person, **query-shaped** — it must carry every column the search
service and `v_person_list` read today, so they keep working unchanged:

```prisma
model PersonCurrentState {
  personId           String  @id
  person             Person  @relation(fields: [personId], references: [id])
  currentHairColor   String?
  currentWeight      Float?
  currentBuild       String?
  eyeColor           String?
  currentAttributes  Json    @default("{}")        // folded slug→value
  attributeStatuses  Json    @default("{}")        // folded slug→NATURAL|ENHANCED|RESTORED (derived from procedures)
  hasTattoo          Boolean @default(false)
  hasScar            Boolean @default(false)
  hasPiercing        Boolean @default(false)
  hasModification    Boolean @default(false)
  hasProcedure       Boolean @default(false)
  tattooRegions       String[] @default([])
  scarRegions         String[] @default([])
  piercingRegions     String[] @default([])
  modificationRegions String[] @default([])
  procedureRegions    String[] @default([])
  // hair/eye/skin classification columns (hairHue, hairLightness,
  // hairLightnessRank, eyeHue…, skinTone…) — populated via the existing
  // lookup_* SQL functions in the recompute's raw upsert.
  updatedAt          DateTime @updatedAt
}
```
`attributeStatuses` is **new** — it makes the derived **Attribute status**
(NATURAL / ENHANCED / RESTORED, see CONTEXT.md) queryable, which powers searches
like "only natural breasts" (§10). Indexes: recreate every index from
`mv_person_current_state` (GIN on the region arrays + `currentAttributes`, btree
on the classification columns, presence booleans), plus a GIN index on
`attributeStatuses`. The classification columns stay catalog-driven — the
recompute writes the row with a raw SQL upsert that wraps colour values in
`lookup_hair_hue(…)` etc., so colour logic remains in one place.

### 1.5 `SessionContribution.eraId` — Era-linked participation (Phase F)

```prisma
model SessionContribution {
  // … existing fields …
  eraId String?
  era   Era?    @relation(fields: [eraId], references: [id])
  @@index([eraId])
}
```
Optional FK to the Era the person was in at the time of the shoot. Source of
truth for participation↔era; `SetParticipant` is **not** touched (set pages
derive Eras through linked sessions). All of one person's multiple-role rows in a
session share the same `eraId` (UI-enforced).

### 1.6 Fields dropped

| Model | Dropped | Goes to |
|---|---|---|
| `Person` | `naturalHairColor`, `naturalBreastSize`, `bodyType`, `measurements` | `ScalarDelta` on the baseline Era |
| `Era` (baseline only) | meaningful `date` (`birthdate + 18` anchor) | nothing — baseline is dateless |
| `PersonaPhysical` | whole model | `ScalarDelta` |
| `PersonaPhysicalAttribute` | whole model | `ScalarDelta` |
| `PersonDigitalIdentity` | `validFrom(Precision)`, `validTo(Precision)` | `DigitalIdentityEvent` |
| `PersonInterest` | `validFrom(Precision)`, `validTo(Precision)` | `InterestEvent` |
| `PersonSkill` | `validFrom(Precision)`, `validTo(Precision)` | `PersonSkillEvent` (exists) |
| `PersonRelationship` | `validFrom(Precision)`, `validTo(Precision)` | `RelationshipEvent` (exists) |
| DB | `mv_person_current_state` (+ `refreshPersonCurrentState`) | `PersonCurrentState` table |
| `person-service.ts` | dead `computePersonCurrentState` | deleted |

**Not migrated into the catalog:** the legacy `PersonaPhysical.breastStatus`
("natural"/"enhanced") and `breastDescription` ("Large (Real)") do **not** become
catalog attributes. "Enhanced" is the derived **Attribute status** — it means a
`CosmeticProcedure` targets `breast_size` (see §4). The raw description text
lands in a delta's `notes`.

`Person` keeps: `birthdate*`, `eyeColor`, `height`, `sexAtBirth`, `birthPlace`,
`nationality`, `ethnicity`, `birthMarks`, career fields, `specialization`,
`status`, `rating`, `pgrade`, `notes`, `bio`, `tags`. `status` columns on
body-mark/modification/procedure/digital-identity are **kept** as projections.

---

## 2. Phase A — Rename `Persona`→`Era`, draft flag, dateless baseline

The rename is mechanical; the dateless-baseline change is one isolated, low-risk
semantic change. The DB table stays `Persona` via `@@map`.

1. Schema: rename model `Persona`→`Era` with `@@map("Persona")`; rename relation
   fields (`Person.personas`→`eras`, `*.persona`→`era`, `*.personaId`→`eraId` as
   relation-scalar — keep the **DB column** `personaId` via `@map("personaId")`
   to avoid a data migration here). Add `Era.isDraft Boolean @default(false)`.
2. Codebase rename (find-and-replace, ~20 files): `prisma.persona`→`prisma.era`,
   `findOrCreatePersonaForDate`→`findOrCreateEraForDate`, the `Persona` type,
   component prop/var names. `src/generated/prisma` is regenerated, not edited.
3. **Baseline becomes dateless.** Remove the `birthdate + 18` anchoring in
   `createPerson` — the baseline Era is created with `date = null`. **Delete** the
   `updatePerson` baseline-date re-anchor block. `buildBaselineLabel` returns a
   plain label (`"Baseline"` / `"${name} — initial"`), no "at 18".
4. Migration: `ALTER TABLE "Persona" ADD COLUMN "isDraft" …`, then
   `UPDATE "Persona" SET date = NULL, "datePrecision" = 'UNKNOWN' WHERE "isBaseline"`.
5. The fold already orders `isBaseline DESC, date NULLS FIRST`, so a null-dated
   baseline still sorts first; the `persona-before-baseline` plausibility rule's
   `baseline?.date` guard simply goes false (rule dormant) until Phase E reworks
   plausibility.

**Nothing breaks:** identifiers change; the baseline loses a synthetic date it
never should have had — it is still folded first by `isBaseline`. This also kills
the scar-recorded-before-18 false-conflict class.

---

## 3. Phase B — `PersonCurrentState` cache table (delivers ADR-0003)

Introduce the cache table **still folding the OLD model**, so the MV→table swap
is isolated from the storage change in Phase C.

1. Schema: add `PersonCurrentState` (§1.4) + all indexes.
2. New `src/lib/services/current-state-service.ts`:
   - `recomputePersonCurrentState(tx, personId)` — folds the person (Phase B: from
     `PersonaPhysical`/`BodyMark`/… exactly as the MV does today), then raw-SQL
     upserts the cache row (classification via `lookup_*`).
   - `rebuildAllCurrentState()` — full table rebuild (post-deploy + manual button).
   - `verifyCurrentStateIntegrity()` — recompute-and-compare, returns mismatches.
3. Wire `recomputePersonCurrentState` into **every** delta-mutating action's
   `$transaction` (the 24 in `appearance-actions.ts`, plus `createPerson` /
   `updatePerson`, digital-identity, skill, interest, relationship, import). Use a
   cascade-helper so call sites are one-liners.
4. Swap readers off the MV:
   - `person-search-service.ts` — `LEFT JOIN mv_person_current_state mv` →
     `LEFT JOIN "PersonCurrentState" mv` (alias kept `mv` to minimise diff).
   - `v_person_list` — unchanged for now (still reads `Person.naturalHairColor`/
     `bodyType`; those columns still exist until Phase C).
5. Drop `mv_person_current_state`, its indexes, and `refreshPersonCurrentState`;
   remove its call sites in `view-service.ts`, `database-maintenance-service.ts`,
   `color-catalog-actions.ts`, `person-search-service.ts`.
6. Settings: add a **"Rebuild current-state cache"** button and the
   **integrity-check** (manual + post-deploy, no timer) — see §7.
7. Post-deploy: run `rebuildAllCurrentState()` per tenant.

**Nothing breaks:** the fold is now one TS function and search reads a table
instead of an MV — same columns, same results. Underlying storage unchanged.

---

## 4. Phase C — `ScalarDelta` replaces `PersonaPhysical`

The largest phase. The Phase B cache table already shields search/list from
physical storage, so this phase only rewrites the *fold internals* and the
*scalar write paths*.

### 4.1 Schema & catalog
1. Seed `PhysicalAttributeDefinition` rows for the legacy scalars that **survive**:
   `hair_color` (SINGLE_SELECT → `color_catalog`), `weight` (NUMERIC, kg),
   `build` (SINGLE_SELECT), `breast_size` (SINGLE_SELECT with ordered cup letters;
   ORDINAL later if cup-range filtering is wanted), `measurements` (TEXT). Stable
   slugs — the fold and search key on them.
   **Not seeded:** `breast_status` — "natural/enhanced" is the derived
   **Attribute status** (a `CosmeticProcedure` targeting `breast_size`), never a
   stored attribute. `breast_description` — dropped; raw text → delta `notes`.
2. Add `ScalarDelta` (§1.2).

### 4.2 Data migration (per tenant, in the migration or a `tsx` script)
- Each `PersonaPhysical` non-null legacy field → one `ScalarDelta`
  (`weight`, `currentHairColor`→`hair_color`, `build`, `breastSize`→`breast_size`),
  carrying the `PersonaPhysical.date/precision/modifier`, `eraId = personaId`.
- Each `PersonaPhysicalAttribute` row → one `ScalarDelta` (date from its
  `PersonaPhysical`).
- **Breast status migration:** `PersonaPhysical.breastStatus = 'enhanced'` does
  **not** become a scalar delta — create a `CosmeticProcedure` (breast
  augmentation, `attributeDefinitionId`→`breast_size`) + an undated `performed`
  event with `valueAfter = breastSize`, in an "Imported — undated changes" draft
  Era for that person. `breastStatus = 'natural'` → nothing (Natural is the
  default). `breastDescription` → `notes` on the `breast_size` delta / procedure.
- `Person.naturalHairColor` / `naturalBreastSize` / `bodyType` / `measurements`
  (non-null) → `ScalarDelta` on that person's **baseline Era**.
- Verify counts before dropping anything.

### 4.3 Code
- `deriveCurrentState` — replace the `physicalChange` fold with a `ScalarDelta`
  fold: gather all deltas, sort by `date ?? era.date` (baseline first), "later
  wins per `attributeDefinitionId`". Keep `currentHairColor`/`currentWeight`/
  `currentBuild` populated (from the `hair_color`/`weight`/`build` slugs) so the
  cache columns and search keep working. Compute per-attribute **Attribute
  status** from procedures into `attributeStatuses`.
- `recomputePersonCurrentState` — fold `ScalarDelta` instead of `PersonaPhysical`;
  populate `attributeStatuses`.
- `getPersonWithDetails` — replace the `personas.physicalChange` include with
  `eras.scalarDeltas { include: attributeDefinition }`.
- Rewrite write paths: `recordPhysicalChangeAction`, `updatePhysicalChangeAction`,
  `createPersonaBatch` (the physical block), `createPerson` baseline block — all
  now create/update `ScalarDelta` rows. (`updatePerson`'s baseline re-anchor block
  was already deleted in Phase A.)
- **Appearance forms — kill the "natural vs current" duplication.**
  `edit-appearance-sheet.tsx` and the Add Person form's "Appearance" section
  (`person-form.tsx`) currently expose *both* "Natural Hair Color" *and*
  "Current Hair Color" as directly-editable inputs (the latter writes
  `PersonaPhysical.currentHairColor` on the baseline). Current state is the fold —
  never authored directly. Drop the "Current Hair Color" input; hair color is one
  `hair_color` attribute (baseline value = the natural one), changed thereafter
  via `recordPhysicalChange` / a new Era. Rework `updatePersonAppearance` +
  `updateAppearanceSchema` accordingly. Same treatment for `breastStatus`/
  `breastDescription` (see §4.1).
- `completeness-service.ts` — `naturalHairColor`/`currentHairColor` checks now
  read baseline vs folded `ScalarDelta`.
- Validations: `persona-physical.ts`, the physical block of `persona.ts` — accept
  `{ attributeDefinitionId, value, date, datePrecision }[]` uniformly.
- `v_person_list` — recreate: `naturalHairColor`/`bodyType` columns now sourced
  from `PersonCurrentState` (`currentHairColor`/`currentBuild`).
- Import: rewrite `import-executor.ts` physical path — **status-aware** (§10.1).
- `import/person-current/[personId]` API route — verify it reads via the fold.
4. Drop `PersonaPhysical`, `PersonaPhysicalAttribute`, and the four `Person`
   columns.
5. Post-deploy: `rebuildAllCurrentState()` per tenant.

**Nothing breaks:** search/list read the cache table (Phase B); the cache is
recomputed from `ScalarDelta`; the detail page folds `ScalarDelta` live.

---

## 5. Phase D — Event logs replace `validFrom`/`validTo`

1. Schema: add `DigitalIdentityEvent`, `InterestEvent` (§1.3).
2. Data migration (per tenant):
   - For each `PersonDigitalIdentity` / `PersonInterest`: `validFrom` → an
     `added` event; `validTo` → a `removed` event (era = the person's baseline
     if no better fit, carrying the original precision/modifier).
   - `PersonSkill`: `validFrom`→`PersonSkillEvent{ACQUIRED}`,
     `validTo`→`{RETIRED}` (only where not already represented).
   - `PersonRelationship`: `validFrom`→`RelationshipEvent{started}`,
     `validTo`→`{ended}`.
3. Code:
   - Fold (`deriveCurrentState`): "active digital identities / skills / interests
     / relationships" now derived from the last event by date, not `validTo`.
   - `digital-identity-service.ts` + `digital-identity-actions.ts`,
     `interest-service.ts` (+ its action — **verify the wiring**, no
     `interest-actions.ts` exists today), `skill-service.ts`, relationship code:
     CRUD now writes events. The UI keeps a from/to control that saves an
     `added` + `removed` pair (CONTEXT.md / ADR-0002).
   - `PersonDigitalIdentity.status` becomes an in-transaction projection.
4. Drop the eight `validFrom*`/`validTo*` columns across the four models.
5. Components: `digital-identity-section.tsx`, `digital-identity-row.tsx`,
   `person-skills-tab.tsx`, `edit-skill-sheet.tsx`, interests UI in
   `person-details-tab.tsx`, relationship UI in the Network tab.

**Nothing breaks:** intervals are reconstructable from the two-event log; the
from/to UI is preserved.

---

## 6. Phase E — Projection hardening, plausibility, cleanup

1. **[E1 — done 2026-05-23]** `status` projections: `BodyMark`/`BodyModification`/
   `CosmeticProcedure` `status` is recomputed in-transaction on every event
   mutation via the cascade-helper `recomputeBodyMarkStatus` /
   `recomputeBodyModificationStatus` / `recomputeCosmeticProcedureStatus`
   (`src/lib/services/cascade-helpers.ts`). `appearance-actions.ts` calls them
   at all 9 mutation sites. The integrity job from §7 covers it.
2. **[E2 — done 2026-05-23]** Plausibility rework (`plausibility-service.ts`):
   - **Dropped** `era-before-baseline`, `participation-before-baseline`,
     `possible-participation-before-baseline` — there is no baseline date any
     more.
   - **Added** `delta-before-birth` (any ScalarDelta dated before `birthdate`
     — hard warning).
   - **Added** `participation-before-birth` (hard warning, regardless of
     confidence) and `participation-before-active` (soft, confirmed/probable
     only).
   - Kept `era-before-birth`; grammar fixed.
   - `contribution-era-mismatch` landed in Phase F (§6.1); `overlapping-eras`
     landed as Phase-F cleanup on 2026-05-23 — ranges computed inline from
     each Era's deltas + anchor date.
3. **[E3 — done 2026-05-23]** Draft-era UX: `findOrCreateEraForDate` sets
   `isDraft: true` on auto-create. `updateEra` clears the flag on any edit.
   `era-timeline-entry.tsx` shows a dashed amber dot + amber "Draft" pill with
   tooltip for non-baseline draft eras.
4. **[E4 — done 2026-05-23]** Undated deltas: fold sort key documented in
   ADR-0001 § fold sort order. TS fold doc comment in `foldScalarDeltas`
   points to the ADR; SQL fold in
   `app_recompute_person_current_state` mirrors it (opposite literal sort
   direction, same outcome).
5. **[E5 — N/A]** Delete dead `computePersonCurrentState`. No such symbol
   remains — the only current-state entrypoints are
   `recomputePersonCurrentState` (in-tx) and `recomputePersonCurrentStateStandalone`.
6. **[E6 — done 2026-05-23]** Physical table rename `Persona`→`Era`: migration
   `20260523000002_rename_persona_to_era` renames the table, all 9 `personaId`
   columns + their FK constraints + indexes, recreates `v_person_body_events`,
   and rebuilds `app_recompute_person_current_state` against the new names.
   schema.prisma drops `@@map("Persona")` + the 9 `@map("personaId")`
   annotations. e2e cleanup-test-data + person-search-service raw SQL updated.
   80/80 e2e pass on dev.
7. **[E7 — done 2026-05-23]** `docs/data-model.md` rewritten as a concept
   reference deferring to `schema.prisma` for field-level truth.
   `docs/architecture.md` updated: ERD swap to Era/ScalarDelta/PersonCurrentState,
   service inventory swap (`persona-service` → `era-service` +
   `current-state-service`), MV section notes the cache-table replacement.
   `docs/user-guide.md` swap user-facing "persona timeline" / "persona dates"
   to "era timeline" / "era dates"; History panel description mentions the
   draft pill.

---

## 6.1 Phase F — Era-linked participation (independent feature) — DONE 2026-05-23

Delivers ADR-0004. Landed in commits and migration `20260523000003_contribution_era_link`.

1. **Schema** ✅ — `SessionContribution.eraId String?` + FK + index + `Era.contributions`
   back-relation. Migration `20260523000003_contribution_era_link` (additive).
2. **Data entry** ✅ — `add-contributor-sheet.tsx` gains an Era picker. Loads
   eras via the new `getPersonErasForPickerAction` when a person is selected.
   Defaults to the latest non-baseline Era with anchor date ≤ session date
   (falls back to baseline). `addSessionContribution` / `updateSessionContribution`
   accept `eraId` and propagate it across every contribution row for the same
   person in the session (multi-role consistency). Import leaves `eraId` null.
   No standalone contribution-edit UI exists yet; the action signature is ready.
3. **Read side** ✅ —
   - Session detail (`/sessions/[id]`): participant rows show an amber "Era"
     pill and an `at-shoot:` line with hair / weight / build from the
     `deriveAppearanceAtShoot(eras, asOf)` fold. `asOf` is computed inline per
     contribution: max(member-delta dates) within the linked Era, falling back
     to the session date for a baseline Era. New component
     `contribution-participant-row.tsx`.
   - Era timeline (History panel, Overview tab): each Era now lists the
     sessions filed into it via a chip row at the bottom of the card. Data
     comes from the new `getPersonEraContributions(personId)` service
     (separate query — nesting under `Era.contributions` blew Prisma's type
     recursion budget).
   - Set detail / Career tab reverse nav: **deferred** — value-density on
     session detail + History panel covers the common case; compilation Sets
     spanning multiple eras need a different UI shape.
4. **Plausibility** ✅ — new `contribution-era-mismatch` rule (info severity):
   flags contributions whose linked Era's member-date range doesn't cover the
   session date. PersonData.contributions gains optional `eraId`; PersonData.eras
   gains optional `id` for the range lookup. Baseline Eras always pass (they
   "contain" every date).

**Nothing breaks:** purely additive; `eraId` is optional and read-side only — a
contribution is not a delta and does not affect the fold.

**Follow-up TODOs — all closed 2026-05-23:**
- ~~Set-detail participant snapshot~~ ✅ — `getSetParticipantEraMap` joins
  through SetSession → SessionContribution and resolves each participant to a
  single Era when all linked contributions agree, or an "N eras" fallback
  pill when they don't (compilation sets). Rendered as a small amber line
  beneath the avatar age in `ParticipantAvatars`.
- ~~Contribution-edit UI~~ ✅ — Era pill on the session participant row is now
  a button that opens `EditContributionEraDialog` (commit `4609093`). Picker
  matches the Add flow; saves via `updateSessionContributionAction`.
- ~~`overlapping-eras` plausibility rule~~ ✅ — Info-severity rule flags pairs
  of non-baseline Eras whose member-date ranges intersect. Ranges computed
  inline from each Era's deltas + anchor date.

---

## 7. In-transaction recompute & the integrity job (ADR-0002 / 0003)

- **`recomputeEntityStatus(tx, kind, id)`** — recomputes one parent's `status`
  from its event log; called inside every event mutation's `$transaction`.
- **`recomputePersonCurrentState(tx, personId)`** — recomputes one person's cache
  row; called inside every delta mutation's `$transaction`.
- **Integrity check** (`database-maintenance-service.ts`, alongside the existing
  `findAndFix*` functions): recompute-and-compare for all persons + all
  status-bearing entities; report mismatches (a mismatch = a write-path bug).
  Exposed as a **Settings button** + run automatically **post-deploy**. No 24 h
  timer — the repo has no scheduler and all maintenance is manual; and since the
  recompute is in-transaction, drift is structurally impossible, so the check is
  a *bug detector*, not a repair cadence. If automation is wanted later, an
  external cron hitting a protected route is the path.

---

## 8. Data-entry path inventory — every write path

Each must end its `$transaction` with `recomputePersonCurrentState` (+
`recomputeEntityStatus` where an event changed).

| Path | File | Phase touched |
|---|---|---|
| Body mark create/update/delete + event ×3 | `appearance-actions.ts` (6 fns) | B (recompute), E (status) |
| Body modification ×6 | `appearance-actions.ts` | B, E |
| Cosmetic procedure ×6 | `appearance-actions.ts` | B, E |
| `recordPhysicalChangeAction`, `updatePhysicalChangeAction` | `appearance-actions.ts` | **C** (rewrite to `ScalarDelta`) |
| `createPersonaBatchAction`, `updatePersonaAction`, `deletePersonaAction` | `appearance-actions.ts` → `persona-service.ts` | A (rename), C (physical block) |
| `toggleEntityHeroVisibility` | `appearance-actions.ts` | B (recompute) |
| `findOrCreate(Era)ForDate`, `createPersonaBatch`, `deletePersona` | `persona-service.ts` | A, C, E (draft flag) |
| `createPerson` (baseline era; was: + baseline physical) | `person-service.ts` | A (dateless baseline), **C** (baseline `ScalarDelta`) |
| `updatePerson` (delete baseline re-anchor block) | `person-service.ts` | **A** |
| Digital identity CRUD | `digital-identity-actions.ts` / `-service.ts` | **D** |
| Interest CRUD | `interest-service.ts` (+ action — verify) | **D** |
| Skill / skill-event CRUD | `skill-actions.ts` / `skill-service.ts` | D (validFrom/validTo) |
| Relationship CRUD + events | (Network tab actions) | D |
| `SessionContribution` create/update (+ Era picker) | `contribution-actions.ts`, `add-contributor-sheet.tsx` | **F** (`eraId`) |
| Physical attribute catalog CRUD | `physical-attribute-catalog-actions.ts` | C (seed legacy defs) |
| Colour catalog `ensureCatalogEntry` | `color-catalog-service.ts` | C |
| Import pipeline (person, physical, marks, status-aware procedures) | `import/import-executor.ts` | A, **C** (§10.1) |

---

## 9. Route inventory — every route + verification

Use Playwright MCP per `CLAUDE.md`; rebuild matching `loading.tsx` skeletons.

| Route | Depends on | Verify |
|---|---|---|
| `/` dashboard | `mv_dashboard_stats` | Counts unaffected; confirm no persona/era count in the MV |
| `/people` | `v_person_list`, `searchPeople`, `PersonCurrentState` | Cards render; hair/build/age/counts correct |
| `/people` search + filters + facets | `person-search-service`, `PersonCurrentState` | §10 checklist |
| `/people/[id]` Overview | `deriveCurrentState`, plausibility | Folded hair/weight/build correct; Data Quality card |
| `/people/[id]` Appearance | `getPersonWithDetails`, era timeline | Eras render; body map; record-physical-change; draft-era nudges |
| `/people/[id]` Details | category groups, interests | Interests (Phase D); attribute galleries |
| `/people/[id]` Skills | `skill-service` | Skill timeline, events (Phase D) |
| `/people/[id]` Career / Network / Photos | relationships, media, era-grouped work | Relationships (D); work grouped by Era (F) |
| `/people/[id]` Aliases | `alias-service` | Unaffected — smoke only |
| `/sessions/[id]` | `SessionContribution`, fold `asOf` | Participant Era + appearance-at-shoot snapshot (F) |
| `/sets/[id]` | linked sessions' contributions | Per-session participant Eras (F) |
| `/settings` | physical-attribute / skill / media catalogs | Catalog CRUD; new "Rebuild cache" + integrity buttons |
| `/import` | `import-executor`, review workspace | Import a file end-to-end — see §10.1 |
| `/staging-sets` | staging pipeline | Promote a staging set; participant resolution |
| `/api/people/search` | `searchPeople` | JSON shape unchanged |
| `/api/import/person-current/[personId]` | fold | Returns current state post-migration |
| `/api/categories/[id]/media` | `PersonMediaLink` | Era-linked media still resolve |
| All `loading.tsx` | layout mirrors | Update `/people`, `/people/[id]`, `/sessions/[id]`, `/sets/[id]` skeletons if layout shifts |

---

## 9.1 UI fidelity contract — History panel & body-mark timeline

Two distinctive visuals are **preserved as-is** through the migration. Reference
screenshots (xpulse / Nancy A): `nancy-a-history-panel.png`,
`nancy-a-body-marks.png`.

- **History panel** (Overview tab — `person-detail-tabs.tsx` `HistoryPanel`,
  `persona-timeline-entry.tsx`): stays **one node per Era** — the vertical
  persona-flow, rendered 1:1. All migration changes to it are mechanical:
  - Phase A — `persona`→`era` prop/type rename; baseline node renders with **no
    year badge**, label "Baseline" (filled dot + emerald pill kept).
  - Phase C — the PHYSICAL CHANGES section iterates `era.scalarDeltas` (one pill
    per delta, `AttrName: value`) instead of one `PersonaPhysical`; the non-baseline
    Era badge shows the member-date **range** (one year when it collapses).
  - Phase D — the DIGITAL IDENTITIES section lists identity *events*.
- **Body-mark / modification / cosmetic-procedure horizontal timeline**
  (`entity-event-timeline.tsx` + `constants/body.ts`): **preserved verbatim** apart
  from the Phase A `persona`→`era` field rename. `BodyMark`/`BodyMarkEvent` keep
  their shape; dots/colours/connectors/terminal-marker/popover are unchanged.
- A **delta is labelled "Change"** in the UI (section header "Changes" / "N
  changes"; lines stay verb-style — "Tattoo added", "Hair → Blonde").

Verification: after Phases A/C/D, re-run the Nancy A flow on dev and diff against
the reference screenshots.

---

## 10. Search & advanced-search migration

The search service (`person-search-service.ts`) and `filter-spec.ts` are the most
exposed surface. Coverage checklist:

| Search feature | Today | After migration |
|---|---|---|
| Text (name / bio / notes) | `Person` + `PersonAlias` | Unchanged |
| `categorical: status / ethnicity / nationality / sexAtBirth / specialization` | `Person` columns | Unchanged |
| `categorical: bodyType` | `p."bodyType"` | → `PersonCurrentState.currentBuild`; "ever" mode → `ScalarDelta` join |
| `categorical: naturalHairColor` | `p."naturalHairColor"` | **Keep** — backed by the *baseline-Era* `hair_color` `ScalarDelta` (the import target — §10.1). Distinct from `hairHue`/`hairLightness` (= folded current) |
| `categorical: hairHue/Lightness, eyeHue/Lightness, skinTone/Undertone` | MV `lookup_*` cols | → same cols on `PersonCurrentState` |
| `range: height / rating / pgrade` | `Person` | Unchanged |
| `range: weight` | `mv."currentWeight"` | → `PersonCurrentState.currentWeight`; "ever" → `ScalarDelta` join |
| `range: age` | derived from `birthdate` | Unchanged |
| `presence: tattoo/scar/piercing/modification/procedure` | MV booleans | → `PersonCurrentState` booleans |
| **`presence: natural/enhanced` per attribute (e.g. "natural breasts")** | — *(new)* | `PersonCurrentState.attributeStatuses ->> 'breast_size'` — "natural breasts" = no procedure targets `breast_size`. New filter in `filter-spec.ts` + sidebar |
| `region` filters | MV GIN arrays | → `PersonCurrentState` GIN arrays |
| `attribute` (catalog) filters — `current` | MV `currentAttributes` jsonb | → `PersonCurrentState.currentAttributes` |
| `attribute` filters — `ever` | join `PersonaPhysical`+`PersonaPhysicalAttribute` | → join `Era`+`ScalarDelta` |
| `timeScope: ever` for hair | join `PersonaPhysical` + `color_catalog` | → join `Era`+`ScalarDelta`+`color_catalog` |
| Facet counts (sidebar) | MV-based group-bys | → `PersonCurrentState`-based |
| Saved searches (`SavedSearch.filterSpec`) | URL-param spec | Add to `LEGACY_KEY_RENAMES` in `filter-spec.ts` if any field key changes; the new natural/enhanced filter is additive |

Action items: in Phase B, repoint every `mv_person_current_state` reference in
`person-search-service.ts` to `"PersonCurrentState"`. In Phase C, rewrite the
`"ever"`-mode `EXISTS` subqueries (`buildCategoricalClauses`,
`buildRangeClauses`, `buildAttributeClauses`) from `Persona`+`PersonaPhysical`+
`PersonaPhysicalAttribute` to `Era`+`ScalarDelta`; update `CATEGORICAL_FIELDS` /
`RANGE_FIELDS` / `RawPersonRow` / the result mapping (`naturalHairColor`,
`bodyType`); add the natural/enhanced presence filter; verify `getFacetCounts`
and `getAttributeFacetsForDefinitions` against the new table.

---

## 10.1 Import workflow — every imported attribute keeps a distinct target

The import-file workflow (`import-executor.ts`, person path) fills a fixed set of
attributes. The migration **must not drop any of them** — each keeps a distinct,
named target. An import file is a *snapshot at import time*, so import-derived
attributes land on the **baseline Era**, which is marked **`isDraft = true`**
("imported, not yet human-reviewed") — the Data Quality card nudges review.

Import is **status-aware** — dumb about values it doesn't know (natural sizes),
faithful about facts it does know (a procedure exists):

| Import field (`ImportItem.data.*`) | Old target | New target |
|---|---|---|
| `icgId`, `name` | `Person.icgId`, common `PersonAlias` | unchanged |
| `birthdate`, `nationality`, `heightCm`, sexAtBirth | `Person` static cols | unchanged (static) |
| `activeFromYear`, `retiredYear` | `Person.activeFrom*` / `retiredAt*` + `status` | unchanged (career) |
| `biography`/`biographies`/`tattoos`/`activities` | `Person.bio` | unchanged — `tattoos` stays free-text in bio, **not** structured `BodyMark`s |
| `hairColor` | `Person.naturalHairColor` **and** baseline `PersonaPhysical.currentHairColor` | **baseline-Era `ScalarDelta`, slug `hair_color`** (natural/current duplication collapses to one delta) |
| `measurements` | `Person.measurements` | **baseline-Era `ScalarDelta`, slug `measurements`** |
| `breastDescription`/`measurements` → cup, **status = Natural** | `naturalBreastSize` + `PersonaPhysical.breast*` | **baseline-Era `ScalarDelta`, slug `breast_size`**; raw text → its `notes` |
| `breastDescription` → cup, **status = Enhanced** | as above | a **`CosmeticProcedure`** (breast augmentation → `breast_size`) + an **undated** `performed` event `valueAfter = cup`, in an "Imported — undated changes" **draft Era**. **No** baseline `breast_size` delta — the natural value is unknown. Raw text → the procedure's `notes` |
| DIGITAL_IDENTITY import item | `PersonDigitalIdentity` (+`validFrom/To`) | `PersonDigitalIdentity` + `DigitalIdentityEvent` (Phase D) |
| CO_MODEL import item | minimal `Person` | unchanged |

Result: a freshly imported enhanced person folds to "D – Enhanced" **correctly**
(the fold reads `breast_size` from the procedure's `valueAfter`); review is then
*additive* (add the natural value / date if ever known), not corrective.

Code changes:
- **Phase A**: import creates the dateless baseline Era; sets `baseline.isDraft`.
- **Phase C**: rewrite the `import-executor.ts` person path — `createPersonRecord`
  no longer takes `naturalHairColor`/`currentHairColor`; the executor creates
  baseline-Era `ScalarDelta`s (`hair_color`, `measurements`, `breast_size` when
  Natural) and, when status = Enhanced, the procedure + draft Era above. Drop the
  `additionalUpdates.measurements` / `naturalBreastSize` writes and the
  `PersonaPhysical` upsert block.
- **Phase D**: the DIGITAL_IDENTITY import path writes a `DigitalIdentityEvent`.
- The import **parser**, **review workspace**, and `ImportItem.data`/`editedData`
  JSON are **unchanged** — only the executor's entity-creation step changes.
- Verify the **matched-person / re-import path** (`ImportBatch.previousBatchId`).

Verification (Phase C & D): import a real file end-to-end on dev; assert the new
person's baseline Era carries the expected `ScalarDelta` rows, an enhanced person
gets a procedure + draft Era and folds to "Enhanced", `baseline.isDraft` is set;
re-import an updated file for the same `icgId` and confirm no data loss.

---

## 11. Per-phase verification protocol

Run after every phase, before deploy (the user's standing rule — run *all* tests):

1. `npx prisma generate` → `rm -rf .next` → restart dev server.
2. `npx tsc --noEmit` — zero errors; **no `any`**.
3. `npx eslint` on every modified file.
4. `npx vitest run` — unit tests (extend coverage for the fold + recompute).
5. `npx playwright test` — e2e.
6. Playwright MCP smoke of the §9 routes affected by the phase.
7. Data-integrity SQL: row-count parity before/after each backfill; for B & C,
   assert `deriveCurrentState` == `PersonCurrentState` for a sample of persons.
8. Deploy: `scripts/deploy-migrations.sh` (iterates all tenants); run the
   per-tenant backfill / `rebuildAllCurrentState()`; then the prod smoke.

New automated tests to add: fold correctness (baseline-first + ordered deltas;
re-dating; removed events excluded; modified-event property overrides; dateless
baseline; procedure-derived Attribute status); `recomputePersonCurrentState`
parity; search clause builders for both `timeScope`s; the appearance-at-shoot
`asOf` fold (Phase F).

---

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Backfill loses data (PersonaPhysical→ScalarDelta, intervals→events, enhanced→procedure) | Row-count assertions; `db-backup.sh` before each prod migration; backfill idempotent and verified on dev first |
| A write path forgets `recomputePersonCurrentState` → stale cache | Funnel through cascade-helpers; the integrity job flags it (ADR-0003) |
| Search regressions (many filter combinations) | §10 checklist exercised via Playwright; facet-count parity test pre/post |
| Saved searches break on field-key change | `LEGACY_KEY_RENAMES` remap (precedent already in `filter-spec.ts`) |
| MVs/views only `CREATE` once (per memory) — won't auto-update | Migrations explicitly `DROP … IF EXISTS` then recreate `v_person_list`; `mv_person_current_state` dropped outright |
| Turbopack caches stale Prisma client / action IDs after schema change | `rm -rf .next` + dev-server restart in the §11 protocol |
| Phase C is large | Cache table (Phase B) already isolates search/list; detail page is the only live folder |
| Colour classification drift (`lookup_*`) | Recompute writes classification via the same SQL functions — single source |
| Enhanced-import auto-procedure surprises the user | The draft Era + `baseline.isDraft` + Data Quality nudge make it visible and reviewable |

---

## Open decisions

All resolved (design-review rounds 1–2, 2026-05-21):

1. `naturalHairColor` search facet — **keep**, backed by the baseline-Era
   `hair_color` `ScalarDelta` (also the import target, §10.1).
2. Integrity-job scheduling — manual Settings button + post-deploy run, no timer.
3. `Era.date` field name — keep `date`; the **baseline** is dateless.
4. Baseline date — **dateless** ("time zero"); the `birthdate + 18` anchor is
   removed (ADR-0001 amendment).
5. Import vs baseline — import → baseline `ScalarDelta`s + `baseline.isDraft`;
   status-aware (Enhanced → procedure in a draft Era).
6. Breast columns — only `breast_size` survives as a catalog attribute; status is
   derived; description → `notes`.
7. Era-linked participation — `SessionContribution.eraId`, manual pick, appearance
   -at-shoot via `asOf` = linked Era (ADR-0004).
