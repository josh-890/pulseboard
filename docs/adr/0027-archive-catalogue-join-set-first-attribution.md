# ADR-0027: Archive ↔ person-catalogue join, set-first attribution

- **Status:** Accepted
- **Date:** 2026-08-02

## Context

Two catalogues describe the same world from opposite sides, and both are incomplete.

The **app** reasons from the Person outward: career → Sessions → Sets, where a Set is the
*evidence* of participation. Sets enter almost exclusively through per-person import files.
The **archive** is physical reality — what is actually owned, filed by publishing channel
and date. Their overlap is small, and the gap is not symmetric:

- **34,662** archive folders, **2,609** linked (7.5 %). **32,053 orphans** — 92.5 % of the
  archive is invisible to the app.
- Channels never covered by an import file have no entry path at all, so participation in
  them cannot appear in any career.
- Conversely, most app-known Sets exist only as metadata, with nothing on disk.

The reflex is to call this a modelling gap. It isn't — the path already exists and is exact:
`createStagingSetFromOrphan` turns an orphan into a StagingSet, the staging panel's person
typeahead searches by name **or ICG-ID** and writes `personId` + `icgId`, and promotion
produces `SetParticipant`. It has been used **8 times against 32,053 candidates**. The
bottleneck is throughput, not capability.

Grouping helps but does not rescue it. 99.9 % of orphan folder names yield a participant
token, collapsing to **8,891 (channel, alias) groups**; the top 1,000 cover 48 % of folders.
But the existing registry — every Person plus 1,382 Contacts — resolves only **23.4 %**.
For **74 %** the folder names someone the app has never heard of. That is 7,132 research
tasks, not 7,132 confirmations, and grouping alone leaves the workload in the same order of
magnitude it started in.

What changes the arithmetic is that the identities already exist on disk: a **person
catalogue** of `<Common_Name_(ICG-ID)>` folders — ~40k persons, each with covers whose
filenames encode `date-CHANNEL-extId-title` for every set they worked on. Six sampled
persons alone yielded 3,748 sets, so the catalogue is orders of magnitude larger than
anything the app should hold.

## Decision

### 1. Archive coverage is the relevance filter

Physical possession decides what deserves to exist in the app. The two catalogues are
joined, but **only the intersection is materialised**. The person catalogue is read on the
host that owns it and never ingested wholesale — the same principle as ADR-0017's re-bake
agent, where the heavy data never leaves the machine. This is structural, not disciplinary:
the app cannot inflate to catalogue scale because it never sees the catalogue.

### 2. Date + title is the join key; channel is corroboration and tiebreaker, never a gate

Measured against 69 known-good pairs (archive-linked Sets whose participants are in the
sample), the join recovered **91.3 % on exact title, 100 % of everything the catalogue
actually contained**. All 4 misses were `best = 0.00` — the catalogue had no set for that
date at all, in channels (VIPN, ULT, MTDR) already measured as uncovered.

Channel must not gate the join. `matchSet` Tier 2 currently hard-ANDs
`c."nameNorm" = channelNorm`, which would systematically miss real cases. The observed
divergence is mostly **naming**, not semantics — `AMOUR ANGELS` / `AmourAngels`,
`1BY-DAY` / `1ByDay`, `METART-X` / `MetArtX` — with genuine cross-channel publication as a
smaller residue.

Generic titles are a real hazard *for titles alone*: "Presenting" occurs 757 times. The date
disambiguates almost completely — across 29,305 keyed orphans there are 29,263 distinct
keys and only **42 colliding keys, 84 folders, 0.29 %**. "set" and "casting" titles collide
**zero** times; "presenting" collides in 0.9 % of its keys.

Collisions fall into two kinds, each with an independent discriminator: a different person
(resolved by the folder's alias token) or a different channel (resolved by the channel).
**This is where channel earns its keep** — not as a filter, but as the tiebreaker in the
0.29 % where the primary key is ambiguous. Anything still ambiguous goes to review.

### 3. The (channel, alias) group is the unit of confirmation; the catalogue votes per folder

The catalogue matches **per folder**; decisions are made **per group**. Per-folder hits
aggregate into a group-level suggestion, so a group of 151 folders backed by 134 agreeing
hard matches is one decision, not 151. Disagreement inside a group is itself a signal — it
marks exactly the folders where more than one person is involved.

This makes single spelling errors and corrupt rows harmless: one bad row cannot move a
group. The 4,413 single-folder groups get no such protection and rest on one match each.

### 4. Nothing materialises without confirmation

The catalogue is a **suggestion provider**, never an author. Automatic is the *suggestion*;
confirmed is the *materialisation*. Confirmation is the only door into the database. This
keeps the project's standing rule — established when the fuzzy trigram tier was removed in
2026-05-26 and reaffirmed by ADR-0026 — that no person is ever assigned automatically from
a name.

### 5. A promoted credit points at a Contact, so the ICG-ID survives

Today `promoteManualStagingSet` writes unknown participants as
`SetCreditRaw { rawName, resolutionStatus: 'UNRESOLVED' }` and **drops the ICG-ID**
(`import-executor.ts:1485`). The staging set holds it in `participantStatuses[].icgId`; only
the name survives promotion. Later resolution therefore falls back to name matching — the
exact ambiguity this whole design exists to defeat.

`SetCreditRaw` gains `resolvedContactId`. A participant with a known ICG-ID but no curated
Person creates or reuses a **Contact** (ADR-0022) and the credit points at it. The unique key
survives, the set displays `Anna Y (AY-006S) — not yet curated` instead of a bare name, and
`reconcileContacts` repoints the credit by itself once the Person appears — the same
mechanism already used for `ClaimedCollaboration` and `PersonRelationship`.

A Contact is still **never a participant**: it has no career, so it produces no
`SessionContribution` and no `SetParticipant`.

### 6. A folder attribution outranks every suggestion

`_people.txt` in an archive folder — one `Common Name (ICG-ID)` per line, hand-written — is
the owner's **assertion**, not a proposal. It wins over catalogue and registry alike and
needs no group vote. Deliberately a separate plain-text file rather than a field in the
app-written sidecar, so a hand-edit cannot corrupt the sidecar and the app cannot overwrite
the hand-edit.

This requires the scan's leaf-mtime skip to be defeatable, which is why `archive-scan.ps1`
gained `-Force` (and `-Path` for scoping) ahead of this ADR: NTFS does not bump a directory's
mtime when a file *inside* it is edited, only when an entry is added, removed or renamed — so
an edited attribution is otherwise invisible to the scan.

## Consequences

- Full coverage means roughly 30k Sets, up from 478. That is accepted: it is what makes
  channels absent from every import file part of a career at all.
- The staging list must not become an archive mirror. Whether strong matches bypass it is
  deliberately **left open** — the measurement supports either, and it is a workflow choice.
- `matchSet` Tier 2 needs its channel condition demoted before any of this runs.
- The join surfaces archive duplicates as a by-product: the one ambiguous case in the sample
  was the same set filed twice under two aliases of one person
  (`Gina Gerson` / `Gina G`, 2018-04-22, "Explicit").
- ~2 % of orphans (585 folders across 56 channels, largest PJG 149 and YON 128) are in
  channels the catalogue never covers. They stay manual, permanently.
- Evidence quality: the recall figure rests on **69 pairs from 6 already-curated persons** —
  a small and favourably-biased sample. It shows the method works; it does not prove it
  holds at 29,320 orphans.

## Alternatives considered

- **Archive as a second system of record** (participation authored in the sidecar). Rejected:
  it would make career facts as fragile as a folder that gets renamed, re-downloaded or
  deleted — the failure mode already observed when renames silently broke the HD re-bake
  path, since `MediaItem.filename` is frozen at upload and no scan ever rewrites it.
- **Bulk-importing the person catalogue.** Rejected: ~40k persons and millions of set rows,
  the overwhelming majority of which will never be curated.
- **Attribution without creating Sets** (a note on the ArchiveFolder). Rejected: career
  manifests through Sessions evidenced by Sets, so a record that is not a Set appears in no
  career path — it would satisfy the letter of the request and none of its purpose.
- **Contacts as real participants.** Rejected: breaks the premise that participation is a
  person's career fact.
- **Requiring an exact source hash** rather than aspect for archive integrity. Tried and
  reverted the same week: the archive routinely holds a *higher-resolution rendition* of the
  uploaded file, which never shares a byte hash — the check rejected precisely the images the
  re-bake exists to sharpen (0 re-bakes, 26 false mismatches).

## References

- `hd-rebake-service.ts`, `archive-service.ts` (`createStagingSetFromOrphan`,
  `scanArchiveForAliases`, `markGhostFolders`), `import-executor.ts:1485`,
  `matcher.ts:253` (`matchSet` Tier 2).
- ADR-0009 (re-import review), ADR-0017 (agent pattern: heavy data stays put),
  ADR-0022 (Contact ghost register), ADR-0024 (channel-scoped alias truth),
  ADR-0026 (ICG-ID exact-only, self-assigned IDs).
- Glossary: **Archive**, **Person catalogue**, **Folder attribution**,
  **Archive coverage as the relevance filter** in `CONTEXT.md`.
