# Pulseboard — Data Model Reference

> **`prisma/schema.prisma` is the source of truth.** This document explains the
> *concepts* and the cross-model relationships that aren't obvious from the
> schema alone. Field-level details (types, defaults, `@map`, `@@index`) live
> in the schema — read it directly.

## What Pulseboard tracks

Pulseboard is a personal information management tool for tracking people in
art/creative production. The model is built around two axes:

- **Identity & relationships** — Who someone is, what names they go by, who
  they work with, what organizations and projects they belong to.
- **Development over time** — Physical attributes, skills, identities, and
  career markers all change. The model captures *deltas* and *events*
  (Phase A–D of the temporal redesign — see `docs/adr/0001`–`0004`).

---

## Domain glossary

The canonical glossary lives in `CONTEXT.md` (project-root). The entries most
relevant to the data model:

- **Person** — The thing being tracked. Has aliases, an ICG id, demographic
  fields, and `activeFrom`/`retiredAt` career markers. *Never* `firstName` /
  `lastName` — display name comes from the `isCommon` alias.
- **PersonAlias** — Names. Exactly one `isCommon` (display name) per person.
  At most one `isBirth`. Flags are independent.
- **Era** — A *curated phase* of a person's life. Ordered list of Eras per
  person; one is `isBaseline` (dateless, "time zero"); others have a
  `date`/`datePrecision`. Auto-created eras start with `isDraft: true` until
  a user curates them. *Eras are folders, not date ranges* — see ADR-0001.
- **ScalarDelta** — One typed scalar change to a Person attribute, filed into
  an Era. Carries its own date. Replaces the legacy `PersonaPhysical` table.
- **Event** — A dated, typed log entry on a status-bearing entity
  (`BodyMarkEvent`, `BodyModificationEvent`, `CosmeticProcedureEvent`,
  `DigitalIdentityEvent`, `InterestEvent`, `PersonSkillEvent`,
  `RelationshipEvent`, `BodyMarkEvent`). The entity's `status` column is a
  *projection* of its event log — re-derived in the same tx as every event
  mutation (ADR-0002). Events are linked to the Era that hosts them.
- **Fold** — The pure reduction `(eras + deltas + events) → current state`.
  Canonical sort order pinned in ADR-0001 § fold sort order. Lives in both
  TS (`foldScalarDeltas`) and SQL (`app_recompute_person_current_state`) —
  same outcome, opposite literal sort direction.
- **PersonCurrentState** — Cache table holding the folded current physical
  state. Recomputed in-transaction with every fold-input mutation
  (ADR-0003). Replaces the old `mv_person_current_state` materialized view.

---

## Production layer

The work-recording layer connecting people to released material:

```
Network ──< LabelNetwork >── Label
                              │
                          Channel ──< ChannelLabelMap (evidence) >── Label
                              │
                            Set ──< SetMediaItem >── MediaItem
                              │           │
                              │      ┌────┴── Session (PRODUCTION)
                              │      │
                       SetParticipant     SessionContribution
                              │              │
                            Person ─────────┘
```

- **Session** (`SessionType`: REFERENCE / PRODUCTION; `SessionStatus`: DRAFT /
  CONFIRMED). REFERENCE sessions are auto-created per person via the
  `personId @unique` field — never manually created/edited/deleted/merged.
- **Set** has no `sessionId` — connected via the `SetMediaItem` bridge plus
  optional `SetSession` links (compilation sets span multiple sources).
- **SetCreditRaw** — Raw credits from imports awaiting resolution
  (`UNRESOLVED` / `RESOLVED` / `IGNORED`).
- **SessionContribution** + **SetParticipant** both carry
  `confidence ParticipationConfidence` (CONFIRMED / PROBABLE / POSSIBLE) and
  `confidenceSource ConfidenceSource` (MANUAL / CREDIT_MATCH / IMPORT).
  Resolving a credit promotes confidence to CONFIRMED + CREDIT_MATCH.
  SetParticipant mirrors the highest confidence of its linked contributions.
- **SessionContribution.eraId** (nullable) — ADR-0004: optionally links the
  contribution to the Era the person was in at the shoot. Drives the
  appearance-at-shoot snapshot via point-in-time fold. Authored here (not on
  SetParticipant) because a session is one shoot = one point in time = one
  Era, whereas a compilation Set can span several Eras within it.

---

## Identity layer

```
Person ──┬── PersonAlias ──< PersonAliasChannel >── Channel
         ├── PersonRelationship (× 2 sides) ──< RelationshipEvent
         ├── Era[]  (one isBaseline, others curated/draft)
         ├── PersonDigitalIdentity ──< DigitalIdentityEvent (Era)
         ├── PersonSkill ──< PersonSkillEvent (Era) ──< SkillEventMedia >── MediaItem
         ├── PersonInterest ──< InterestEvent (Era)
         ├── PersonEducation, PersonAward
         ├── PersonResearch, PersonTag
         ├── BodyMark ──< BodyMarkEvent (Era)
         ├── BodyModification ──< BodyModificationEvent (Era)
         ├── CosmeticProcedure ──< CosmeticProcedureEvent (Era)
         └── PersonCurrentState  (cache row, 1:1)
```

`Era` is the per-person *timeline spine*: every event log row references one
(`eraId`). The fold walks all deltas/events for a person, sorted by their own
date, with the Era providing only its anchor date as fallback.

---

## Media layer

```
MediaItem ──< PersonMediaLink >── Person     (usage / category / slot)
   │     ──< SetMediaItem      >── Set
   │     ──< MediaCollectionItem >── MediaCollection (user album)
   │     ──< MediaItemTag        >── Tag
   │     ──< SkillEventMedia     >── PersonSkillEvent
```

- `PersonMediaUsage`: PROFILE / HEADSHOT / DETAIL / PORTFOLIO. DETAIL media
  links via `categoryId` to a `MediaCategory` (admin-configurable; categories
  with `entityModel` drive body-mark / body-mod / procedure linking).
- Cover photo is `Set.coverMediaItemId` (nullable).

---

## Catalog & reference data

- **PhysicalAttributeGroup** / **PhysicalAttributeDefinition** — typed catalog
  of scalar attributes. `ScalarDelta.attributeDefinitionId` points here.
  Definitions are seeded; users can add more.
- **MediaCategoryGroup** / **MediaCategory** — admin-configurable in Settings.
- **color_catalog** — hair/eye/skin lookup tables for normalized search;
  `lookup_hair_hue()`, `lookup_eye_shade()`, etc. SQL helpers.
- **SkillGroup** / **SkillDefinition** — typed skill catalog.

---

## Views & SQL functions

| Object | Type | What it does | Refresh trigger |
|---|---|---|---|
| `v_person_list` | view | List page rows: commonAlias, birthAlias, currentAge, careerStartAge, activeBodyMarkCount, setCount | live |
| `v_person_work_history` | view | Person × Set joins with ageAtRelease | live |
| `v_person_body_events` | view | UNION of body mark / modification / procedure events with ageAtEvent | live |
| `mv_dashboard_stats` | mv | Entity counts | `refreshDashboardStats()` on bulk ops |
| `mv_person_affiliations` | mv | Person → label set counts | `refreshPersonAffiliations()` |
| `PersonCurrentState` | table (cache) | Folded current physical state per person | `app_recompute_person_current_state(p_id?)` in every fold-input tx |
| `compute_age_at(birth, prec, evt, prec)` | function | Returns text with `~` prefix for imprecise ages | — |
| `app_recompute_person_current_state(p_id?)` | function | Canonical SQL fold (mirrors `foldScalarDeltas` TS) | called by services |

---

## Temporal uncertainty

Every date field carries a precision and (where applicable) a modifier:

- **DatePrecision**: `UNKNOWN` / `YEAR` / `MONTH` / `DAY`. Convention:
  `UNKNOWN` → date is null; `YEAR` → `YYYY-01-01`; `MONTH` → `YYYY-MM-01`;
  `DAY` → exact date.
- **DateModifier**: `EXACT` / `APPROXIMATE` / `ESTIMATED` / `BEFORE` /
  `AFTER`. Display via `getModifierSymbol()` → `""`, `"~"`, `"est."`,
  `"before "`, `"after "`.

Fields with both: `birthdate`, `activeFrom`, `retiredAt`, `Era.date`,
`ScalarDelta.date`, `BodyMarkEvent.date`, `BodyModificationEvent.date`,
`CosmeticProcedureEvent.date`, `DigitalIdentityEvent.date`,
`InterestEvent.date`, `PersonSkillEvent.date`, `Session.date`,
`Set.releaseDate`, `PersonAward.date`, `RelationshipEvent.date`,
`PersonEducation.startDate`/`endDate`.

Plausibility rules (soft, never block saves) live in
`src/lib/services/plausibility-service.ts`. Surfaced on the Overview "Data
Quality" card.

---

## Delete model

**Hard-delete only.** No `deletedAt` columns anywhere. Cascade helpers in
`src/lib/services/cascade-helpers.ts` orchestrate the FK chains in a single
`$transaction` (e.g. `cascadeDeleteSet`, `cascadeDeleteSession`,
`cascadeDeleteEra`, `cascadeDeletePersonSkills`). Every cascade helper takes a
`TxClient` and is composable.

---

## Where to look next

- `prisma/schema.prisma` — every field, type, default, index, FK.
- `CONTEXT.md` — domain glossary.
- `docs/adr/0001`–`0004` — design decisions for Era/Delta/Event/Fold/Cache
  and Era-linked participation.
- `docs/temporal-model-migration-plan.md` — phases A–F, history of the
  redesign.
- `docs/architecture.md` — system map (routes, services, actions, data
  flows, invariants).
