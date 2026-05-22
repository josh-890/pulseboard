# Event logs for identity-bearing attributes; no validity-interval fields

Decided 2026-05-21 (design review — not yet implemented).

## Context

Changing attributes were tracked three different ways: sparse per-era snapshots (`PersonaPhysical`), `added`/`modified`/`removed` event logs (body marks/modifications/procedures), and `validFrom`/`validTo` interval fields (skills, digital identities, interests, relationships). Skills carried all the redundancy at once — `validFrom`/`validTo` *and* a `personaId` *and* a `PersonSkillEvent` log. Identity-bearing entities also carried a `status` enum duplicating what their event log already implied, and the fold did not actually honour `removed` events.

## Decision

Every **identity-bearing** changing attribute (a specific tattoo, piercing, procedure, skill, digital identity, interest, relationship) is modelled as a persistent parent record plus an **Event log** (`added`/`modified`/`removed`). `validFrom`/`validTo` fields are removed everywhere; an interval is just a degenerate event log (`added` … `removed`), and add-only attributes keep a simple from/to UI that saves two events. Whether an attribute is present *now* is derived from its last Event by date. The `status` enum is retained only as a **denormalised projection**, recomputed **inside the same transaction** as every Event mutation, so it cannot drift. A 24-hour and on-demand job re-verifies the projection and flags any mismatch as a write-path bug.

Identity-*less* scalar attributes (weight, hair color, build) are handled separately — individually-dated scalar deltas against a typed attribute catalog; see ADR-0001 for the delta model.

## Why

One representation for identity-bearing attributes means one fold path. Deriving presence from the event log makes the log the single source of truth. Recomputing `status` in-transaction makes the cache drift-*impossible* rather than drift-*tolerated* — a timer that merely repairs drift would instead display known-wrong data until it next runs.

## Considered and rejected

- **Timer-repaired status cache**: up to 24h of wrong data; imports look wrong until the timer fires.
- **DB triggers / generated columns**: correct, but inconsistent with the service-layer-transaction style and invisible in Prisma.
- **Keep `validFrom`/`validTo` for "lightweight" attributes**: a permanent second fold path for no real saving — the interval UI can sit on top of an event log instead.
