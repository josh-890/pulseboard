# Pulseboard

Pulseboard tracks people in art/creative production — their profiles, work history, inter-personal connections, and how their attributes develop over time.

## Language

### People & temporal model

**Person**:
The real human being. Owns only **core identity fields** that are structurally wired into the rest of the system — date of birth (the temporal floor, used by every age computation and as the fold's baseline anchor) and system identifiers. All other attributes — eye color, height, hair color, weight, build, body marks, etc. — live in the catalog-driven changing-attribute system regardless of how often they actually change.
_Avoid_: model, talent, subject (when the Person entity is meant).
_Migration in flight_: `Person.eyeColor` and `Person.height` are slated to move off the Person row into the delta spine — they were modeled as static columns historically but conceptually belong in the catalog. The schema still carries them as columns today.

**Era** (code model & DB table: `Era`):
A **phase** of a Person's development. Eras are **emergent**, not pre-planned — the user records changes first, and Eras are named retrospectively as labels for clusters of related changes ("2019 — went blonde, added sleeve tattoo"). Two states:
- **Draft** — auto-assigned by the system from incoming deltas (clustered by date proximity). Membership is **non-sticky**: editing a delta's date may re-cluster it into a different draft Era.
- **Curated** — the user has named it (promoting a draft, or creating one explicitly). Membership is **sticky**: editing a delta's date does not move it out of a curated Era.

An Era's temporal extent is the auto-derived range of its members' dates, so Eras *can overlap*; overlap is allowed but flagged for manual tidy-up. Eras form the sequence shown on the Person's development timeline.
_Avoid_: "Persona" (the legacy code-model name — fully replaced in May 2026); "change-point" (an Era is a span, not a single instant).
_Synonym_: Phase.

**Draft era** (revised 2026-05-23):
An Era auto-created from one or more deltas (record-a-change, quick edit, import) and not yet named/curated. Differs from a curated Era in two ways: (1) no user-given name, and (2) **non-sticky** membership — date corrections on its deltas re-cluster freely. Promotion to a curated Era happens when the user names it; from that moment sticky membership applies.

**Baseline**:
The first Era for a Person — "time zero". It holds the **starting value of every changing attribute** (the values formerly called "natural" hair color, breast size, etc.); the fold begins here. Exactly one per Person, auto-created, cannot be deleted. It carries **no date of its own** — it is always folded first by virtue of being the baseline; wherever a concrete date is needed (timeline edge, point-in-time fold) the Person's birthdate is used. `Person` itself carries only truly-static attributes (date of birth, eye color, height).

**Static attribute** (revised 2026-05-23):
Static-ness is a **policy on the attribute definition**, not a storage location. Every catalog attribute carries a **mutability policy** that drives its UI and validation: a "never changes" attribute (eye color) is shown with inline edit and warns if a second value is filed; a "volatile" attribute (weight) leads with the record-a-change affordance. Storage is uniform across all of them — one delta stream, with truly-static values stored as a single delta at Baseline. The only fields exempt are the **core identity fields** on **Person** itself (date of birth, system identifiers), which exist for *system* reasons, not because they "don't change much".

**Mutability policy** (added 2026-05-23):
Three levels, attached to each scalar attribute definition. Drives UI affordance + validation only — never modifies stored history. Reclassification (e.g. `RARELY_CHANGES → VOLATILE`) takes effect immediately for new authoring and leaves existing deltas untouched.
- `ALWAYS_STATIC` — UI: inline edit only, no record-a-change affordance. Validation: soft warning if a second non-baseline delta is filed. *Examples: handedness, eye color, Brushfield spots.*
- `RARELY_CHANGES` — UI: inline edit plus record-a-change in a secondary menu. No validation warnings. *Examples: build, face shape, inseam, hair pattern.*
- `VOLATILE` — UI: record-a-change is the primary affordance; current value plus trend shown alongside. No validation warnings. *Examples: weight, hair color, hair length, body fat.*

**Changing attribute**:
A Person attribute that develops over time. Two kinds:
- **Identity-bearing** — a specific object you edit over its lifetime (a particular tattoo, piercing, skill). Modelled as a persistent parent record plus an **Event** log.
- **Identity-less (scalar)** — a value that simply differs over time, with no object identity of its own (weight, hair color, build). Modelled as **scalar deltas**, each targeting an **Attribute definition**.

**Delta**:
A single, independently-dated recorded change to one changing attribute, relative to the state immediately before it. Every delta — whether an **Event** on an identity-bearing attribute or a **scalar delta** — has the uniform shape *(Era, what it targets, value, its own date)*. The current state of a Person is the **fold** of the Baseline plus every delta in chronological order. In the UI a delta is surfaced to the user as a **Change** ("Tattoo added", "Hair → Blonde").

**Event**:
One delta in the lifecycle of an identity-bearing changing attribute (`added` / `modified` / `removed`). Whether the attribute is present *now* is derived from its last Event by date — there are no separate validity-interval fields.

**Attribute definition**:
A catalog entry (admin-configurable) describing one trackable scalar attribute — its name, value type (numeric, single-select, etc.), unit, and allowed values. Every scalar delta targets an Attribute definition; the catalog is the single registry of what scalar attributes exist.

**Attribute status** (revised 2026-05-24):
A *derived* property of a changing attribute — `NATURAL`, `ENHANCED`, or `RESTORED`. Derived from each delta's `cause` flag (`NATURAL` / `SURGICAL` / `OTHER`) via the Fold:
- `NATURAL` — no delta with `cause = SURGICAL` in the attribute's history.
- `ENHANCED` — the winning delta has `cause = SURGICAL`.
- `RESTORED` — a SURGICAL delta exists in history but a later non-SURGICAL delta has overridden it.

Cached per attribute in `PersonCurrentState.attributeStatuses` for query (filter: "all persons with natural breast status"). Hero/grid display: `NATURAL` renders as plain value; `ENHANCED` / `RESTORED` render as `B (Natural) → D (Enhanced)` with a status label per value pill.

_Historical note_: until 2026-05-24, status was derived from the presence of a `CosmeticProcedure` record targeting the attribute. ADR-0007 dropped the `CosmeticProcedure` entity and moved causation onto the delta itself.

**Fold**:
The computation that replays Baseline + every delta — gathered across all Eras and **sorted by each delta's own date**, ignoring Era boundaries — to produce a Person's **current state** (or their state at any chosen point in time, via an `asOf` cut-off).

**Current state**:
The result of the Fold as of *now* — a Person's present hair color, weight, active body marks, etc. It is a derived value, never authored directly; it is served from a per-person cache kept correct within each mutation's transaction.

**Era-linked participation**:
A person's participation in a shoot (`SessionContribution`) optionally references the **Era** the person was in at that time. This anchors their *appearance at the shoot* — the Fold computed `asOf` that Era — and lets an Era list the sessions and sets that occurred during it.

## Flagged ambiguities

- **"Persona"** — In the wider domain a "persona" usually means a stage identity / working name. In Pulseboard it does **not**: stage names are **Aliases** (`PersonAlias`). The concept is an **Era** — a phase on the Person's development timeline. The legacy `Persona` Prisma model + DB table were renamed to `Era` in May 2026 — no Persona references remain in current code or docs. If you find one, it's either inside `prisma/migrations/` (historical) or it's drift worth fixing.
- **"natural" vs "current"** — Older fields (`naturalHairColor`, `naturalBreastSize`, `currentHairColor`) implied a fixed-vs-live split. There is no such split: a changing attribute has exactly one timeline, whose first value is on the **Baseline** Era. "Natural" is simply the Baseline value.

## Example dialogue

> **Dev:** Mira's detail page shows her current hair as blonde — where does that come from?
> **Expert:** The **Fold**. Her **Baseline** Era has hair = brown — her starting value. A later Era, "2021 — went blonde", carries a scalar **delta** setting hair = blonde. The Fold replays Baseline plus every delta in date order, so blonde wins.
> **Dev:** And the rose tattoo?
> **Expert:** That's an **identity-bearing** changing attribute — a parent record with an **Event** log. It has an `added` Event filed in the "2019" Era. If she has it lasered off, that's a `removed` Event and the Fold drops it from **current state**.
> **Dev:** What if the tattoo's date was wrong and it was really 2022?
> **Expert:** She re-dates the Event. It stays in whatever Era she filed it under — membership is sticky — but the Fold re-sorts by the Event's own date. If that makes two Eras' spans overlap, she gets a tidy-up flag.
> **Dev:** So an Era isn't a date range?
> **Expert:** Right — it's a curated phase, a folder. Its displayed span is just the range of the deltas inside it.
