# Drop CosmeticProcedure; cause-on-delta drives Natural/Enhanced/Restored status

Decided 2026-05-24 (design review, /grill-with-docs — not yet implemented).

## Context

`CosmeticProcedure` and `CosmeticProcedureEvent` were modelled as a top-level identity-bearing entity in their own right — a persistent record with a lifecycle event log (`performed/revised/reversed`), an optional `attributeDefinitionId` linking to the scalar attribute the procedure modified, observation fields (`valueBefore` / `valueAfter` / `unit`), provider info, and a "Cosmetic Procedures" card on every person's Appearance tab.

Two related observations exposed this as over-modelling:

1. **The same real-world event lives in two places.** A breast augmentation is *both* a `CosmeticProcedureEvent` (procedure) and a `ScalarDelta` (the resulting value change). ADR-0002 explicitly warned against this kind of dual-tracking.
2. **The user's actual usage is narrow.** During the /grill-with-docs session, the user confirmed: no recording of provider info, no separate tracking of revisions/reversals beyond the value change itself, no observation fields used independently of the resulting scalar value, and no procedures in the real data that *don't* target a scalar attribute.

The structured procedure entity wasn't earning its place. It cost a card, a concept in Settings, an authoring sheet, and the dual-tracking risk — in exchange for metadata the user never fills.

## Decision

**Drop `CosmeticProcedure` and `CosmeticProcedureEvent` entirely.** Replace the structured procedure record with a single `cause` enum field on the `ScalarDelta` and on identity-bearing entity events.

### Schema

- Drop tables: `CosmeticProcedure`, `CosmeticProcedureEvent`
- Drop enum: `CosmeticProcedureEventType`
- Drop column: `PersonMediaLink.cosmeticProcedureId`
- Add column: `PersonMediaLink.scalarDeltaId` (nullable) — so per-delta photos can still be attached
- Add enum: `DeltaCause { NATURAL, SURGICAL, OTHER }` (start minimal; extend only when a real need appears)
- Add column to `ScalarDelta`: `cause DeltaCause @default(NATURAL)`
- Add column to `BodyMarkEvent`, `BodyModificationEvent`: `cause DeltaCause @default(NATURAL)` — for symmetry (a surgical scar; a laser-removed tattoo)

### Status derivation (replaces the old "procedure-targets-it" rule)

Computed per attribute, by the same fold that produces the current value (ADR-0001):

- `NATURAL` — no delta with `cause = SURGICAL` exists in this attribute's history.
- `ENHANCED` — the winning delta of the fold has `cause = SURGICAL`.
- `RESTORED` — there is a SURGICAL delta in history, but a later non-SURGICAL delta has overridden it (e.g. implant removal).

Same three-state vocabulary as today — just derived from `cause` instead of from procedure record presence. `CONTEXT.md` and ADR-0005 stay coherent.

The status is **cached** in `PersonCurrentState.attributeStatuses` (the JSON column was already added in the schema for this purpose), recomputed in the same transaction as the fold (ADR-0003). A GIN index supports filter queries like "all persons with `breast_size` status = `NATURAL`".

### Hero / grid display

- `NATURAL` (default for ~95% of attributes): plain value, no badge.
- `ENHANCED` / `RESTORED`: progression rendering — `B (Natural) → D (Enhanced)`. Each value pill carries its own cause label. Reads naturally for any number of state changes (`B (Natural) → D (Enhanced) → B (Restored)`).
- Same pattern in the Appearance-grid `VOLATILE` primitive (sequence-of-pills) — status labels join the existing per-pill rendering for free.

### Authoring flow

The record-a-change sheet gains one optional field: **Cause** (default `NATURAL`). For breast augmentation, the user picks `SURGICAL`. Provider/technique notes go into the existing `notes` field — no separate provider column. Before/after observation values are unnecessary: the delta IS the after-value; the before is the prior fold winner.

### Filtering

The People search sidebar gains a status sub-filter on any attribute filter that targets a status-bearing attribute (e.g. `Breast size: B [Natural ▾]`). Backed by the GIN index on `PersonCurrentState.attributeStatuses`.

### Migration

- Each `CosmeticProcedureEvent` becomes a `ScalarDelta` with `cause = SURGICAL` (using `valueAfter` as the new delta value, provider/description → `notes`, original date preserved).
- Photos previously linked via `PersonMediaLink.cosmeticProcedureId` re-target to the corresponding new `ScalarDelta` via the new `scalarDeltaId` column.
- Procedures that didn't target a scalar (the user reports none, but if any exist in seed data) become a `BodyMark` of type `other` with `cause = SURGICAL` and the description preserved.

## Why

- **Eliminates dual-tracking** of the same real-world event. ADR-0002 already established this is the right direction.
- **One authoring surface, one fold path.** The user records a change; the cause flag carries the "why"; the fold + cache derives the status.
- **Matches the user's mental model exactly** — they described the breast augmentation case as "B → D" with an enhancement label, not as "a procedure that produced a value change".
- **`ENHANCED` / `RESTORED` semantics are preserved** with the same vocabulary and the same query shape — no functional regression, just simpler plumbing.
- **Searchable.** The `attributeStatuses` cache column was already in the schema for this; the GIN index makes the user's stated filter ("all persons with natural breast status") cheap.

## Considered and rejected

- **Option B — Demote `CosmeticProcedure` to an inline annotation on the delta.** Keeps the structured metadata (provider, observation values, revisions) at low marginal cost but doesn't simplify the model. Rejected after the user confirmed none of the structured fields are used in practice.
- **Option C — Keep current; just unify the three cards.** Reintroduces the dual-tracking smell ADR-0002 warned against.
- **Carrying a richer `cause` enum from day one** (`TRAINING`, `INJURY`, `MEDICAL`, `WEIGHT_CHANGE`, …). Speculative; only `SURGICAL` is needed today. Add categories when real use cases appear.

## Consequences

- A migration is required to lift `CosmeticProcedureEvent` rows into `ScalarDelta` rows and re-target the photo links. Run as a single transaction; verify counts; drop old tables only after the migration is confirmed.
- The fold (`foldScalarDeltas` in TS, `app_recompute_person_current_state` in SQL — see ADR-0001 § fold sort order) must compute `attributeStatuses` per attribute alongside the value, and write both into `PersonCurrentState`.
- The Appearance tab loses the standalone "Cosmetic Procedures" card (already accepted as part of the unified Body Features surface).
- The Settings catalog loses the cosmetic-procedure-type registry (any free-text values move to `notes`).
- The import workflow's procedure-handling path needs to convert `enhanced or fake` breast status into a `cause = SURGICAL` delta (replacing the previous procedure-record creation).
- `CONTEXT.md`'s "Attribute status" entry needs revising to reference cause-on-delta instead of procedure-targets-attribute.
