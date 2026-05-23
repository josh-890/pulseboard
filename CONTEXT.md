# Pulseboard

Pulseboard tracks people in art/creative production — their profiles, work history, inter-personal connections, and how their attributes develop over time.

## Language

### People & temporal model

**Person**:
The real human being. Owns the **static attributes** — values that never change, or change so rarely they are treated as fixed (date of birth, height, eye color).
_Avoid_: model, talent, subject (when the Person entity is meant).

**Era** (code model & DB table: `Era`):
A curated **phase** of a Person's development — a meaningful, user-named span ("2019 — went blonde, added sleeve tattoo"). The user creates one deliberately. Delta records (physical changes, body-mark events, etc.) are **filed into** an Era by the user; membership is **sticky** — it does not change when a delta's date is edited. An Era's temporal extent is the auto-derived range of its members' dates, so Eras *can overlap*; overlap is allowed but flagged for manual tidy-up. Eras form the sequence shown on the Person's development timeline.
_Avoid_: "Persona" (the legacy code-model name — fully replaced in May 2026); "change-point" (an Era is a span, not a single instant).
_Synonym_: Phase.

**Draft era**:
An Era auto-created (by a single quick-edit or by import) but not yet named/curated by the user. Behaves identically to a curated Era; the only difference is it is flagged for the user to name or merge.

**Baseline**:
The first Era for a Person — "time zero". It holds the **starting value of every changing attribute** (the values formerly called "natural" hair color, breast size, etc.); the fold begins here. Exactly one per Person, auto-created, cannot be deleted. It carries **no date of its own** — it is always folded first by virtue of being the baseline; wherever a concrete date is needed (timeline edge, point-in-time fold) the Person's birthdate is used. `Person` itself carries only truly-static attributes (date of birth, eye color, height).

**Static attribute**:
A Person attribute treated as fixed for life (date of birth, height, eye color). Lives directly on **Person**.

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

**Attribute status**:
A *derived* property of a changing attribute — `NATURAL`, `ENHANCED`, or `RESTORED`. It is never stored: it follows from the Fold — an attribute is `ENHANCED` when a Cosmetic procedure targets it, `RESTORED` when that procedure was later reversed, `NATURAL` otherwise. (So "enhanced breasts" is not a stored flag — it means a procedure targets `breast_size`.)

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
