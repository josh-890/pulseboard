# Before/after collections contain Comparison entities, not flat photos

Decided 2026-06-13 (design review, /grill-with-docs — supersedes the flat SIDE_BY_SIDE rendering shipped earlier the same day).

## Context

ADR-0014 / D8 introduced `MediaCollection.layout = SIDE_BY_SIDE` as a "before/after composite". The first implementation made a SIDE_BY_SIDE collection a flat bag of photos (`MediaCollectionItem`) and rendered *all of them* in one comparison row. In use this was wrong: a collection should hold **many** comparisons, each a small group of images that belong together — not one ever-growing row.

The user articulated the correct model: in a **normal** collection the member is a **single photo** (browse individually); in a **before/after** collection the member should be a **comparison** — "the row of 2…N cells belonging together" — itself browsable as one tile and openable as a unit, exactly like a photo-tile in a normal collection.

The market confirms this is two established patterns, not a novelty:
- **Lightroom stacks** — group N photos into a unit that collapses to one tile (a montage/cover + count) and expands to its members. ([Adobe](https://helpx.adobe.com/lightroom-classic/help/grouping-photos-stacks.html))
- **Clinical before/after (RxPhoto/Canfield)** — a before/after comparison is itself the saved artifact; the side-by-side/slider *is* the object. ([RxPhoto](https://rxphoto.com/resources/blog/how-to-use-rxphoto-for-effective-before-and-after-comparisons))

Two sub-problems also surfaced: how the collection-browser tile should represent a comparison, and how images of differing aspect ratios should sit in a comparison's cells.

## Decision

**A SIDE_BY_SIDE collection contains `Comparison` entities; a `Comparison` is an ordered group of 2…N member photos.**

- **Composition, not reference.** A `Comparison` belongs to **exactly one** collection (`Comparison.collectionId`). It is a curated composition with no meaning outside its basket — not a reusable, shareable asset. (If cross-collection reuse is ever needed, re-make it or add sharing then.)
- **Browser tile = montage, no cover field.** A comparison's tile in the collections browser is an **auto-generated montage of its members** (in before→after order), like a Google/Apple Photos album thumbnail — *not* a single chosen cover image. There is **no cover designation**; the tile is derived from the members.
- **Aspect-driver (independent).** One member is the **aspect-driver** (user-chosen, defaulting to the first; independent of anything else). Its width:height sets the shape of **every** cell in the open comparison — "the frame that best hammers home the intended comparison."
- **Fit mode (per comparison).** How non-driver images sit in the governing-shaped cells:
  - **`COVER` (default)** — fill and crop to the cell, with a **per-cell focal point** (`ComparisonItem.focalX/Y`) controlling what's kept. No letterbox bars; subjects framed consistently.
  - **`CONTAIN`** — letterbox each whole image into the cell. Nothing cropped; bars appear when shapes differ. The escape hatch (e.g. full-body where cropping loses the feet).
- **Viewer.** Opening a comparison shows the cells in a row (governing aspect + fit mode + focal); for exactly 2 members a reveal-**slider** toggle is offered (reuses `ImageCompareSlider`). Members are reorderable (before ↔ after).
- **Stitch-to-JPEG is deferred and is an EXPORT, not data.** Flattening a comparison to one image is a later, separate feature for **external** use (download/share). When built it is an on-demand canvas stitch (the Motif Aligner's bake technique), optionally cached as a raw MinIO object (`Comparison.exportRef`, à la `MotifTemplate.silhouetteRef`) — **no `MediaItem`, no session**. A stitched composite has no honest session to live in (comparisons can be cross-person / global), so it must not become a session-bound gallery asset unless a concrete in-app reuse forces it.

### Data model

```
enum ComparisonFitMode { COVER CONTAIN }

Comparison {
  id, collectionId (→ MediaCollection), sortOrder,
  aspectDriverMediaItemId?,   // null ⇒ first member
  fitMode (default COVER),
  createdAt, updatedAt
}
ComparisonItem {
  comparisonId (→ Comparison), mediaItemId (→ MediaItem),
  sortOrder, focalX?, focalY?
  @@id([comparisonId, mediaItemId])
}
```

`MediaCollectionItem` (flat photos) remains the member type for `GRID` collections. A collection's `layout` determines which member type is in play; switching layout does not auto-convert (re-curate).

## Why

- **Matches how people actually think and how the best tools work** — stacks (DAM) + saved comparisons (clinical). The flat row was an accident of the first cut, not a model.
- **Montage tile over single cover** — a comparison's value is the *relationship* between images; one thumbnail can't convey it, a montage can. And it needs no extra user pick.
- **Aspect-driver + COVER/focal is "alignment by hand."** Uniform, bar-free cells with consistently-framed subjects is what makes images read as comparable — the same reason Aligned images exist (ADR-0013/0014). For raw photos, cover+focal is the manual equivalent; CONTAIN stays for the cases cropping would ruin.
- **Composition (one collection) keeps the model simple** — no many-to-many, no orphan comparisons, no shared-edit surprises — while still giving the photo-like browse/open interaction the user asked for.
- **Export-not-asset for the stitch** keeps the session model honest and avoids a speculative session-less-media change; the live viewer already satisfies every in-app need.

## Considered and rejected

- **Flat photos in a SIDE_BY_SIDE collection** (the shipped first cut). Rejected: a collection holds many comparisons, not one growing row.
- **Comparison as a standalone, shareable asset (many-to-many with collections).** Rejected: a comparison is a composition, not an asset; sharing is a speculative need.
- **Single chosen cover image for the tile.** Rejected by the user: one image can't convey a comparison; use a montage.
- **Cover = aspect-driver (one designation).** Rejected: representativeness and geometry are different jobs; with a montage tile there is no cover at all, and the aspect-driver is independent.
- **CONTAIN (letterbox) as the default.** Rejected: bars + inconsistent subject size undercut "same visual impression"; COVER+focal is the comparison-friendly default, CONTAIN the opt-in.
- **Stitched composite as a session-bound `MediaItem`.** Rejected for now: cross-person/global comparisons have no honest session; use an on-demand export (raw object) instead. Revisit only if in-app reuse is required.

## Consequences

- New `Comparison` + `ComparisonItem` tables + `ComparisonFitMode` enum; the SIDE_BY_SIDE collection detail is reworked to list comparison montage-tiles + a "New comparison" builder; the comparison viewer reuses the compare-row + `ImageCompareSlider` over a comparison's members with governing aspect + COVER/focal.
- Existing SIDE_BY_SIDE collections (flat `MediaCollectionItem`s) are wrapped — each collection's loose items become one initial `Comparison` (order preserved) — so no data is lost.
- `ComparisonItem.focalX/Y` reuses the focal-point convention already used for headshots.
- Stitch-to-JPEG export is explicitly out of scope until the entity + viewer are built and proven.
