# ADR-0031: A transferred cover is not always a stand-in

- **Status:** Accepted
- **Date:** 2026-08-16

## Context

Promoting a staged set copies its cover into the production Set as a MediaItem
(`transferStagingCoverToSet`). `createMediaItemDirect` then assigns it as the
cover under a first-come rule — "cover it if the set has none" — and that rule
has no way back: uploading the set's own images afterwards leaves the cover
untouched, because the slot is no longer empty.

Two unrelated images arrive through that one path:

- **The publisher's cover art**, downloaded by the import and stored under
  `staging/{stagingSetId}/…`. Up to 1200 px, and a *different photograph* from
  anything in the set — measured, not assumed: on xpulse the nearest set image is
  14–19 bits away in dHash, where the same picture scores 0–6. This is the image
  the transfer exists to preserve, and the reason the transfer was reported as a
  bug when it did not happen.
- **An archive thumbnail**, made by the app from one of the folder's own images
  so a set developed from an orphan folder shows something at all. 512 px, stored
  under `archive/{archiveKey}/…`. Once the folder is uploaded, the same picture
  is in the set at full size and this is a small duplicate holding the cover slot.

Neither carried a `hash` or a `phash`, so both were invisible to `/media/similar`,
which only loads candidates whose perceptual hash is non-null — the one surface
that could have shown the duplicate.

## Decision

**A cover is provisional when it came from `archive/`, and never otherwise.**
`Set.coverIsProvisional` records this. A provisional cover holds the slot until a
real image of the set arrives, then steps aside; a publisher cover holds it for
good. An explicit pick (`setSetCover`) clears the flag — what you chose is not a
stand-in — and one stand-in never displaces another.

**The transfer computes `hash` and `phash`**, like every upload, and stores under
`session/{sessionId}/…` where the set's other pictures live. The prefix was never
load-bearing (the MinIO audit lists objects and matches `MediaItem.variants`;
deletion uses explicit keys), but `set/{setId}/…` made these items look like a
separate species in every listing.

## Consequences

- 437 covers on xpulse predate this. They get a **`phash` only**
  (`scripts/backfill-transferred-covers.ts`): `hash` means "the bytes you handed
  me" and those bytes are gone — only the re-encoded master survives. All of them
  are publisher covers, so **none is marked provisional and none is replaced**.
- The first cut of that script did replace them, on the belief that a transferred
  cover is always a small duplicate. It would have handed 430 sets' covers to an
  arbitrary set image and lost the publisher's art. What caught it was checking
  the dHash distance to the set's own images before running: 14 and 19, not 0.
  **The origin is a fact in the data; do not infer it from the size.**
- A staged set whose `coverImageUrl` is an external URL still transfers nothing —
  the app never fetches external media, and those rows keep the URL as provenance.

See also: ADR-0027 (a folder attribution outranks derived suggestions).
