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

---

## Addendum, 2026-08-03 — measured at full scale (plan slice 0)

The decision above rested on 69 pairs from 6 already-curated persons, and said so.
The report-only agent has now run against the whole catalogue — 39,090 person
folders, 1,081,639 set rows — joined against 29,322 archive orphans and 482
folders whose answer the app already knows.

**The design holds. Two rules change.**

### What the numbers say

| | probe (6 persons) | full scale | gate |
|---|---|---|---|
| Orphans receiving a suggestion | — | **91.5 %** | registry alone: 23.4 % |
| Unexplained ambiguity | 0.29 % | **0.6 %** | ~1 % |
| Exact recall (ground truth) | 91.3 % | **80.5 %** | ~80 % |
| Matching failures (title disagrees) | 0 % | 5.8 % | — |
| Precision, join run blind | — | **100 % (388/388)** | — |
| Groups with a unanimous suggestion | — | 75.0 % | — |
| Groups with conflicting suggestions | — | 3.8 % | — |

Coverage is the decisive figure: **91.5 % against the 23.4 % the app's own
registry manages**. That gap is the entire justification for reading the
catalogue, and it survived contact with the real data.

Recall came in 11 points below the probe, as the probe's stated bias predicted.
It sits just above the gate, and the failures split evenly between a coverage
limit (6.0 % — the catalogue has no row) and genuine matching failure (5.8 %).

### Precision — the join run blind

Coverage and recall were measured first; precision was not, and precision is what
an operator experiences. Recall restricts candidates to the participants the app
already records, so it *cannot* produce a wrong answer — it only shows that the
right row is findable. An orphan has no such restriction.

Re-running the same ground-truth folders **blind** against all 1,081,639
catalogue rows: **388 exact matches, 388 correct, 0 wrong.**

The sample is hand-curated and therefore the clean end of the population, so this
was designed to be able to falsify the design rather than bless it. Two things
nonetheless make it more than reassurance:

- **It stayed silent when it should have.** 55 of 443 folders produced no blind
  exact match, and among them are the 29 whose set the catalogue does not contain
  at all. That is precisely the situation that manufactures a false positive —
  the real set absent, a different one sharing a date — and the join declined to
  answer instead of inventing one.
- **A messy title costs recall, not precision.** A wrong exact match requires an
  exact title collision on the same date, and that frequency is a property of the
  catalogue rather than of the folder: measured separately at 0.29 % of keys.
  Orphans being untidier should therefore lower how often we answer, not how
  often the answer is wrong.

### Change 1 — read the import file, not cover filenames

The person folder holds a `YYYY-MM-DD_Name_(ICG-ID)` import file whose
`ModelsList` names **every** participant of a set. Cover filenames only ever said
"this set belongs to whoever's folder it sits in", so a multi-person set was seen
whole only if every participant's folder happened to exist — and **22.2 % of
catalogue sets name more than one participant**. The app's existing import parser
reads this format already, including its knowledge that the neighbouring
`ModelsShort` field is unreliable.

### Change 2 — the alias resolves ties; a cross-label channel demotes

Two adjustments the measurements forced:

**The folder's alias token breaks ambiguity.** Most ambiguous folders name their
own answer (`alias "Elina"` against `Elina (EX-004E) | Susana Spears`). The set is
already pinned by date and title; reading which of its *known cast* the folder is
labelled with is not the fuzzy person matching this project forbids — it has the
same standing as the channel tiebreaker. Worth 0.3 % of suggestions.

**A cross-label channel demotes an exact match into review.** Channel remains no
part of the key. But a match whose channel belongs to a *different owning Label*
(ADR-0020) is the likeliest false positive — Hegre and FemJoy do not share sets,
whereas two channels of one label do. This affects **46 exact matches (0.2 %)**:
a negligible cost that removes an entire class of wrong answer. Channel is
therefore: never a filter, a tiebreaker when candidates are equal, and a
**demotion signal** when it contradicts across labels.

### Rejected — widening the date window

Archive folder dates are typed by hand and drift: off by a day, occasionally with
transposed digits. A real case is `2015-05-20 MPLSTUDIOS - Candy` in the app
against `2015-05-21-MPL Kailena - Candy` on disk.

Measured, the phenomenon is real but **small**: retrying every unmatched folder
against plausible slips (±2 days, transposed day digits, month/day swap) with an
exact title rescues **78 folders — 3.1 % of the unmatched, 0.27 % of all
orphans**. Mostly ±1 day (49 of 78); only 6 are transposed digits.

That does not pay for relaxing the key. Exact date is what makes generic titles
usable at all — "Presenting" appears 757 times in the archive yet collides on a
date in under 1 % of its keys — so the window stays closed. Date-variant hits may
be offered as a **review-tier suggestion**, never as an automatic one, and a
relaxed date must always be paired with an *exact* title: two weakened
constraints at once is how false positives are manufactured.

### Still open

The alias tiebreaker compares the folder's token against the catalogue's person
*name*, so a channel-scoped alias defeats it — the archive's `MPL Kailena` is
Sybil A, which the app knows via `PersonAliasChannel` (ADR-0024) and the agent
does not. The registry now ships in the worklist payload (slice 4); wiring it
into the tiebreaker would resolve a further slice of the residual 0.6 %.

### Evidence

`scripts/catalogue-join.ts` (report-only; `--cache` makes re-analysis instant),
logic and thresholds in `src/lib/services/catalogue-join.ts` with 37 unit tests.

## Addendum, 2026-08-03 — the cross-label demotion must fail closed

The demotion above needs **both** labels: the catalogue-side one from the matched
set's channel, and the app-side one from the folder's short code. Where that short
code is not a defined `Channel`, there is no app-side label, the comparison cannot
run — and the suggestion came out looking exactly like one that had passed the
check. A guard that is silent when it cannot run is worse than no guard, because
it is indistinguishable from a guard that ran.

This is *not* a coverage question. The key is date + title; an undefined channel
costs no suggestions at all. It costs only the check.

Measured on xpulse: of 170 distinct short codes across 34,668 folders on disk, 13
resolve to no Channel, covering **64 folders (0.2 %)** — all still unlinked.
Careful per-import channel curation is why that number is small; it is not a
number that stays small on its own as the archive grows.

Two changes:

- **`UNKNOWN_CHANNEL` joins the demotion vocabulary**, emitted when the channel
  disagrees *and* the app-side label cannot be resolved. It never overlaps
  `CROSS_LABEL`: one says the check failed, the other says it ran and objected.
- **`checkUndefinedArchiveChannels()`** (maintenance) names the offending codes,
  and also flags channels with no short code — an archive folder can never resolve
  to those — and channels with no owning Label, which fail open identically while
  looking defined.

The consequence to keep in view: the demotion is only as good as the channel
registry behind it, so the registry's completeness is now itself audited rather
than assumed.

## Addendum, 2026-08-04 — the group is not the unit of decision

Slice 5 made the (channel, alias) group the thing you confirm. Use disproved it
within days: `AA | Anna` collects folders that share an alias, not folders that
share a person, and one click could have attached the wrong woman to dozens of
sets. The operator's own conclusion is the sharper argument — a bulk button over
a large group saves nothing, because the visual check it requires *is* the
per-item work, only now performed without a per-item commit to record it.

Five systems solving "does this record belong to this identity?" agree, and none
of them were consulted when slice 5 was designed:

- **FamilySearch** record hints: per-record confirm against side-by-side evidence,
  **no bulk accept exists**, and the published guidance is explicitly not to
  resolve many hints at once.
- **Apple Photos**: batch confirm pulls in look-alike faces and, unnoticed,
  **merges two people into one album** — this failure, in a flagship product.
- **digiKam**: "unconfirmed" is a first-class state; one wrong confirm breeds many
  wrong suggestions. Its users' standing complaint is the missing undo.
- **MusicBrainz Picard**: the cluster proposes, the track commits; per-item
  confidence and per-item correction before anything is written.
- **Prodigy / Label Studio**: near-binary questions, one label per pass, keyboard
  shortcuts — a measured **>10x** throughput gain over compound review.

**Decision.** The folder is the unit of decision. The group survives as *context*
— it is what puts two Annas next to each other where they can be told apart — and
retains only the verdicts that are genuinely about a group: `NOT_A_PERSON` (the
largest group in the archive is a magazine title across 204 folders) and `SKIPPED`.

Speed comes from the keyboard, not from breadth: `a a a x a` is faster than any
sweep that must be visually pre-verified, and it cannot go wrong at scale.

**Consequence.** Identity and development become two passes over the same folders,
which is the split the annotation evidence recommends and which the user had
already reached independently. `ArchiveFolderReview` carries both states so a
folder's position in either pass is explicit rather than inferred.
