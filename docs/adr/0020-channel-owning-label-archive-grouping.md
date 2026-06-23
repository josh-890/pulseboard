# Channel → owning Label: production grouping for archive matching and set merge

Decided 2026-06-23 (design review, /grill-with-docs). Implementation pending —
see `docs/channel-label-archive-plan.md`.

## Context

The archive on disk was organised **channel-first**: each publication channel got
its own folder branch, because the channel code is the one thing resolvable
straight from the media (`yyyy-mm-dd-CHNL …`). Over time this produced an
unbalanced, leaky tree:

- **Media-type splits** (`Channel-ARCHIVE`, `Channel-Video`) added as standalone
  branches, although the photo/video split is already carried by `isVideo` + the
  separate photo/video roots.
- **Same-label minor-name splits** — channels differing by a trivial name element
  but clearly one producer.
- **Empty placeholder branches** created only to mirror the import file's channel
  paths for future sets.
- Import files name a Set's channel at one granularity (e.g. `HANDSONHARDCORE`)
  while the physical folder uses another (e.g. `DDF-DDFNetwork` / `…-DDF …`).

Three operations keyed on **Channel**, which is the *fine, emergent-stub* level:
the archive auto-matcher, the merge guard (`channelId` equality,
`set-merge-service.ts:110`), and the user's first sort rule. Whenever the import
channel and the archive folder belong to the same producer but differ in name,
every channel-keyed operation fought the user, and the merge guard actively
**blocked** consolidating an import-born Set with its archive-born counterpart.

The domain already separates the tiers (CONTEXT.md → *Production & publication*):
a **Session** *produces* (owns the generated media, `Session.labelId`); a **Set**
*publishes* (a packaged subset of a session's media, released via one Channel); a
**Label** is the production unit; a **Channel** is the publication frontend, *part
of* one Label. Labels are **emergent**, like Eras: a new channel spawns a stub
label, and channel↔label groupings are discovered over time.

Crucially, the user's intended model is **already implemented through the M:N
evidence map**: `createChannelRecord({ labelId })` writes a `ChannelLabelMap` at
`confidence 1.0` (channel-service.ts:86), and set import derives the Session's
label from `channelLabelMap.findFirst({ orderBy: { confidence: 'desc' } })`
(import-executor.ts:1029). The owner relation exists; it is just stored as a fuzzy
M:N map and read non-deterministically.

## Decision

**A Channel has exactly one owning Label, and the production grouping — not the
publication channel — is the key for archive matching, dedup, and set merge.**
Physical path identity stays on the Channel; the Label is logical.

### Schema

- Add **`Channel.labelId`** (nullable FK, 1:N Label→Channels) — the single
  *owning* label. Backfilled from `channelLabelMap.findFirst(confidence desc)`, so
  resolution is **byte-identical to today** the moment it lands.
- **`Channel.channelFolder` and `Channel.shortName` stay on the Channel.** They are
  the physical disk identity (the frozen archive branch + the `CHNL` code in the
  folder name) and the channel is the only signal resolvable from media. The Label
  gets **no** archive-path fields — a single `Label.shortCode` would desync from a
  frozen disk whose folders carry heterogeneous per-channel codes.
- `ChannelLabelMap` is **retained**. During migration it is dual-written and is the
  live safety net for every unmigrated reader. Long-term it holds only *secondary /
  cross-label* evidence (co-productions, a channel that historically carried
  another label's content); the `confidence 1.0` "owner" semantics move to
  `Channel.labelId`.

### Behaviour

- **Archive matcher**: physical resolution (folder code → Channel via
  `chanFolderName` / `shortName`) is **unchanged**. The new step is grouping —
  Channel → owning Label — so an import-born Set and an archive-born folder that
  share a producer become matchable even when their channel names differ.
- **Merge guard** re-keys from `channelId` to the **owning Label**:
  - **Block** when the two Sets' channels resolve to **different owning Labels**
    (cross-producer — almost always a wrong-target accident).
  - **Block** when the two Sets differ in **`SetType`** (photo vs video are
    session *siblings*, `StagingSet.siblingId`, never duplicates). Re-keying to
    Label widens the candidate net, so this exclusion must be explicit.
  - **Allow, with explicit confirmation**, when they share the **same owning
    Label and same `SetType`** across different channels.
- **Consolidation is curation**, never automatic — grouping several channels under
  one Label is the analogue of promoting a draft Era to a curated one. Empty
  placeholder branches become unnecessary (the app suggests paths; unmatched sets
  stay unlinked until a folder exists) but are never auto-deleted.

### Frozen disk / photo+video invariant

No files move. Photosets and videosets live on separate, multi-root root-groups;
the **same** channel branch name and the **same** set-folder name may appear under
both (photos on a photo root, the session's video on a video root) as two distinct
`ArchiveFolder` rows (`fullPath @unique`, `isVideo`). Owning-Label resolution is
root-agnostic, so both presences resolve to one Label while staying separate rows.

## Why

- **Formalises existing behaviour, not a rewrite.** `Channel.labelId` is a faithful,
  mechanically-backfillable replacement for `findFirst(confidence desc)`; the import
  channel-linking workflow is untouched.
- **Fixes the import↔archive friction at its root** — both sides resolve *to the
  Label*, so divergent channel names stop blocking matches and merges.
- **Keeps the one hard signal intact.** Physical identity stays where it is
  resolvable (the Channel); the Label adds grouping without touching the disk.
- **Deterministic.** A single owning FK replaces a non-deterministic `findFirst`
  over a fuzzy M:N map.

## Considered and rejected

- **Keep Channel↔Label purely M:N and compute a primary on the fly** (highest
  confidence). No migration, but leaves the join key non-deterministic and fragile —
  the exact soft-attribution problem we're removing.
- **Channel→channel aliasing only** (resolve the import's umbrella name to the
  archive's detailed channel). Solves the naming mismatch but not the same-producer
  dedup or the merge guard, and hard-codes the channel-centric assumption being
  retired.
- **Move folder code / `shortName` onto the Label.** Would desync from the frozen
  disk for any consolidated label spanning heterogeneous historical codes, breaking
  matching. Retracted during review.
- **Physical reorg to label-umbrella folders.** Clean end-state but huge, risky disk
  churn while labels are still emerging. Left as an optional future tool.
- **Make Set multi-channel / production-level.** Rejected: a Set *is* a publication;
  the production object is the Session. Two channel-publications of one subset are
  two Sets sharing one body of session media, not one multi-channel Set.

## Consequences

- Two derivation paths for "a set's label" exist during migration (the live
  `ChannelLabelMap` and the new `Channel.labelId`); they are dual-written and must
  agree until every reader is switched. See the phased plan.
- `ChannelLabelMap`'s meaning shifts from "owner (conf 1.0) + evidence" to
  "secondary/cross-label evidence" only — *after* the reader migration completes,
  not in the schema-add step.
- The merge guard becomes Label-aware and SetType-aware; its candidate query widens,
  so the photo/video sibling exclusion is now load-bearing and must be tested.
- A channel with no owning label (legacy / unlinked) yields a null `labelId`; the
  matcher and merge guard must treat null-label as "no grouping" (fall back to
  channel identity), never as "matches other null-label channels".
