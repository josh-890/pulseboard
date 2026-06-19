# Per-attribute change-kind drives attribute status (Augmentation / Reduction / Reversal)

Decided 2026-06-19 (design review, /grill-with-docs). Implemented same day.
Refines ADR-0007.

## Context

ADR-0007 derived `AttributeStatus` (NATURAL / ENHANCED / RESTORED) from a single
`DeltaCause` enum (NATURAL / SURGICAL / OTHER) on each `ScalarDelta`, and the
record/edit sheets exposed one **change-set-level** "Cause" picker. Two problems
surfaced in use:

1. **Lossy vocabulary.** A surgical breast *reduction* is `cause = SURGICAL`,
   which derived **ENHANCED** — wrong. "Enhanced" conflated *provenance* (it was
   surgical) with *direction* (it got bigger). ADR-0007 had reserved this:
   *"Add categories when real use cases appear."* Reduction is that case.

2. **Wrong granularity.** The Cause picker sat between the date radio and the
   attribute fields, reading as a property of the whole change-set, and
   `replaceEraScalarDeltas` wrote the one picked cause onto **every** delta in the
   set — so a hair+breast change tagged "Surgical" dirtied the hair delta too. But
   the thing cause feeds (`AttributeStatus`) is intrinsically **per-attribute**
   (breasts can be augmented; hair cannot). W3C PROV, CQRS (semantics-on-event),
   and EMR practice all put the semantic classification on the specific change, not
   the change-set — which is where the schema already stored it (`ScalarDelta.cause`
   is per-row). ADR-0007's amendment had flagged the global picker as a *"bridge
   model"* pending a *"Slice 7 per-row cause"* redesign that was deferred and never
   shipped. This completes it.

Best-in-class comparison: adult performer databases (Boobpedia, Babepedia) model a
current-state authenticity flag, essentially Natural vs Augmented — they don't
track reductions as a status. Plastic-surgery/EMR records use an explicit procedure
taxonomy (augmentation / reduction / mastopexy / reconstruction / explant). We take
the EMR-style *directional* approach because the user wants to author intent
explicitly, but keep it lightweight (no separate procedure entity — that was deleted
in ADR-0007).

## Decision

**Change-kind is a per-attribute property of status-bearing changes, authored
inline.** For breast size the vocabulary is **Natural / Augmentation / Reduction /
Reversal / Other**, deriving status 1:1.

### Schema

- Extend `DeltaCause` with `AUGMENTATION`, `REDUCTION`, `REVERSAL`. The field stays
  named `cause` (no rename churn); the UI labels it "Kind". `SURGICAL` is retained
  for `BodyMarkEvent`/`BodyModificationEvent` and as a legacy scalar fallback.
- `AttributeStatus` gains `REDUCED` → `NATURAL | ENHANCED | REDUCED | RESTORED`.
- Migration `20260619100000` adds the enum values in its own transaction (Postgres
  forbids using a new enum value in the txn that adds it); `20260619100100` backfills
  `SURGICAL → AUGMENTATION` on scalar deltas (every existing surgical scalar was a
  breast augmentation) and reissues `app_recompute_person_current_state`.

### Derivation (TS fold + SQL fold, kept in lockstep)

Keyed on the winning delta's kind:
`AUGMENTATION | SURGICAL → ENHANCED`; `REDUCTION → REDUCED`; `REVERSAL → RESTORED`;
else a surgical kind in history overridden by a natural delta → `RESTORED`;
`NATURAL | OTHER | none → NATURAL`. The single source of truth is
`attributeStatusFromCause()` in `person-service.ts`, mirrored by the SQL `CASE`.

### Authoring

The global Cause picker is removed from the record/edit sheets. An inline **Kind**
select sits under the Breast Size field, shown only when breast_size is flagged
`statusBearing`. The kind applies **only to that delta** — `cause` is now per-item
in `replaceEraScalarDeltas`, never bled onto unrelated attributes. The Undated
drawer's per-delta inline editor already authored per-delta cause; it just adopts
the new vocabulary. Future status-bearing extensible attrs ride on
`attributes[].cause`.

### Display / search

Progression renders `B (Natural) → D (Enhanced)`, `D (Natural) → B (Reduced)`,
`D (Enhanced) → B (Restored)` — the current pill takes the derived word, baseline
pill is always "Natural". Labels + tints centralised in `ATTRIBUTE_STATUS_DISPLAY`
(constants/appearance). People search gains a `Reduced` status option.

## Why

- **Resolves the reduction bug and the cause-bleed in one change** — they were the
  same root cause (semantics on the change-set instead of the change).
- **Authoritative, not inferred.** The user states the kind; the system doesn't
  guess direction from cup ordering.
- **Minimal.** No procedure entity, no field rename; one enum extension + one
  derivation function reused by both folds.

## Considered and rejected

- **Infer direction from the cup change** (compare new value to prior via the ordered
  cup list). No new vocab, but can't express same-size procedures (a lift), and leans
  on cup ordering. Rejected: authored intent is clearer and generalises.
- **Binary "altered" flag** (adult-DB convention: Natural vs Altered). Simplest, but
  drops the Enhanced/Reduced wording the user wants.
- **Two fields** (provenance + kind). More faithful to CQRS but more UI/build for a
  single status-bearing attribute today. The single `cause`/kind field suffices.
- **Rename `cause` → `kind`.** Pure churn across ~12 sites for no behavioural gain.

## Consequences

- Two derivation engines (TS `attributeStatusFromCause`, SQL `CASE`) must stay in
  lockstep — change both together.
- `breastStatus` (the derived display string in `PersonCurrentState`) now emits
  `enhanced | reduced | restored | natural` (was only `enhanced | natural`).
- Import maps `enhanced/fake` → `AUGMENTATION`; reductions are not importable (no
  source vocabulary distinguishes them).
- After deploy: recompute every `PersonCurrentState` (migration `20260619100100`
  does this) and confirm no `ScalarDelta.cause = 'SURGICAL'` rows remain.
