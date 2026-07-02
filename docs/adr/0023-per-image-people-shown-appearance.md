# ADR-0023: Per-image "people shown" appearance

- **Status:** Accepted
- **Date:** 2026-07-02

## Context

A Set or Session can have several contributing people — multiple talent in one
production session, or a Set that collects media from **different sessions with different
people**. But an individual photo usually shows only a **subset** of that cast. Until now
Pulseboard tracked "who's involved" only at the set/session level (`SessionContribution`
→ `SetParticipant` cache) with no per-image resolution, so you couldn't record that image
#7 shows only Person A, or filter a gallery to just the images a person appears in.

Every `MediaItem` belongs to exactly one `Session` (`sessionId` non-null), and a MediaItem
can belong to multiple Sets (`SetMediaItem`). So the natural anchor for appearance is the
**image**, whose session already defines the relevant cast.

## Decision

Track "people shown" **per `MediaItem`**, stored as **exclusions**:

- The **default** shown set for an image = its session's on-camera cast — the session's
  `SessionContribution` **Persons**, excluding the `Behind Camera` role group
  (ADR-0021: on-camera contributions are Persons; behind-camera are derived Artists).
- A new join `MediaItemHiddenPerson (mediaItemId, personId)` records a cast member who is
  **NOT shown** in that image.
- Therefore `shown(image) = onCameraCast(image.session) \ hidden(image)`.

UX is **default-all, deselect-the-absent**: chips for the image's session cast are all
selected by default; deselecting one inserts an exclusion. A thumbnail shows a subset
badge (`N/M`) **only when `hidden` is non-empty**. A gallery can filter to "only images
showing Person X". Bulk hide/show applies across selected images. v1 is deselect-only —
tagging someone not in the cast goes through session credits first.

## Alternatives considered

- **Store inclusions (a per-image snapshot of who IS shown).** Rejected: it doesn't
  "follow" the cast — adding a contributor later would not appear in existing images
  without re-tagging, and every edited image needs a full row set. Exclusions are sparse
  (unedited image = zero rows = all shown) and self-update when the cast changes.
- **Default from the *set's* full participant union rather than the image's session.**
  Rejected: over-includes people from *other* sessions of a multi-session set, forcing
  more deselection. The image's own session is the precise, minimal default. (For a
  single-session set the two are identical.)
- **Face-region bounding boxes.** Out of scope — this models *presence* ("who is shown"),
  not *location*.
- **Reuse `PersonMediaLink`.** Rejected: its `usage` semantics are a person's own
  profile/reference imagery, not "appears in this set photo"; overloading it would blur
  two distinct concepts.

## Consequences

- No backfill: absence of rows means "all cast shown". Correctness self-follows the live
  cast.
- Cleanup wired into `cascadeHardDeleteMediaItems` and the Person hard-delete; stale
  exclusions for a removed contributor are inert (default no longer includes them).
- Reads compute `shown` on the fly (like `SetParticipant` is derived); no new cache. If
  "images showing person X" becomes hot, a denormalized array cache can be added later.
- Implementation: `appearance-service.ts` (`getOnCameraCastForSessions`,
  `getHiddenPersonsForMedia`, `setHiddenPersons`, `bulkHide/ShowPersons`, pure
  `computeShownIds`); actions `setMediaShownPeopleAction` / `bulkSetShownPeopleAction`;
  gallery items carry `sessionCastIds` + `hiddenPersonIds`; the lightbox `GalleryInfoPanel`
  hosts the "People shown" chip section; `GalleryThumbnail` renders the subset badge.
