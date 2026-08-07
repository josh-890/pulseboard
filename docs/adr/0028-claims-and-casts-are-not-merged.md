# ADR-0028: A folder carries claims, a set has a cast — linking does not merge them

- **Status:** Accepted
- **Date:** 2026-08-07

## Context

Two statements about who is in a set are written independently, and today neither side reads
the other:

- **`ArchiveFolderAttribution`** — your own assertion about an *archive folder*, made in the
  workbench with the cover in front of you (or hand-written in `_people.txt`, ADR-0027).
- **`StagingSet.participants`** — who the publisher credited, delivered by the person import;
  after promotion it becomes `SetParticipant`, itself a cache derived from
  `SessionContribution`.

Linking a folder to a set puts the two in the same place. When they disagree, the same
contradiction currently resolves **three different ways depending on which side was touched
last**, and none of them asks:

1. `confirmArchiveFolderLink` writes the link without looking at the attributions. The folder
   goes on asserting P, the set keeps `{A, B}`, and on promote `SetParticipant` is built from
   the import list — **P is dropped silently**, while the attribution row lives on and keeps
   feeding P's face in the reference ladder from a set P may not be in.
2. `linkFolderToStagingSet` (the workbench develop path) does the opposite: it **unions** P
   into the participants. A third person appears in someone else's cast, unasked.
3. Developing first leaves the import blind — `createStagingSetFromOrphan` never sets
   `titleNorm`, and `findProbableStagingDuplicate` returns null on an empty one, so a
   develop-created staging set can *never* be recognised by a later import. Silent twins by
   construction, not merely by chance.

Measured before deciding: **pulse 0 attributions / 0 confirmed links; xpulse 225 attributions
and 2,871 confirmed links with zero overlap.** The attribution queue only offers folders
*without* a confirmed link (`UNSETTLED_FOLDER`), so the two populations are disjoint by
construction. The contradiction has not happened yet — it becomes live the moment those 225
attributed folders are developed, linked, or have a matcher suggestion confirmed. Every
conflict is created by a human action; the matcher pass only ever writes `SUGGESTED`.

## Decision

**A claim and a cast are different things, and linking places them side by side rather than
merging them.** A claim the cast does not name is a contradiction to decide — never something
folded in silently. Three consequences are worth writing down because each is surprising on
its own.

### 1. Union only when the cast is empty

`linkFolderToStagingSet` may still write a person into a set that names **nobody** (pure
enrichment — that is what the develop path is for) or one that already names them (a no-op).
Where the set names a *different* cast, the person is not added. This matches exactly the
"comparable" test the detector uses, so the two can never drift apart.

### 2. No new state — the detector is the queue

Every available answer mutates data: *the import is right* deletes the attribution, *I am
right* adds the person to the cast, *the link is wrong* unlinks the folder. Each therefore
removes the row from `getAttributionLinkAudit()`, which is computed from the current data
rather than stored. So there is no conflict table, no review status, no migration — and no
second place where the truth could rot. The price is that a row disappears only when
something was really decided; "leave it as it is" is not an answer, by design.

The audit reports `checked` / `comparable` alongside the rows, because a detector returning
0 is worthless unless "nothing disagrees" can be told apart from "nothing was in a position
to disagree" — and while the two populations are disjoint, the second is the true reading.

### 3. On collision, the import's list becomes the cast — the loser survives as a claim

When an import set collides with an already-linked staging set (same channel, exact date,
type and normalised title — the same key `findExistingStagingSet` uses in the other
direction), the import **runs into it** instead of creating a twin: empty stub fields are
filled, the link and anything curated are left alone. The cast then comes from the import,
because the import is the source for whom the publisher credited. Whoever falls out of the
list is **not lost**: a person who came from an attribution still has it, and one added by
hand gets the attribution written onto the folder. The disagreement then surfaces in the
conflict session, with the cover in view.

Choosing union here instead would hide the disagreement permanently — once P stands in the
cast, nothing can detect that the cast ever contradicted the folder.

`createStagingSetFromOrphan` must set `titleNorm` for any of this to fire at all.

## Consequences

- The guard sits at the two creation points (`confirmArchiveFolderLink`,
  `linkFolderToStagingSet`), not at promote: promote is too late, and by then neither claim is
  on screen. `confirmArchiveFolderLink` is the single choke point behind eight UI surfaces.
- The link is still written when a contradiction is found. Refusing (as the cross-label
  promote guard does) would be wrong here: a cast can be legitimately incomplete, so refusing
  would block a correct action in the common case.
- Contradictions are decided in a **workbench session**, not in the maintenance list: deciding
  which side is right without the cover in view is precisely the mistake to avoid. Maintenance
  stays read-only and links into it.
- "I am right" cannot be applied inline to a **promoted Set**: `SetParticipant` is rebuilt from
  `SessionContribution` by `rebuildSetParticipantsFromContributions`, so writing it directly
  would be writing into a cache. That answer hands over to the set's own credit/session
  curation instead.
- Only `CONFIRMED` links are compared; a suggestion is not yet a claim about anything.

See also: ADR-0027 (folder attribution outranks derived suggestions), ADR-0009 (a re-import is
a review-driven merge — its "nothing writes without a click" applies to *curated* records; a
develop-created stub is not one), ADR-0024 (the alias a folder names is channel-scoped).
