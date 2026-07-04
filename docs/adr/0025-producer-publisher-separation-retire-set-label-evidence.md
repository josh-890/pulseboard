# ADR-0025: Producer/Publisher separation; retire co-production and SetLabelEvidence

- **Status:** Accepted
- **Date:** 2026-07-04

## Context

The set detail sidebar showed a **Label** block inside the **Credits** panel. Credits is a
*people/attribution* surface (on-camera Persons + behind-camera Artists); a Label is a
*production organisation*. Mixing them contradicted the app's own spine — *"a Session
produces; a Set publishes"* (ADR-0020, CONTEXT.md) — and scattered the production ladder
across three places (Channel in the hero, Label in Credits, Session in its own panel).

Digging in exposed a deeper modelling problem. `CONTEXT.md` *defined* **co-production** as
*"a session published through a channel outside its producing label."* That reconstructs a
**production** fact from a **publication** anomaly — and `Session.labelId` is singular, so
the schema had **no way to record a genuine co-production** anyway. The user's workflow
settled it: sets are built **bottom-up** (set → channel → a generated session whose
`labelId` is *seeded from the channel's owning label*, then hand-corrected), and **exactly
one Label produces** any session. Genuine two-studio co-production does not occur.

An audit of both prod tenants found **0 non-derivable `SetLabelEvidence` rows** — every row
just echoed the channel owner. The table carried no information not derivable elsewhere.

## Decision

Model production and publication as **two orthogonal axes**, and stop conflating them.

1. **Producer = `Session.labelId`, singular.** No co-production entity. The value is a
   **snapshot**: seeded from the channel's owning Label at session generation, then an
   independent, hand-correctable production fact. Re-pointing the channel's owner later does
   **not** rewrite it.
2. **Publisher = `Set → Channel → Channel.labelId`** (current owner) — **derived, never
   stored** on the Set.
3. **Cross-label publication** replaces "co-production." When producer ≠ publisher (a
   producer's session published through another Label's channel), that is a
   *publication/licensing* fact, surfaced as **"Produced by X · Published via Y."** We do
   **not** fabricate a production link for it — the two labels stay truthfully separate
   (producer via the session, publisher via the channel). Rationale: fabricating co-production
   is a lie that corrupts *"what did Label B produce?"*, erases the licensing nature of the
   relationship, and is unnecessary because both labels are already reachable truthfully
   (PROV/CQRS: semantics belong on the specific fact — cf. ADR-0018).
4. **`SetLabelEvidence` is retired.** A set's labels are fully derivable, so the soft Set→Label
   evidence table is dropped from use (UI removed; table left in place until a later,
   explicitly-approved schema drop). No data loss (audit: 0 non-derivable rows).
5. **Label lifecycle guards.** A Label is referenced by **channels it owns** *and* **sessions
   it produces**. It is hard-deletable only when **both** are zero; an emergent stub retires
   only when fully unreferenced, not merely when it loses its last channel.
6. **Channel-owner-change safeguard.** Changing `Channel.labelId` never auto-deletes the old
   Label and never rewrites past sessions. It **offers** to re-point sessions still holding the
   old *inherited* label (`session.labelId == oldChannelLabelId`) to the new owner — a
   correction-vs-history choice, the direct analogue of the alias rename/branch guard (ADR-0024).

## Consequences

- **Credits** becomes people-only; a **Production** panel carries the session(s) + producer
  Label + the "Published via" line when it diverges. The ladder finally lives in one place.
- The producer/publisher divergence becomes *visible information* (cross-label publication),
  not a modelling hack.
- Label deletion and channel re-ownership become safe operations that can't orphan a session's
  producer.
- `SetLabelEvidence` reads/writes stop; the table can be dropped in a future migration.

## References

ADR-0020 (channel owning label), ADR-0024 (alias correction-vs-history guard), CONTEXT.md
"Production & publication" → **Producer vs Publisher**.
