# Single TypeScript fold; current state cached in-transaction, not in a materialized view

Decided 2026-05-21 (design review — not yet implemented).

## Context

"Current state" (folded hair color, weight, active marks, …) was computed three ways that could disagree: `deriveCurrentState` (TypeScript, detail page), `mv_person_current_state` (SQL materialized view, list/search), and a dead, unused `computePersonCurrentState`. Other dashboard counters legitimately use materialized views, so an MV looked like the "obvious" pattern here too.

## Decision

There is **one** fold implementation — `deriveCurrentState` in TypeScript. A Person's current state is stored in a **per-person cache table, upserted inside the same transaction** as any delta mutation. The list/search page reads the cache table; the detail page folds live from data it already loads for the timeline. `mv_person_current_state` and the dead `computePersonCurrentState` are removed. The fold takes an optional `asOf` cut-off, yielding point-in-time state (a Person's state at the end of any Era) for free.

## Why

`REFRESH MATERIALIZED VIEW` recomputes the *whole population*, so an MV cannot give per-edit freshness without a full rebuild on every write — the staleness this design explicitly rejects. An in-transaction per-person cache is correct on the very next read, scales to any population, and keeps the event-replay logic in the language where it is pleasant to write and debug.

This is a **deliberate deviation** from the dashboard-stats MV pattern: current state is mutated far more often and per-entity, where an MV's coarse, whole-population refresh is the wrong tool.

## Consequences

- Every delta-mutating code path must trigger the per-person recompute; this is funnelled through the cascade-helper service layer and backstopped by ADR-0002's integrity-check job.
- A change to the fold logic requires a one-off rebuild of all cache rows (the manual resync action).
