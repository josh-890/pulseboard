# Unified scalar storage; static-vs-changing is a policy on the attribute definition

Decided 2026-05-23 (design review, /grill-with-docs — not yet implemented).

## Context

Person attributes were modelled in two structurally different places: truly-static fields lived as typed columns on `Person` (date of birth, height, eye color), while changing attributes lived as `ScalarDelta` rows under an Era in the catalog-driven system. The boundary was implicit in the schema and required a hand-written migration to move an attribute between the two.

In practice this created two problems:

1. Attributes like `eyeColor` that *could* change (contacts, surgery, aging) had no home for that change other than a hand-written schema migration.
2. The user has stated that they "don't know exactly which features I want to track in future" — which makes any schema-locked classification of static-vs-changing a future migration trap.

A live inspection of the xpulse attribute catalog (`/settings/catalogs/attributes`) during the design session confirmed that the mutability spectrum is real and continuous, but clusters cleanly into three groups: never-changes (Handedness, Brushfield Spots), rarely-changes (Build, Inseam, Hair Pattern) and volatile (Weight, Hair Color, Roots Showing).

## Decision

Static-ness is a **policy on the attribute definition**, not a storage location. **Every catalog-driven attribute lives in the same storage path** — a `ScalarDelta` stream under one or more Eras. Truly-static values are simply a stream of length 1 at Baseline. `PhysicalAttributeDefinition` gains a `mutability` enum with three levels:

| Level | UI default | Validation |
|---|---|---|
| `ALWAYS_STATIC` | Inline edit only — no record-a-change affordance | Soft warning if a second non-baseline delta is filed |
| `RARELY_CHANGES` | Inline edit *plus* record-a-change in a secondary menu | None |
| `VOLATILE` | Record-a-change is the primary affordance; current value + trend shown alongside | None |

The mapping `policy → UI affordance` is **deterministic** — there is no per-attribute affordance override. Reclassification (e.g. `RARELY_CHANGES → VOLATILE`) changes future authoring behaviour immediately and **never** touches stored history.

The only fields exempt are **core identity fields on `Person`** — values structurally wired into the rest of the system (date of birth, used by `compute_age_at` and as the fold's temporal floor; system identifiers). These are not catalog attributes; they live as typed columns. `Person.eyeColor` and `Person.height` are slated to migrate off `Person` into the catalog.

## Why

- **Future-proofs the catalog.** A "rarely-changing" attribute that turns out to need history later is a Settings-only reclassification, not a data migration.
- **One fold path, one cache projection, one query shape.** Consistent with ADR-0002's removal of dual-tracking for the same reason — this ADR refuses to re-introduce the same kind of redundancy.
- **UX affordances still match attribute character** — they're derived from the policy without paying the storage-split cost.
- **The trade-off is honest.** A storage split would give a hard schema-level guarantee that "you cannot record a second eye-color value" — this ADR gives a soft warning instead. The user has consistently preferred soft warnings + reversibility over hard schema invariants.

## Considered and rejected

- **Two storage paths, configurable per attribute (static columns on `Person` vs `ScalarDelta`).** Gives a hard "can't add a second value" guarantee, but pays with: a structural classification baked into the schema; a data migration every time an attribute is reclassified; two read paths to stitch into `PersonCurrentState`; and continued drift potential between the two homes. The safety cost was judged not worth the flexibility cost.
- **Single boolean (`isStatic` true/false), no three-way.** Loses the UX distinction between `RARELY_CHANGES` and `VOLATILE`. The live catalog shows the three-level spectrum is real (Handedness vs Build vs Weight cluster differently); two levels would force one bad UI default for one of those clusters.
- **Five+ levels.** No real signal in the live catalog supports finer gradation; the additional levels would be subjective.

## Consequences

- A migration is required to move `Person.eyeColor` and `Person.height` into `PhysicalAttributeDefinition` + `ScalarDelta`, and to drop the columns from `Person`. Existing values become Baseline deltas.
- `PhysicalAttributeDefinition` gains a `mutability` enum column with default `RARELY_CHANGES` (the safe middle).
- `record-physical-change-sheet.tsx` and the catalog manager UI (`/settings/catalogs/attributes`) need updating to expose and use the policy.
- The data-quality cleanup (BMI / Waist-to-Hip Ratio removal; text→single-select tightening; group hygiene) is tracked separately and is a good co-deploy partner with this change.
