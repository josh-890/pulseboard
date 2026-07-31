# ADR-0026: Self-assigned ICG-IDs

- **Status:** Accepted
- **Date:** 2026-07-31

## Context

`Person.icgId` is the canonical person key — `@unique`, NOT NULL, and the only thing the
import matcher will match on. Its values mirror an **external database**, so for anyone
present there the ID is a free, guaranteed-unique join key. That property is load-bearing:
ADR-0009's re-import flow, ADR-0022's lazy Contact reconciliation, ADR-0012's scrape-line
attribution and the exact-only invariant in `matcher.ts` all key on it.

Some people are **not in that external database**. They still need an ID, and it must
satisfy two things nothing in the codebase guaranteed:

1. It must never equal an ID already in use — including one held by a `Contact`, a person
   harvested from an import but not yet curated, whom the user has never laid eyes on.
2. It must never equal an ID the external database **might issue in future**. No
   "pick a high number" scheme can promise this; only a disjoint namespace can.

A convention already existed, undocumented: `generateIcgId()` in `src/lib/utils.ts` emitted
`XX-NN@RRR`, and the validation regex had been widened to `[A-Z0-9@]` in the first
post-year slot specifically to admit it. But it was client-side, seeded from
`Math.random()`, **never probed for uniqueness**, never checked against `Contact`, and
re-randomised on every keystroke of the name — so the value on screen was never reserved.
Collisions surfaced only as a P2002 mapped to "ICG-ID already exists", leaving the user to
press regenerate and hope. And because the marker was accidental rather than intended,
it could not be trusted as a filter.

Evidence that `@` is safe to reserve: across the production dump it appears in 3 of ~73
`Person.icgId` values (`NX-86@7C0`, `GP-72@F5D`, `MB-79@E76` — all three exactly the shape
the generator produced) and in **0 of 900 `Contact.icgId` values**, which are 100%
externally sourced. The external database emits `[A-Z0-9]` only.

## Decision

Formalise the existing convention into a contract, and enforce it.

```
External  XX-NN<S>    S ∈ [A-Z0-9]{1,4}   e.g. CX-82HO, AY-006S, CR-00KI7
Local     XX-NN@RRR   R ∈ [A-Z0-9]        e.g. JD-95@K7R
          │  │ │
          │  │ └─ marker '@' at index 5. Reserved.
          │  └─── last two digits of the birth year; '00' when unknown at mint time.
          └────── initials of the first two words of the common name; 'X' for a
                  missing second word.
```

### 1. `@` is reserved, and that is what keeps the namespaces disjoint

An ID entered as external is **rejected** if it contains the marker; a minted one always
carries it. Because the external database only ever emits `[A-Z0-9]`, no ID it can issue —
today or in ten years — can collide with one minted here. This is the whole safety
argument, and it is why the rejection is enforced rather than merely conventional.

### 2. Origin is derived, not stored

There is no `icgIdOrigin` column. The origin is readable from the ID itself, so a derived
predicate cannot drift, needs no migration, and — critically — **self-corrects**: the day a
person turns up in the external database and their ID is swapped via the Change ICG-ID
dialog, they leave the "self-assigned" bucket for free.

### 3. Minting is server-side and probed

`mintIcgIdAction` builds the prefix, generates a random 3-char suffix, and probes it
against **both** `Person.icgId` and `Contact.icgId` before offering it, retrying up to 8
times. `createPerson` re-mints once on a P2002 to close the race between probing and
inserting — a lost race is the system's problem, not the user's. An ID the *user* typed
still surfaces as a field error, because correcting it is their call.

### 4. Intent is explicit at creation

The create form asks which namespace applies rather than inferring it. Auto-filling a
minted ID and hoping the user overwrites it when they happen to have a real one is what
made the old marker untrustworthy. Default is "Not in external DB" — imports supply
external IDs and never touch this form.

### 5. Mint once; never re-derive

An ICG-ID is minted from what was known at first sighting and is never recomputed.
The data already works this way: `AX-0025` belongs to Anna-Leah (b. 1985 — the year was
learned after minting) and `CX-00L3` to Katya Clover (renamed since). Adding "fix the
prefix" logic would break every downstream reference for no gain.

### 6. A hint is never a match

A person holding a minted ID who later appears in an import under their real external ID
will **not** match — the IDs differ and matching is exact-only. Left alone that silently
creates a duplicate. So on a miss, `matchPerson` looks for a same-named person holding a
self-assigned ID and reports it through `matchDetails`, leaving `matchedEntityId` null.

This is deliberately advisory. Name equality is far too weak to merge on — that is exactly
the mistake the fuzzy trigram tier made before it was removed on 2026-05-26 — but it is
strong enough to point at. The operator resolves it by swapping in the real ID, which
cascades through `updatePersonIcgId`. The import UI renders an unmatched hint in amber
rather than the matched-green, because a warning dressed as a confirmation is worse than
no warning.

## Consequences

- One module, `src/lib/icg-id.ts`, owns the shape. Three copies of the same regex literal
  (`validations/person.ts` ×2, `import/staging-service.ts`) collapse into it.
- `Contact` auto-population from staged sets now validates against the **external** shape.
  A participant ICG-ID bearing the marker is malformed by construction and is skipped.
- The `/people` toolbar gains an **ICG-ID: All / External / Self-assigned** pill. It is a
  string predicate, so it can't use the unique btree index — irrelevant at ~1k rows, where
  the existing `q` filter already does an unanchored `contains` on the same column.
- A read-only `auditIcgIdOrigins` maintenance check reports the split and flags IDs
  matching neither shape (a marker at the wrong offset, or the HTML-polluted values the
  import parser can pass through unvalidated). It fixes nothing: whether an odd ID is a
  typo or a legacy value worth keeping needs a human, and rewriting one must go through
  `updatePersonIcgId` so the ImportBatch/StagingSet cascades run.
- No migration. The three existing `@` IDs are already canonical.
- 46,656 suffixes per (initials, birth-year) bucket. Ample, and the probe plus P2002 retry
  covers the tail regardless.

## Alternatives considered

- **A stored `icgIdOrigin` enum column.** Indexable, and could carry provenance beyond what
  the string encodes. Rejected: redundant with the marker, can drift out of sync, needs
  maintaining inside `updatePersonIcgId`, and costs a migration across both tenant DBs.
- **A sequential suffix** (`@001`, `@002`). More readable and stable across regenerates,
  but needs a max-lookup per mint, leaks bucket counts, and makes adjacent IDs look
  confusingly alike.
- **A second hyphen** (`XX-NN-RRR`) instead of `@`. Equally disjoint and friendlier in
  filenames and URLs, but would mean migrating the existing records through
  `updatePersonIcgId` for a purely cosmetic gain.
- **Auto-merging the import hint by name.** Rejected outright — see decision 6.

## References

- `src/lib/icg-id.ts` — the contract, and the only place the shape is defined.
- `mintIcgIdAction` / `createPerson` — `src/lib/actions/person-actions.ts`.
- `findSelfAssignedNamesake` — `src/lib/services/import/matcher.ts`.
- `auditIcgIdOrigins` — `src/lib/services/database-maintenance-service.ts`.
- ADR-0009 (re-import review), ADR-0012 (scrape-line ICG-ID injection),
  ADR-0022 (Contact reconciliation by exact ICG-ID).
