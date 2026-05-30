# Re-import is a review-driven merge; no silent updates to existing persons

Decided 2026-05-30 (design review, /grill-with-docs — not yet implemented).

## Context

The import workflow ingests person-data files from external sources. Today,
when a file contains a person whose ICG-ID already exists in the database
(an exact `matchConfidence=1.0` match), `importPerson()` in
`src/lib/services/import/import-executor.ts` early-returns success without
writing any data — re-imports are effectively no-ops.

That's safe (manual curation can't be silently clobbered) but it means
re-imports can never *update* an existing person. In practice the user
wants re-imports to flow new information through:

- Persons remain active; the source publishes new measurements, hair-colour
  changes, new aliases, new set credits over time.
- Some re-imports fill gaps in the existing record (a field that was
  empty in the first import has a value now).
- Some re-imports correct prior errors (a misspelled name, a wrong
  nationality code).
- Even "inactive" persons can have a new set show up if they return to
  work.

The user's hard constraint: **no accidental loss of existing data, ever.**
Manual curation is precious; verified-unknown is a deliberate choice;
removed aliases stay removed. The user is willing to spend the time
reviewing changes piece-by-piece in exchange for that guarantee.

## Decision

**A re-import is a review-driven merge.** Every non-identical delta
between the import file and the existing person becomes an explicit
per-item Accept/Decline decision. Nothing writes to the existing
person's record without a user click.

### Principle: absence is information

If a field is empty in the DB, that might be deliberate (the user
cleared it). If an alias isn't there, the user may have manually
removed it. **Empty is not the same as "not yet recorded".** Therefore
the review surfaces *every* delta — including pure additions and
fill-gap cases — not just true conflicts.

### Workflow shape

A re-import is triggered the same way as a first-time import — the user
uploads a file. The system distinguishes by matcher result:

- `matchConfidence = 1.0` (exact ICG-ID match) → new
  `ImportItemStatus = PENDING_ATTRIBUTE_REVIEW`. The "Import" button
  is gated until all decisions are made.
- Any other match state → today's behaviour (refuse fuzzy match, or
  create a new person).

The review screen is per-person (the import workflow is per-person by
construction). Each non-identical delta renders as a decision card with:

- Attribute / relation identity.
- Current DB value + provenance (manual edit timestamp, prior import,
  verified-unknown flag).
- Import file's proposed value.
- Tombstone / decline-log context when relevant.
- Two-button Accept / Decline (no default selection — explicit click
  required).
- For accepted scalar-attribute deltas: a 3-way intent picker mirroring
  the record-physical-change-sheet (`on-date` / `dateless` / `baseline`).

### Carve-out: sets

Sets bypass the per-item review and auto-flow into the existing
`StagingSet` queue, keyed by external-set-id. Reasons:

- External-set-id makes "same set" unambiguous.
- Set volumes are high (a person can accumulate hundreds across imports).
- The staging-set workflow *is* the review queue for sets.

### Storage of pending decisions

In-flight decisions live in a new `ImportItem.decisions JSON?` column —
separate from `editedData` (which keeps its existing role for raw user
edits to source values).

Persistent decision memory uses two new tables:

```
ImportDeclineLog { personId, itemType, itemKey, declinedAt, batchId? }
ItemDeletionTombstone { personId, itemType, itemKey, deletedAt, deletedBy? }
```

Both tables key on `(personId, itemType, itemKey)`. Natural keys per type:

- `alias` → normalised alias name.
- `digital_identity` → `platform:handle`.

Scope is intentionally **relation-only**. Scalar attributes (hair colour,
weight, build, …) are *not* logged on decline. The user observed that
these are temporally fluid — declining "Brown" today doesn't mean
"Brown" should never recur tomorrow. Surfacing past declines as context
for value-type attributes risks biasing the user toward declining a
legitimate change. Relations are different — they're "does this exist?"
not "what is the value?" — and past declines stay meaningful.

Tombstones are forensic breadcrumbs only. They do not enable
"undelete"; the no-soft-delete invariant
(`feedback`-style memory note in CLAUDE.md) is preserved.

### Storage shape: where accepted scalar changes land

Each accepted scalar Accept gets a per-row intent picker matching the
existing record-physical-change-sheet:

- **"On this date"** (snapshot date from source) → auto-cluster into a
  draft Era at that date via `autoClusterDeltaIntoDraftEra`.
- **"I don't know when"** → dateless draft Era.
- **"Always true (baseline)"** → direct baseline write. Replaces any
  existing baseline delta for the attribute (including a
  verified-unknown sentinel — see below).

Default destination per row depends on DB state:

- DB has no baseline delta for this attribute (fill-gap) → default
  `baseline`.
- DB has a baseline delta (true conflict) → default `on-date`.

All "on this date" accepts from one re-import naturally cluster into a
single draft Era named `"Imported {YYYY-MM-DD}"`. The user can later
promote it via the existing curation nudge.

### Verified-unknown collisions

When DB has `isVerifiedUnknown=true` for an attribute and the import
proposes a real value, the 3-way intent picker handles it without
special-case code:

- User picks `baseline` → replaces the verified-unknown delta (explicit
  "actually we know now").
- User picks `on-date` → preserves the verified-unknown delta on
  baseline (correct *historically*) and adds the new dated value on a
  draft Era (current).

### Person columns (Birthday, Nationality)

The two Person columns don't live as deltas, so the intent picker
doesn't apply. Accept = direct overwrite of the column. The user
accepts the manual-verification cost at import time. No history table
is added — Birthday and Nationality very rarely change for a person,
and the loss-of-prior-value risk is much smaller than for fluid
attributes.

## Why

- **Matches the user's stated tradeoff.** They prefer explicit
  decision-cost over silent change. "No accidental loss" is the hard
  floor.
- **Existing primitives carry the weight.** The record-physical-change-
  sheet's 3-way intent picker, the draft-Era machinery
  (`autoClusterDeltaIntoDraftEra`), the staging-set workflow, the
  ICG-ID exact-match matcher, the verified-unknown sentinel — all reused.
  No new temporal concept needed.
- **Absence-is-information is a domain principle, not just a corner
  case.** Removed aliases, cleared fields, verified-unknown declarations
  are all forms of *intentional absence*. Treating any of them as
  "default missing" would erode user trust in the system.
- **Relation declines vs scalar declines is the right cut.** Identity-
  bearing relations have stable yes/no truth; value-type attributes
  evolve. The decline log fits one and not the other.

## Considered and rejected

- **(a) Skip-on-match (status quo).** Today's silent no-op. Easy to
  reason about; loses every benefit of re-imports filling gaps or
  bringing in new data. Rejected: the user has a real workflow that
  needs re-imports to flow data through.
- **(b) Silent overwrite with provenance-based update rules.** Some
  fields auto-update, others stay. Rejected: rules-engine bloat,
  inevitable corner-case fights, and even with provenance the user
  loses confidence in what *will* happen on the next re-import.
- **(c) Pure "append as new Era" with no per-attribute review.** Storage
  shape is correct (matches the temporal model), but skipping the review
  step means new values silently win the fold for "current state". The
  user values being shown the diff before any state changes.
- **Provenance as an auto-resolver** (D → auto-update if DB value also
  came from an earlier import; E → keep on manual-edit conflict).
  Rejected: the user wants every change to be an explicit decision
  regardless of provenance. Provenance becomes *displayed context*, not
  *decision logic*.
- **Decline log scoped to all item types including scalars.** Rejected
  per the user's hair-colour-cycling case: surfacing "you declined
  Brown 6 months ago" as context for today's "Brown" decision adds
  noise without information.

## Consequences

- A new `ImportItemStatus = PENDING_ATTRIBUTE_REVIEW` gates `importPerson()`
  for matched persons. Today's early-return becomes the post-decision
  finaliser instead.
- Two new tables: `ImportDeclineLog`, `ItemDeletionTombstone`.
- A new `ImportItem.decisions` JSON column for in-flight decisions.
- Manual-delete server actions on aliases / digital identities must
  write tombstones in the same transaction.
- The review UI is a per-person decision sheet, reachable from the
  existing `ImportItemDetail` flow.
- `PersonComparisonGrid` (already builds the side-by-side data view)
  extends with Accept/Decline + intent pickers; not a from-scratch build.
- Pure additions and fill-gap cases that the user accepts are filed
  through the same `autoClusterDeltaIntoDraftEra` path as the
  record-physical-change-sheet — no new write path.
- `importPerson()` for re-imports stops early-returning; it processes the
  Accept set instead. First-time imports (no match) keep today's
  behaviour unchanged.
- No schema work on `PersonAlias` / `PersonDigitalIdentity` for
  provenance in this slice — relations stay as-is; provenance lives in
  the import decision log only.
