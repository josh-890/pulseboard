# Era-linked participation: contributions reference the Era they happened in

Decided 2026-05-21 (design review, round 2 — not yet implemented).

## Context

The production layer (`Session` = a shoot; `SessionContribution` = a person's
participation) and the temporal layer (`Era` = a phase of a person's
development) were entirely disconnected. A set/session showed *who* participated
but nothing about *how that person looked at the time* — "Mia, in her
short-blonde-hair era".

## Decision

`SessionContribution` gains an optional `eraId` FK to `Era` — the Era the person
was in for that shoot. It is authored on `SessionContribution` (the
source-of-truth participation record), **not** on `SetParticipant` (a derived
cache) — because a Session is one shoot = one point in time = one Era, whereas a
compilation `Set` links many sessions and a person can span several Eras within
it. The Era is **manually picked** (defaulting to the Era whose member-date range
covers the session date) — overlapping, fuzzy Eras can't be auto-resolved
reliably, and the user wants the choice.

This enables an **appearance-at-shoot** snapshot on session/set pages, computed
by the point-in-time fold `deriveCurrentState(person, { asOf })` where `asOf` is
the latest member-delta date within the linked Era. The fold therefore stays
**date-ordered** (ADR-0001) — the Era only supplies a cutoff date; no Era-ordered
folding is introduced. It also gives reverse navigation: an Era lists the
sessions/sets that occurred during it.

## Why

A contribution is not a delta — it never affects the fold — so the link is purely
read-side enrichment and structurally low-risk. Anchoring the appearance snapshot
on the *linked Era* rather than the *session date* makes it robust: session dates
are frequently `DRAFT` / `UNKNOWN`-precision, whereas the Era is the user's
deliberate, always-present curation choice.

## Considered and rejected

- **`eraId` on `SetParticipant`** — wrong layer: it is a derived cache wiped on
  every rebuild, and a compilation Set spanning multiple Eras can't be
  represented by one `eraId`.
- **No stored link — fold `asOf` the session date** — fails whenever the session
  date is unknown, and loses the curation pin and reverse navigation.
