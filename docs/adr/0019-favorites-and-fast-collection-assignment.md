# Favorites primitive + fast collection assignment

Decided + implemented 2026-06-19/20 (design review, /grill-with-docs).

## Context

Adding an image to a collection was slow (open lightbox → reveal info panel → expand the
Collections accordion → click a pill). The user wanted a one-click favorite and a faster
path for normal collections. Investigation found three unrelated "favorite-ish" mechanisms:
a per-person heart (`PersonMediaLink.isFavorite`, buried in the info panel), a hand-made
"FAV" collection (an ordinary `MediaCollection`), and the avatar/headshot ★. Mature tools
(Apple/Google Photos, Lightroom, Stash) model **favorite as a one-click flag** powering a
*virtual* gallery — never a hand-built collection — and make collections fast via a
**target collection + hotkey** (Lightroom's `B`) and/or a fuzzy **quick-add palette**.

## Decision

- **Image favorite = a single GLOBAL flag** `MediaItem.isFavorite`. One heart, app-wide,
  feeding a `/favorites` gallery filterable by person. The per-person
  `PersonMediaLink.isFavorite` was migrated up and is now deprecated (kept, unread). The
  hand-made FAV collection is retired via a "Convert to favorites" action.
- **Person favorite = `Person.isFavorite`** (a ★): filters the people browser and scopes the
  favorites gallery ("favorite persons only").
- **Fast collection add = target + cmdk quick-add palette.** `MediaCollection.isTarget`
  designates one collection (the action enforces a single TRUE). In the lightbox, `B` opens a
  fuzzy palette (`collection-quick-add-palette.tsx`, on the existing cmdk primitive) to toggle
  membership; `G` one-key adds to the target. The heart toggles favorite (`.`).
- **Display**: a filled-heart badge on grid tiles alongside the existing collection folder icon.

### Mechanics

- `GalleryItem.isFavorite` is sourced from `MediaItem.isFavorite` (top-level on
  `MediaItemWithLinks` / `MediaItemForGallery`).
- `setMediaFavoriteAction(mediaItemId, isFavorite)` (global) replaces the per-person path.
- The lightbox self-handles favorite + collection membership with optimistic local overrides
  (`localFavoriteMap`, `localCollectionIdsMap`) so the heart/palette work in **every** lightbox
  without per-page plumbing.
- Services: `getFavoriteMediaItems`, `getPersonsWithFavoriteMedia` (media-service);
  `getTargetCollection`, `setTargetCollection`, `getGridCollectionsForPalette`,
  `convertCollectionToFavorites` (collection-service).

## Why

- Favorite-as-flag avoids the grain mess of favorite-as-collection (the per-`MediaItem` vs
  per-`PersonMediaLink` mismatch) and matches every comparable tool.
- Target + palette generalises the user's "make normal collections fast too" without forcing a
  destination choice up front (Lightroom's proven model).

## Considered and rejected

- **Keep favorites as a collection** — the original setup; creates the identity mismatch.
- **Per-person image favorites kept alongside global** — two hearts to reason about; the user
  chose a single global flag with a per-person *filter* instead.

## Consequences

- Migrations (both tenants): `MediaItem.isFavorite` (+ backfill from `PersonMediaLink`),
  `Person.isFavorite`, `MediaCollection.isTarget`.
- `PersonMediaLink.isFavorite` is now dead weight — drop in a later cleanup (needs explicit go).
- Hotkeys in the lightbox: `.` favorite, `B` palette, `G` add-to-target (alongside i/t/f/c/arrows).
