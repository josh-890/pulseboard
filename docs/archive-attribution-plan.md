# Archive attribution — implementation plan

Execution plan for ADR-0027. Six slices, each independently valuable and each leaving the
system coherent, so work can stop after any of them.

The ordering is deliberate: the two cheapest slices pay off on **today's** imports without
any catalogue machinery, and the measurement slice retires the plan's biggest unknown before
anything is built on top of it.

| # | Slice | Depends on | Value if you stop here |
|---|---|---|---|
| 0 | Catalogue reader, report-only | — | Real numbers at full scale; no code to maintain |
| 1 | Credit → Contact | — | ICG-IDs survive promotion on every normal import |
| 2 | Exact-date tier in `matchSet` | — | Import matching stops missing cross-channel sets |
| 3 | Suggestion pipeline | 0 | Suggestions exist and are inspectable; nothing materialises |
| 4 | Group confirmation + materialisation | 1, 3 | The actual workflow |
| 5 | Folder attribution (`_people.txt`) | 4 | Hand-written assertions feed the same pipeline |

---

## Slice 0 — Catalogue reader, report-only

**Why first.** ADR-0027's recall figure rests on 69 pairs from 6 already-curated persons — a
small, favourably-biased sample, and the ADR says so. This slice replaces it with the real
distribution across the whole catalogue, and it writes nothing, so a bad result costs one
afternoon instead of a feature.

**Build.** `scripts/catalogue-join.ps1` (+ `.ts` if it is ever run outside Windows — see the
parity note below). Walks the `<Initial>/<Common_Name_(ICG-ID)>/_meta/{_Cover,_Videos}` tree,
parses each cover filename with `^(\d{4}-\d{2}-\d{2})-(.+?)-(\d+)-(.*)\.jpe?g$` into
`{icgId, date, channel, extId, title, isVideo}`, pulls the orphan list from a new read-only
`GET /api/archive/attribution-worklist`, joins locally on exact date + normalised title, and
**prints a report**. No POST, no new tables.

**Report must answer:** recall against currently-linked folders (ground truth, as in the
probe); join-key ambiguity at full scale; how many orphans get ≥1 suggestion; the group-size
distribution; catalogue rows with unusable dates (`0000-00-00` was 2.6 % in the sample); and
the channel-name normalisation gap (`AMOUR ANGELS` ↔ `AmourAngels`).

**Verify.** Re-run the probe numbers against the 6-person sample first — the script must
reproduce 91.3 % exact recall and 0.29 % ambiguity before its full-scale output is trusted.

**Decision gate.** If full-scale ambiguity is far above the sampled 0.29 %, or recall far
below, stop and revisit ADR-0027 rather than continuing.

---

## Slice 1 — Credit → Contact

**Why.** Independent of everything above. Today `promoteManualStagingSet` writes unknown
participants as `SetCreditRaw { rawName, resolutionStatus: 'UNRESOLVED' }` and silently drops
the ICG-ID (`import-executor.ts:1485`), even though the staging set holds it in
`participantStatuses[].icgId`. **Every ordinary import already loses the key this way.**
Fixing it now means the catalogue work later inherits a promote path that preserves identity.

**Changes.**
- `prisma/schema.prisma`: `SetCreditRaw.resolvedContactId String?` + relation to `Contact`,
  `@@index([resolvedContactId])`. Hand-written migration — `migrate dev` is broken in this
  repo (shadow-DB enum issue); use `migrate deploy` and `scripts/deploy-migrations.sh` so
  **both** tenant DBs get it.
- `import-executor.ts` (~1485): for an unknown participant **with** an ICG-ID, upsert a
  `Contact` (name + icgId, `source: 'archive'`) and set `resolvedContactId` on the credit.
  Name-only participants keep today's behaviour exactly.
- `relationship-service.ts`: `repointContactToPerson` must also repoint
  `SetCreditRaw.resolvedContactId → resolvedPersonId` and flip `resolutionStatus` to
  `RESOLVED`, alongside the `ClaimedCollaboration` / `PersonRelationship` repointing it
  already does. **This is the slice's real risk** — miss it and credits orphan silently when
  a Contact is promoted.
- Display: show `Name (ICG-ID) — not yet curated` wherever unresolved credits render
  (`credit-resolution-panel.tsx`, the set hero credits).

**Verify.** Unit test for the repoint (a credit pointing at a Contact must end up on the
Person after `reconcileContacts`). Playwright: promote a staging set with a participant that
has an ICG-ID but no Person → credit shows the ID; then create that Person → credit resolves
by itself. Both tenants (`withTenantFromHeaders`).

**Invariant to preserve:** a Contact is never a participant — no `SessionContribution`, no
`SetParticipant`.

---

## Slice 2 — Exact-date tier in `matchSet`

**Why.** `matchSet` Tier 2 (`matcher.ts:253`) hard-ANDs `c."nameNorm" = channelNorm`, so a
set published under a different channel than it is filed under can never match.

**Do not simply drop the channel condition.** Tier 2 also uses a ±30-day window and a 0.6
title threshold; removing the channel gate there would widen an already-loose tier and invite
exactly the wrong-merge class the code comments warn about. Instead **add a Tier 2b** that
runs only when Tier 2 misses: **exact date** (not ±30 days) + title similarity ≥ 0.75,
channel ignored for filtering but used to break ties when several candidates survive. The
exact date is what buys back the precision the channel was providing — measured ambiguity on
that key is 0.29 %.

**Verify.** Unit tests over the tier ladder: a same-channel set still matches at Tier 2; a
cross-channel set with the same date+title matches at 2b; a same-title set on a *different
date* still does not match at all. Then re-run an existing import batch and diff the match
outcomes — no previously-correct match may change.

---

## Slice 3 — Suggestion pipeline

**Why.** Turns slice 0's report into stored, inspectable suggestions. Still materialises
nothing.

**Changes.**
- New model `ArchiveFolderSuggestion { archiveFolderId, icgId, name, source, score, evidence Json, createdAt }`
  with `@@unique([archiveFolderId, icgId, source])`. `source` ∈ `CATALOGUE | REGISTRY | FOLDER_ATTRIBUTION`
  — the rank order from ADR-0027. `evidence` records what matched (catalogue date/title/extId,
  or the alias that resolved) so a suggestion can always be explained.
- `POST /api/archive/attribution-suggestions` — the agent posts matches in batches. Replaces
  suggestions per `(folder, source)`, so a re-run is idempotent.
- `catalogue-join` gains `--post` (default stays report-only).
- Group aggregation service: derive `(parsedShortName, aliasToken)` groups over orphans, and
  per group the vote tally across member folders' suggestions.

**Verify.** Idempotence: run the agent twice, suggestion count is unchanged. A group with a
known-correct answer aggregates to that answer. Spot-check that `evidence` explains each
suggestion.

**Stop here and** you have a queryable "who is probably in this folder" layer with nothing at
risk — useful on its own for spot lookups.

---

## Slice 4 — Group confirmation + materialisation

**Why.** The actual workflow. This is the only slice that writes person data.

**Changes.**
- `/archive/attribution` — groups sorted by leverage (folder count), showing the suggested
  person with vote counts and dissent, member folders with thumbnails, and per group:
  **confirm** · **not a person** · **split** · **skip**.
  "Not a person" is mandatory, not polish — the single largest group in the archive is
  `W4B | w4b magazine` with 204 folders, and it is a magazine title.
- Confirm → for each member folder: `createStagingSetFromOrphan` (exists), then
  `addStagingSetParticipantAction` (exists) with the confirmed person or Contact.
  Reuses the existing path end to end; this slice adds the *driver*, not new plumbing.
- Dissenting folders inside a confirmed group are **not** auto-assigned — they drop into a
  per-folder review list.

**Open, deliberately.** Whether a confirmed strong match lands as a lingering StagingSet or
goes straight to a Set is a workflow choice, not an architecture one (ADR-0027 leaves it
open). Decide it with the UI in front of you. Bypassing keeps the staging list an exception
queue; staging everything keeps one review surface but ~30k rows in it.

**Verify.** Playwright over a small group: confirm → member folders become staging sets with
the right participant; "not a person" → group disappears and does not return on re-run.
Both tenants. Then the usual cleanup question before finishing.

**Risk.** This is the first slice that can create wrong data at volume. Ship it behind a
per-group confirm only — no "confirm all visible" button until the error rate is known.

---

## Slice 5 — Folder attribution (`_people.txt`)

**Why.** The hand-written escape hatch, and the highest-ranked source. Last because it is
only useful once slices 3–4 exist to consume it.

**Changes.**
- `archive-scan.ps1`: read `_people.txt` per leaf, parse `Common Name (ICG-ID)` per line
  (validate against `ICG_ID_RE` from `src/lib/icg-id.ts`), send with the folder record.
- Ingest writes them as `FOLDER_ATTRIBUTION` suggestions, which outrank catalogue and
  registry and need no group vote.
- Document that picking these up needs `-Force`: NTFS does not bump a directory's mtime when
  a file inside it is edited, so an edited attribution is invisible to the leaf-mtime skip.
  `-Path` + `-Force` already exist for exactly this.

**Verify.** Write a `_people.txt`, run a scoped forced scan, confirm the attribution appears
and outranks a conflicting catalogue suggestion. Malformed lines must be reported, not
silently dropped — that is how HTML-polluted ICG-IDs got into the data before.

---

## Cross-cutting

**Parity.** ADR-0017's dual-language rule applies to the **re-bake agent** only.
`archive-scan.ts` is Targeted-only and has no Full mode, so there is no twin to mirror for
scan-side work. A new `catalogue-join` agent should be written in **one** language
(PowerShell, where the data lives) unless there is a concrete reason for two.

**Migrations.** Two hand-written migrations (slices 1 and 3), both through
`scripts/deploy-migrations.sh` so `pulse` and `xpulse` stay in step.

**Docs.** `docs/architecture.md` after slices 1, 3 and 4 (new model, action, route, page);
`docs/user-guide.md` after slice 4 (the workflow) and 5 (the file format). `CONTEXT.md` only
if a new domain term appears — the vocabulary is already recorded.

**Scale check before slice 4.** Full coverage means ~30k Sets against today's 478. Re-check
`/sets` and `/people` list performance against a realistic row count before turning the
workflow loose, not after.
