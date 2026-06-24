# Behind-camera Artists surface in sessions as a derived credit union, not as contributions

Decided 2026-06-24 (design review, /grill-with-docs). Implementation pending —
see `docs/artist-session-contributors-plan.md`.

## Context

Credits on a Set (`SetCreditRaw`) resolve to **one of two contributor kinds**: an
on-camera **Person** (`resolvedPersonId`) or a behind-camera **Artist**
(`resolvedArtistId`). The two kinds are deliberately asymmetric:

- **Person** is the deep, fully-tracked subject — date-of-birth floor, Eras,
  delta-fold, appearance, body map, work history.
- **Artist** is a lightweight contributor — name, nationality, bio — for crew the
  user will *never* track with that depth.

The role taxonomy has two groups (real data, both tenants): **On-Camera** (`model`)
and **Behind Camera** (`photographer`). `add-credit-inline` already routes by group
(`isArtistRole = groupName === "Behind Camera"`): On-Camera → search/create Person,
Behind-Camera → search/create Artist.

Three problems surfaced in use:

1. **Artists never reach the session.** `SessionContribution.personId` and
   `SetParticipant.personId` are **non-nullable** — structurally Person-only.
   `resolveCreditRaw(person)` creates a `SessionContribution` on the linked sessions;
   `resolveCreditAsArtistRaw(artist)` writes only `resolvedArtistId` and dead-ends.
   So a credited photographer never appears in the session's contributor list.
2. **An incoherent dual-path.** The resolution panel lets a behind-camera credit be
   resolved as a *Person* (toggle), and a **role-less** credit *defaults* to Artist.
   So "photographer" sometimes means a Person-role and sometimes an Artist-entity.
3. **Imported artists are role-less.** The import `artist` field becomes a role-less,
   unresolved credit (`createNewSet`, `enrichExistingSet`, manual promotion), which is
   why it falls into the role-less→Artist default and never carries a behind-camera
   role.

The user's decision (grilled): **keep Artist a separate, lightweight register** — a
photographer is never a deep Person — **but make behind-camera credits visible in the
session's contributor list.**

## Decision

**Behind-camera Artists stay out of `SessionContribution`; the session's contributor
list is a derived union.** The contributor kind is determined deterministically by the
credit's **role group**.

1. **Contributor kind is role-group-driven, always.** On-Camera role → **Person**;
   Behind-Camera role → **Artist**. The resolution panel offers only the kind dictated
   by the credit's role; the role-less "default to Artist" path is removed. (`add-credit`
   already does this.)
2. **Session contributors = union (derived for the Artist side).** The session view
   shows on-camera **Person** contributions (`SessionContribution`, unchanged) **plus**
   the behind-camera **Artist** credits read from the session's sets
   (`SetSession → Set → SetCreditRaw` where role group = Behind-Camera), de-duplicated.
   `SessionContribution` / `SetParticipant` remain **Person-only** — no polymorphism, no
   schema change to those tables.
3. **Imported `artist` credits carry the `photographer` (Behind-Camera) role** on
   creation, so they are unambiguously behind-camera Artist credits.
4. **Visibility rule (deliberate asymmetry):** behind-camera credits show **always** —
   resolved `Artist.name` or the raw name if unresolved. On-camera contributors show
   **once resolved** to a Person (an unresolved on-camera name stays a pending identity
   in the credit-resolution queue). Crew the user cares less about gets shown for free;
   Person identity discipline is preserved.

## Why

- **Keeps the Person/Artist separation crisp** — the whole point. Crew never inherit the
  deep model.
- **Visibility with zero contribution-table churn** — a pure read-side union; no
  polymorphic FK rippling through `personId`-assuming code, no era-link nonsense for
  crew (Artists have no Eras).
- **Removes the dual-path** — kind is a deterministic function of the role group, so
  "photographer" has exactly one meaning.
- **Cheap and reversible-ish** — the heavy parts (B's polymorphism) are avoided.

## Considered and rejected

- **A — unify behind-camera into Person** (drop Artist; photographer = a Person with a
  behind-camera role; flows into `SessionContribution` naturally; matches IMDb/Discogs).
  Rejected by the user: a photographer is never tracked near as deeply as a model, and
  forcing crew through the DOB/Era/appearance machinery pollutes the Person model.
- **B — polymorphic `SessionContribution`/`SetParticipant`** (contributor = Person *or*
  Artist). Makes Artists first-class contributors (confidence, session-level authoring,
  participant cache) but is exactly the heavier treatment the user rejects for crew, and
  ripples through a large `personId`-assuming surface.
- **Status quo** — leave Artists dead-ended on the credit. Rejected: the user wants them
  visible as session contributors.

## Consequences

- Behind-camera contributors in the session view are a **derived, read-only display** —
  no confidence, no era-link, no `SetParticipant` cache. They are authored/edited at the
  **set-credit** level, not the session.
- **Data to reconcile (one-off):** existing **role-less** artist credits → backfill the
  `photographer` role; **audit** any Behind-Camera credit resolved to a *Person* under
  the old dual-path (it should be re-resolved as an Artist).
- **Changing a credit's role group changes its contributor kind** (Person ↔ Artist) —
  the resolution UI must reflect that.
- A human who is genuinely both a model and a photographer will exist twice (a Person and
  an Artist). Accepted as a rare edge given the deliberate separation; cross-linking the
  two identities is out of scope.
- `add-credit-inline` is already correct; the change is concentrated in the resolution
  panel, the import credit-creation sites, and the session view.
