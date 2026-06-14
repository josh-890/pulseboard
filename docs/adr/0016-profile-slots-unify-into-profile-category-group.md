# Profile slots unify into a Profile category group; avatar = Headshot representative

Decided 2026-06-14 (design review, /grill-with-docs — not yet implemented). Refines ADR-0014 D7.

## Context

ADR-0014 (D7) committed, in the abstract, to folding the 5 profile **slots** into a "Profile" category group as the final unification step, sequenced last. By the time we reached it (after alignment slices 1–5 shipped), two facts sharpened the decision:

1. **Slots already *are* normalized framings.** On xpulse, 3 of 5 slots are template-standardized (heading to 5/5). A slot is "the person's normalized headshot / half-body / full-body" — exactly the alignment-template-per-category concept, just curated for the person browser instead of the Atlas. So slots are not a separate concept from category-bound alignment templates; they are one.
2. **The hero is the risk.** `getHeadshotsForPersons` (every person card + `/people`), `getPersonHeadshots`, `getPersonSlotState`, `getFilledHeadshotSlots`, `headshotDataFromLink`, the Slot Manager, and ~10 files read `PersonMediaLink.usage=HEADSHOT` + `slot` + `isAvatar`.

The user's model: slot 1 = Headshot = the person's "ID-card picture" — always first, the hero's starting image, and the avatar source.

## Decision

**Profile becomes an ordinary MediaCategory group; there is nothing special about it except role.** Unification is total — no parallel slot mechanism, no special cardinality.

- **Profile category group**, settings-managed like any other (Headshot, Half-body, Full-body, …). Slot labels become category names; slot order becomes category `sortOrder`.
- **Categories hold many aligned images per person**, exactly like detail-loci (Eyes). A person can have several headshots. Profile categories differ from detail-loci only in *what they're for* — the person browser shows them as the person's normalized framings — not in their machinery. They also become **Atlas-comparable** (compare everyone's headshot / full-body), which slot-binding made impossible.
- **The Headshot category is a system category — undeletable** — and is the permanent **avatar source**.
- **New concept: the representative.** Per *(person, category)*, one aligned image is the **representative** — the one displayed for that framing in the browser (`PersonMediaLink.isRepresentative`, ≤1 per person+category). When none is marked, the **most recent** image is the default.
- **The avatar is *defined* as the Headshot category's representative** — not an independently-settable flag. Changing the avatar = changing which headshot is the representative. `PersonMediaLink.isAvatar` is **retired** (derived from the avatar-source category's representative).
- **Representatives may be raw or aligned** — the category model already mixes raw detail photos and Aligned images, so the current "Link a raw photo" slot ability survives (a raw headshot that isn't keypoint-aligned can still be the representative).
- **`MotifTemplate.slot` is retired** — templates bind only to categories. The slot templates become the Profile categories' alignment templates (slot-1 template → Headshot category).

## Why

- **One mechanism.** The slot-XOR-category binding bimodality (ADR-0014) collapses to category-only — honours the project's "one meaningful target" principle.
- **Headshots/poses gain the Atlas** — directly on-theme for the whole alignment feature; the concrete prize that justifies the hero rewire.
- **The "representative" absorbs both slot peculiarities** — "one image shown per slot" → the marked representative; `isAvatar` → the Headshot representative — without a cardinality constraint, and it generalises (same idea as the body-feature cover).
- **Avatar-as-Headshot-representative is conceptually honest** — the ID-card picture *is* the avatar; making them the same object removes a settable degree of freedom no one wanted.

## Considered and rejected

- **Don't unify; keep slots a distinct concept** (amend D7 away). Near-zero risk, but forfeits headshots-in-Atlas and keeps two binding mechanisms. Rejected once it was clear slots already *are* normalized-framing categories.
- **Single-representative Profile categories** (enforce one image per slot). Rejected by the user: allow many headshots, mark one as representative — more flexible and still uniform with detail-loci.
- **Independently-settable avatar** (pick any Profile image as the avatar). Rejected: the avatar should always be the Headshot representative (the ID-card picture), so it's defined, not chosen separately.
- **Manual-only representative** (nothing shows until marked). Rejected: default to the most recent.

## Consequences

- New `MediaCategory` flags: a system **Headshot/avatar-source** category (undeletable); new `PersonMediaLink.isRepresentative`. `PersonMediaLink.isAvatar`, `slot`, `usage=HEADSHOT`, `MotifTemplate.slot`, and the `p-img0*` profile-slot settings are retired (migrated, then dropped).
- **Migration** (per tenant — pulse has 1 templated slot, xpulse 3/5): seed the Profile group + categories; convert each `HEADSHOT` slot link → a `DETAIL` link to its Profile category + `isRepresentative`; map each person's current ★ avatar → the Headshot category's representative; bind the slot `MotifTemplate`s to the Profile categories.
- **Hero rewire is the load-bearing step** — `getHeadshotsForPersons` / `headshotDataFromLink` / `getPersonHeadshots` and the Slot Manager move to "the avatar-source category's representative." Mandatory regression on `/people` + person cards. Sequenced last, ideally split: model+seed → data migrate → swap reads (verified) → drop old fields.
- The Slot Manager becomes Profile-category management (per category: add aligned images, choose representative, standardize). The Atlas gains the Profile categories.
