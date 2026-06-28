# Inter-person network: a PersonRef ghost register, polymorphic edges, lazy ICG-ID reconciliation

Decided 2026-06-28 (design review, /grill-with-docs). Implementation in progress —
Slice 1 (data model + backfill + import wiring + reconcile) landed; see
`~/.claude/plans/be-my-senior-software-scalable-puffin.md`.

## Context

Pulseboard needs to track how people relate: **work collaboration** (who shot
together) and **personal relationships** (sister, spouse, mentor). The schema
already had a dormant `PersonRelationship` + `RelationshipEvent` feeding a person
"Network" tab, but nothing wrote them and `sharedSetCount` was unused.

The blocker that shelved the feature is the **huge volume of people referenced but
not curated** — import co-models (ICG-ID + name) and staged-set participants. Today
these are scattered raw mentions (`ImportItem` CO_MODEL, `StagingSet.participantStatuses`,
`SetCreditRaw`) with **no first-class identity**: it is binary — a full `Person` or
nothing. So a relationship to a not-yet-added person (or a non-industry sister)
cannot be recorded, and the network of referenced people is invisible.

ICG-ID is already the canonical person key (`matcher.ts`, exact-match-only, no fuzzy)
and staged sets already resolve set→person by it lazily. Market patterns (entity
resolution; Obsidian ghost/unresolved links; GEDCOM typed associations + placeholders)
converge on the same shape: give the not-yet-curated person a first-class addressable
identity, keep "mentions" separate from the canonical entity, resolve lazily by a
stable key.

## Decision

1. **`PersonRef` ghost register.** A new canonical table for referenced-but-not-curated
   people: cuid PK, **optional unique `icgId`**, name, thumb, note, source. Import refs
   carry their ICG-ID; a non-industry contact can be a name-only ref. The curated
   `Person` space stays industry-only regardless of reference volume.

2. **Polymorphic edges; at least one endpoint is a `Person`.** Curated relationships
   (`PersonRelationship`) and stored claims (`ClaimedCollaboration`) have a counterpart
   that is **either** a `Person` **or** a `PersonRef` (exactly one FK set, enforced in
   the service layer). You always assert from a real person's page, so ghost↔ghost edges
   are disallowed.

3. **Lazy reconciliation by ICG-ID.** When a `Person` appears with a ref's ICG-ID
   (import or manual create), `reconcilePersonRefs` repoints the ref's claims/relationships
   to the Person (merging on conflict, dropping self-edges) and **deletes the ref**.
   Deterministic, exact-match-only — never fuzzy (honours the existing import invariant).

4. **Work network: derive held, store claims.** **Held co-occurrence** (people sharing a
   held Set) is **computed** live (MV at scale, like person-affiliations) — never stored,
   so no `sharedSetCount` upkeep or staleness. **Import "worked-with" claims** are
   **stored** as `ClaimedCollaboration` evidence (survive with no held set — the
   claimed-vs-held gap). `PersonRelationship` holds **only** hand-asserted personal/
   professional ties, typed by a `RelationshipRole` catalog (name + inverse + symmetry).

## Alternatives considered

- **Stub status on `Person`** (ghosts are `Person` rows flagged `STUB`). One identity,
  no polymorphism, trivial promotion. Rejected: every existing `Person` query (lists,
  KPIs, search, facets, MV affiliations, dedupe) would need a status filter — a wide,
  error-prone blast radius on an already-large app; a missed filter leaks stubs into
  counts. A separate table is self-isolating: existing queries are untouched; surfaces
  opt **into** showing refs.
- **Lazy mentions only** (no ghost identity; edges only between full Persons). Rejected:
  cannot record a relationship to anyone not yet added (no name-only sister), and the
  referenced network stays invisible.
- **Materialize all work edges** into `PersonRelationship` (source=derived) with rebuild
  triggers. Rejected: rebuild-trigger fan-out + staleness (the dormant `sharedSetCount`
  is the cautionary tale). Deriving held co-occurrence is always correct.

## Consequences

- New tables `PersonRef`, `ClaimedCollaboration`, `RelationshipRole`; `PersonRelationship`
  reworked from `personA/personB` + `type` to `personId` + `toPerson?`/`toRef?` + `roleId`
  (tables were empty — no data migrated).
- Edges carry two nullable counterpart FKs; "exactly one set" is a service-layer invariant,
  not a DB constraint.
- Promotion is automatic and irreversible per ref (the ref is deleted on reconcile); a
  name-only ref (no ICG-ID) reconciles only via an explicit manual link.
- The person tab is renamed **"Network" → "Connections"**; `Network` stays reserved for
  the org grouping above Labels.
