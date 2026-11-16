# ADR-0039: Per-image focus — in the shot, not the focus

- **Status:** Accepted
- **Date:** 2026-11-17
- **Relates to:** ADR-0023 (who an image shows), ADR-0037 (the support role "Appearance")

## Context

A photo of a multi-person session can show a Model who is not what it is about: at the edge, in the background.
"Shown" (ADR-0023) was all or nothing, so such photos counted in that person's **showcase** and filled it with
meaningless pictures. ADR-0037 answered the same question for a whole session (someone only appearing is never in
a showcase); this answers it per image.

Comparable products keep two facts apart: **present** (search, filters, "all photos of X") and **featured**
(curated views). IPTC Photo Metadata lists *Person shown* separately from image regions with the role *main
subject*. Apple Photos' "Feature this person less" keeps a photo in the person's album and only takes it out of
Memories and Featured Photos. Booru-style tagging has a hand-set `X_focus` beside the "present" tag.

## Decision

1. **Three states per person per image: Focus · In the shot · Not shown.** "In the shot" (`bg`) is shown — the
   filters (`person:`, `cast:`, the gallery people filter), the `N/M` badge and "photos of X" count it as before.
   Only the curated view leaves it out: the person's **showcase** (Best and Random).
2. **Storage, additive.** A lead in the shot only: a row in `media_item_background_person`. Someone appearing
   (support) marked as the focus: `media_item_shown_person.focus = true`; a shown mark without it is "in the
   shot" — so every existing support mark keeps its meaning. No rows = as before; nothing to backfill.
   `focus(image) = (shown leads \ background) ∪ (shown support ∩ focus)` — `imageFocusIds` in
   `src/lib/image-shown.ts`; the showcase query applies the same rule in SQL.
3. **Support can be the focus.** On a single photo someone appearing can be marked as the focus; that photo then
   joins *their* showcase (otherwise support stays out, ADR-0037).
4. **Consistency.** Not shown wins: hiding someone drops their background mark. Marking someone hidden as in the
   shot shows them again.
5. **UI.** Each "People shown" chip: the name toggles shown ↔ not shown; a fixed `bg` segment toggles the focus ↔
   in the shot (nothing moves when the state changes). Bulk: Focus · bg · Hide. The thumbnail badge gets a `bg`
   hint. The gallery filter chip cycles must show → must be the focus → must not show. **N** in the viewer toggles
   `bg` for the person the filter singles out, else the only lead.
6. **Not done.** Ranking solo shots first: a group shot with several people in focus is a good showcase photo.

## Alternatives considered

- **One table with a state enum per (image, person).** Cleaner, but it means migrating every existing mark on every
  tenant and rewriting every reader of the two existing tables. Rejected for now; the rule lives in one place either
  way.
- **"In the shot" behaves like not shown.** Simpler, but loses "all photos of X".
- **Face regions / size of the face** (Lightroom, digiKam). Out of scope, as in ADR-0023.
