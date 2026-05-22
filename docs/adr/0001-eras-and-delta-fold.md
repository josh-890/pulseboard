# Eras as curated folders; deltas folded by their own date

Decided 2026-05-21 (design review — not yet implemented).

## Context

A Person's changing attributes (weight, hair color, tattoos, …) develop over time. The original implementation modelled each `Persona` ("Era") as an auto-created calendar-year bucket: a dated change was routed to the persona for its year via `findOrCreatePersonaForDate`. Change dates, however, are frequently uncertain best-guesses that get refined later — and under year-buckets, re-dating a change meant restructuring era membership.

## Decision

An **Era** is a curated, user-named *phase* — a folder, not a date range. A delta is **filed into** an Era by the user; membership is **sticky** and does not change when the delta's date is edited. Every delta carries **its own date**. The **fold** that derives current state gathers all deltas across all Eras, sorts them by their own date, and replays them — Era boundaries are invisible to the fold. An Era's displayed temporal span is the auto-derived range of its members; Eras may therefore overlap, which is allowed but flagged for manual tidy-up. Eras auto-created by a quick-edit or by import start as un-named **draft** Eras.

## Amendment (2026-05-21, round 2): the baseline Era is dateless

The **baseline** Era carries **no date of its own** (`date = null`). It is always
folded first by virtue of `isBaseline`; wherever a concrete date is needed
(timeline edge, point-in-time `asOf` fold) the Person's birthdate is used. This
replaces the original `birthdate + 18` baseline anchor — a synthetic date that
falsely asserted "attributes start at adulthood" and made any delta recorded
before age 18 (e.g. a scar from surgery at 16) sort *before* the baseline,
producing spurious "before baseline" conflicts. With a dateless baseline there is
no such boundary: the only hard temporal floor is the birthdate.

## Why

Because the fold sorts by delta date, era membership is not load-bearing for correctness. Re-dating a change is then a single-field edit that can never corrupt era structure or damage a curated grouping. Year-buckets re-introduce a date↔era invariant the fold does not need, and a date correction could rip a change out of a deliberately-curated era.

## Considered and rejected

- **Date-range buckets** (era owns a calendar year; re-dating re-buckets the delta): makes every date edit a structural mutation and damages curation.
- **Hybrid** (draft eras re-bucket, curated eras sticky): two rule-sets; a delta's behaviour changes the moment its era is named.
- **No Era entity** (flat delta timeline): loses the curated "phase" grouping the product needs for its development-timeline view.
