# ADR-0024: Channel-scoped alias truth, evidence-driven set display

- **Status:** Accepted
- **Date:** 2026-07-03

## Context

Every set-creation pathway (import, manual, archive-link) is engineered to nail the
**common-name (ICG-ID)** identity of each participant — correctly non-negotiable. But the
**alias a person actually appeared under in a specific set** was thrown away. Wiska, credited
as "Mila" on the set "Blond Baby", was shown only as "Wiska"; "Mila" was never surfaced,
never queryable, and lost at creation time.

The primitives to fix this already existed and were unused end-to-end:

- `PersonAlias` + `PersonAliasChannel` — a channel-scoped alias **registry** (with `isPrimary`).
- `SetCreditRaw.resolvedAliasId` (FK, `onDelete SetNull`) + `SetCreditRaw.rawName` — a **per-set
  pin** and a frozen raw string.
- The set hero (`ParticipantAvatars`) already renders an italic `as: …` line — but it was
  **starved of data**: in every pathway `rawName` ended up equal to the common name (imports
  carry the canonical name; manual/archive passed the picked person's name). The archive parser
  (`parseFolderParticipant`) *did* extract "Mila" from the folder name `…-CHNL Mila - Title`, but
  used it only to score the folder→set match and then discarded it.

Best-in-class analogues (IMDb "credited as", Discogs Name-Variation + per-release name credit,
MusicBrainz artist credits) all share one shape: **canonical identity → scoped alias registry →
per-appearance "credited as" that references the registry when known but tolerates a raw string.**

## Decision

Adopt that three-layer split on the existing primitives.

1. **Truth is the channel-scoped alias.** "Wiska = Mila on channel X" lives in `PersonAlias` +
   `PersonAliasChannel`. Multiple aliases per (person, channel) is normal; `isPrimary` marks the
   default. The set is *evidence*, not the source of truth.

2. **Evidence is the per-set pin.** `SetCreditRaw.resolvedAliasId` + `rawName`. Display reads the
   pinned alias's **current** name.

3. **Propagation contract — two changes behave differently on purpose.**
   - **Rename** an alias → propagates via the FK (the *only* place a rename propagates).
   - **Re-scope / unlink** an alias↔channel → **never** retroactively rewrites already-pinned sets
     (a published set's credit is immutable history). It only changes the default for future sets.
   - **Delete** an alias → `SetNull` → display falls back to `rawName`, then the common name.

4. **Rename guard.** Because each Alias↔Channel fact is corroborated by real set usage, renaming an
   alias with usages (`creditCount > 0`) is **not** assumed to be a typo fix. It is guarded and the
   **preferred** offered action is to **branch** — create a new alias (e.g. "Milla ↔ channel X") —
   leaving the original and its pinned sets untouched. Rename-in-place is the escape hatch.

5. **Display precedence, evidence-only.** The "as X" line resolves as (1) pinned `resolvedAlias.name`,
   else (2) `rawName` when it differs from the common name (shown **even before registry
   confirmation**), else nothing. We **never auto-paint** an alias onto sets that recorded the common
   name, even on a channel where the alias is confirmed. *Evidence drives display; the channel mapping
   is a suggestion engine only.* This is load-bearing because archive folder names are a
   positional-**unsafe** bag (arbitrary order, possibly incomplete, possibly naming non-participants),
   so nothing may be inferred onto a participant without that set's own evidence.

6. **Capture in two moments.**
   - **Alignment** (folder bag-of-names → which participant): single participant + single name =
     one-click inline; multi/ambiguous = manual assign, names matching nobody evaporate. Each used-name
     is an **editable free-text field pre-filled with the parse** (fix archive typos at the source).
     Output = the correct `rawName` on the right person's `SetCreditRaw`.
   - **Promotion** (captured `rawName` → registered alias): a **derived** review queue over
     `SetCreditRaw` (`getAliasPromotionQueue`), plus a `AliasPromotionDismissal` marker for rejects.
     Confirm creates the alias + channel link + back-fills pins on all matching sets.

7. **Backfill** is an on-demand `scanArchiveForAliases` that re-parses confirmed folders and
   auto-aligns single-participant sets only.

## Consequences

- Near-zero schema change: the only new table is `AliasPromotionDismissal` (mirrors
  `ItemDeletionTombstone` / ADR-0009). Everything else rides existing columns.
- The promotion queue is a **query**, not a stored candidate entity — consistent with how
  co-occurrence is treated as derived (ADR-0022).
- Display surfaces: set hero, set-detail credits panel, person alias-tab corroboration counts, and
  "as X" on the person's own career/set list.
- The `SetParticipant` denormalized cache deliberately carries **no** alias — display must read
  `set.creditsRaw`, never the cache.
- Import files are unaffected (they carry canonical names; `rawName` == common → no "as" line).

## References

- ADR-0008 (imported observations land on baseline), ADR-0009 (re-import review + tombstones),
  ADR-0020 (channel owning label), ADR-0022 (derived connections).
