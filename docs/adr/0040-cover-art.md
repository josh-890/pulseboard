# ADR-0040: Cover art is its own kind of file

**Status:** Accepted (2026-11-18)
**Builds on:** ADR-0031 (a transferred cover is not always a stand-in). The provisional flag and its rules stay.

## Context

A Set or Session cover was only a pointer (`coverMediaItemId`) to an ordinary MediaItem. Two kinds of
publisher cover came in as ordinary photos:

- **The transferred cover:** the staging cover copied in at promotion, `cover.jpg`, with
  `isTransferredCover`.
- **`Title-c.jpg` from archive-upload:** it carries no flag at all.

As a result, cover art sat next to the real photos everywhere a set's images are listed, counted or
sampled:
- person, channel, label and artist showcases;
- the set and session grids and their counts;
- the people filter and `person:` / `cast:`;
- smart collections;
- every picker.

Archive stand-ins (512px copies of a folder image) also stayed behind as duplicates once the real upload
was in. On xpulse, 1370 cover-art files were within 6 dHash bits of another file of their set.

**How others handle it:**
- **Cover Art Archive (MusicBrainz) and Plex/Jellyfin** keep artwork as release metadata with types
  (Front, Back, Booklet), apart from the media files.
- **Apple Photos and Lightroom** have only a *key photo*, picked from the album itself.

Pulseboard needs both: publisher artwork, and a picked photo when a set comes without art.

## Decision

1. **Two facts.** Every file has a role: `MediaItem.role` (`PHOTO` | `COVER_ART`). Being *the* cover is a
   separate fact, the pointer, and it may point at either kind.
2. **Photos only.** Photos are `role = PHOTO` **or** `artInPhotos`. The rule lives in one place:
   `src/lib/media-role.ts`, with `isPhotoItem`, `PHOTO_WHERE` and `photoSql`. These views read photos only:
   - showcases (person, maker);
   - set, session and reference galleries;
   - counts (set and session cards, hero, person sessions, dashboard KPI and activity);
   - merge candidates;
   - pickers (`/api/media/search`, cross-session person media);
   - `findTagMatchIds` for images.

   These keep seeing art:
   - duplicate and similar views;
   - explicit lists (favorites, collections, evidence);
   - the cover-pointer readers.
3. **What arrives as cover art:**
   - the transferred cover;
   - a set upload named by the cover agent's rule (a stem ending in a lone `c` after any non-alphanumeric
     character: `Title-c.jpg`, `Title - c.jpg`).

   A picked cover (`#`, Set as cover), or photo 1 when no art exists, stays a photo in every respect.
4. **The cover slot.** It is out of view: the hero already shows the cover, and managing art is rare. A
   quiet link in the hero's info line ("8 media · 2 cover art", or "no cover art") opens it in a side
   sheet. The sheet is not modal: the slot's lightbox takes the screen while
   the sheet steps aside, and Esc closes the lightbox first.
   - What it shows: the art files. On a session they follow the gallery's own Group-by-Set switch:
     grouped by set (title links to the set, upload per set) or flat (each file names its set); and there **Cover** sets the cover of *that set*: lists and cards show set covers, and a
     session without its own cover shows its first set's. An existing session cover stays valid; art in
     no set forms its own group, where Cover is the session's.
   - Actions: Cover, In photos (`artInPhotos`), back to the photos, delete, and Upload cover art (art, and
     it becomes the cover).
   - In the photos: "This is cover art" in the info panel and the bulk bar moves a promo image out of the
     grid.
5. **Redundant copies.** A copy is at most 6 dHash bits apart (`ART_COPY_MAX_BITS`) and has no more
   pixels. When a file arrives:
   - a new **art** file deletes art copies of itself;
   - a new **photo** deletes only **transferred stand-ins** it copies.

   A `Title-c.jpg` close to a photo is usually the publisher's crop with lettering, so it stays. The
   covers a deleted file held move to the arriving file.
6. **Existing data.**
   - The migration only sets roles: transferred → art, cover-rule filenames in a set → art.
   - Deletions go through `/settings/system/cover-duplicates`, a list side by side in three groups:
     - copy (pre-selected);
     - stand-in (pre-selected);
     - crop (not pre-selected).
   - Nothing is deleted until the list is reviewed.
7. **Which cover a session shows** (`lib/session-cover.ts`, `getCoverPhotosForSessions`): its own pick
   (a cover set in the session grid, `#`) → the cover of the set released first among those it is the
   primary session of (then the one created first) → its first photo, not a stray annotation. The slot
   says which applies ("The session shows the cover of X (released first)" / "its own pick · Back to the
   set's cover"). On xpulse 23 of 2013 sessions have several sets; 9 have a pick of their own.

## Consequences

- Counts drop by the cover-art files. The catalogue's `Set.imageCount` is untouched.
- The archive upload queue is unchanged: `firstMediaAt` still ignores only the transferred cover, and an
  uploaded `-c.jpg` is an upload.
- `SetMediaItem.isCover` was never read and is dropped.
