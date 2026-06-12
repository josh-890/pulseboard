# Aligned images are baked derived copies, not render-time transforms

Decided 2026-06-12 (design review, /grill-with-docs — not yet implemented; generalises existing Motif headshot behaviour).

## Context

The Motif Template system (landed 2026-06-05) standardises profile-slot headshots by post-hoc image registration: the user clicks template keypoints on a source photo, a Umeyama 2D similarity transform (`lib/image/similarity-transform.ts`) maps them to target frame fractions, and the result is **baked** to a new framed `MediaItem` carrying `motifTemplateId` + `motifProvenance` (`{ sourceMediaItemId, points, matrix }`).

We are generalising this "same visual impression" mechanism to three new surfaces — per-person detail loci (eyes), a cross-person comparison grid (the **Atlas**), and curated before/after composites. All three depend on producing a comparable image from a source. That forces an explicit decision about **what an aligned image *is*** relative to its source: a baked pixel copy, or a non-destructive transform (matrix + template) replayed at render time.

The market analog matters: clinical tools (Canfield *MatchPose*, RxPhoto, Consentz "ghosting") achieve comparability at **capture** time via live ghost-overlay registration. Pulseboard works from a fixed archive, so it must register **post-hoc** — and the comparison artifact (a grid tile, a before/after pane) needs to be stable and self-contained regardless of what later happens to the source.

The source itself is not stable: a person's photos may live in **production sessions** and be linked (`PersonMediaLink`), and those originals can be re-cropped, re-tagged, moved between sessions, or removed. A comparison that depended on the live source would silently break or drift.

## Decision

**An Aligned image is a baked pixel copy** — a new `MediaItem` in the person's **reference session** — that **retains provenance** (`sourceMediaItemId` + template id + transform matrix). It is a *derived copy with decoupled identity and retained lineage*, never a render-time transform and never a link to the production original. This is the same storage pattern headshots already use; we are committing to it as the general rule.

- **Baked, not replayed.** The comparable pixels are flattened once and stored. Grids and composites serve pre-baked variants (cache-friendly, exportable, render-cheap).
- **Lives in the reference session.** Like the existing headshot bake and like raw production→reference copies (`copiedFromMediaItemId`).
- **Provenance retained, not orphaned.** `motifProvenance` keeps the source id, clicked points, and matrix — so the alignment is re-openable in the aligner, re-bakeable, and staleness-detectable against its source.

## Why

- **The comparison artifact must be stable.** A before/after pane or an Atlas tile is a published comparison; it cannot depend on a production source that may later be re-cropped or reorganised. Baking insulates it.
- **Consistency with a proven path.** Headshots already bake. Choosing transform-at-render for the general case would create two contradictory models for the same act of alignment.
- **Export is trivial.** A baked copy *is* a file — exporting a side-by-side or a grid needs no on-demand flatten.
- **The cost is bounded.** The duplicate-pixels objection only bites at scale; alignment here is explicitly **manual and curated, never bulk** (the user must click keypoints per image). Duplicate storage for a hand-curated set is acceptable.
- **Lineage keeps it honest.** Provenance means the copy is not an orphan — it can be re-derived and audited, and a future "source changed since bake" signal is possible.

## Considered and rejected

- **Non-destructive transform at render** (store matrix + templateId on a link, apply via canvas/CSS per tile). Rejected: the aligned view breaks or goes stale if the source is edited/moved/deleted; exporting a composite requires an on-demand flatten; and it contradicts the existing headshot bake. The single upside (no duplicate pixels) is not worth it given alignment is manual/curated, not bulk.
- **Link to the production original, aligned on the fly.** Rejected for the same stability reasons, more acutely — production sessions are actively reorganised.
- **Bake but drop provenance ("unrelated copy").** The user's first framing. Rejected: throwing away `sourceMediaItemId`/matrix kills re-alignment, audit, and staleness detection. The copy must retain lineage.

## Consequences

- The generalised aligner reuses the existing bake leg: source master → similarity transform → new `MediaItem` in the reference session with `motifTemplateId` + `motifProvenance`.
- Aligned-ness is **derivable** (has alignment-template binding + bake provenance); visibility falls out of it (hidden from the main raw gallery, shown in its category grid / Details tab / Collections) without a separate hand-set flag.
- **Aligned image ≠ Annotation.** Aligned images must NOT borrow `isAnnotation` (the existing crop/highlight derivative flag). The current headshot bake's reuse of `isAnnotation=true` is the one conflation to fix when this lands. See ADR-0014 and CONTEXT.md "Flagged ambiguities".
- Storage grows with curation, not with the gallery — acceptable by the no-bulk premise.
- The bake leg needs the source **master** image; dev MinIO is frequently down, so the click→bake→aligned-copy chain must be confirmed on prod.
