# ADR-0042: Tag Composer — pose, clothing, camera and expression on photos

- **Status:** Accepted (S1–S3 built 2026-11-21, S4–S5 2026-11-22; S6 follows)
- **Date:** 2026-11-21
- **Amends:** ADR-0033 (one optional parent → several parents; a set-level source over its photos)

## Context

The user wants to tag the people in photos systematically, quickly and visually: posture, clothing and
what state it is in, the impression the clothing makes, the camera, and the expression. The purpose is
**search inside Pulseboard**. AI prompting is not a goal.

The starting material is an idea sketch and two Excel taxonomies (`docs/Tag-Composer/`). Together they
hold a 10-step wizard, about 430 Danbooru-style tags, and combinations such as `torn_pantyhose` and
`bra_pull`.

Photo-level tagging was almost unused before this. Prod xpulse has 199,477 photos and 5 Pose tags, and no
wardrobe tag on any set.

The comparison covered:
- **Taggers:** Danbooru (implications, aliases, wiki tag groups as navigation), Hydrus (parents shown
  under their child).
- **Photo cataloguers:** Lightroom (keyword sets, the Painter), Photo Mechanic (structured keywords,
  templates), digiKam, Eagle (tag actions).
- **Annotation tools:** Label Studio (`visibleWhen` refinement), Prodigy (one decision per pass), CVAT
  (attributes kept until a keyframe).
- **Others:** stock agencies (controlled vocabulary, clothing only where noteworthy), AI taggers (WD14,
  JoyTag, RAM++), and pose libraries.

## Decision

1. **Vocabulary.**
   - Danbooru's terms and definitions are used, spelled in the catalogue's kebab-case (`looking-at-viewer`).
   - The exact Danbooru name is kept as an alias (`looking_at_viewer`).
   - The query box reads any spelling in the one spelling (`toTagName`), so `from_behind` finds
     `from-behind` even without an alias.
   - Everything is English.
   - Anime-specific poses, location props, multi-person interactions and emotions are left out.
   - The table that was reviewed and approved is `docs/Tag-Composer/composer-vocabulary.csv`.
2. **Everything sits on the photo**, wardrobe included. Wardrobe changes during a set, so no wardrobe tags
   go on sets.
   - The set will show a wardrobe computed from its photos.
   - Set search will get a source "in its photos" (`@photos:`).
3. **Several people in a photo:** the tags belong to the photo (Danbooru style). Who does what is not
   recorded.
4. **Several parents per tag.**
   - `parentId` stays the first parent, and the tree shows the tag under it.
   - Further parents live in `tag_extra_parent`.
   - Implication stays computed, never stored: a filter on any parent finds every tag that implies it
     through either relation (`descendants` in `tag-query/resolve.ts`).
   - A cycle through any mix of the two relations is refused.
   - A merge carries both relations to the target.
5. **The state × garment matrix.**
   - Each state group (Damage, Wet, See-through, Open, Lift, Pull, Aside, Unworn) has a rule
     (`tag_state_rule`) with:
     - a generic tag (`torn-clothes`);
     - a name pattern (`torn-{x}`, `{x}-pull`);
     - the garment groups or garments it fits, with irregular names (`panties → panty-pull`).
   - The Composer creates a combination tag the first time it is needed. The new tag has the generic
     state and the garment as its parents.
   - The Danbooru combinations are seeded in advance.
6. **"Do not confuse with"** pairs (`tag_confusable`), such as `seiza ↔ kneeling`, show where one tag ends
   and the next begins.
7. **Composer structure.**
   - **Four paths as tabs:** Figure · Clothing · Camera · Expression (`composer_path`). A path's sections
     are lists of tag groups (`composer_section`, `composer_section_group`).
   - **Section kinds:** `TILES`, `REFINEMENT` (the children of the chosen base postures, unfolding in
     place) and `MATRIX`.
   - **Passable sections** are offered in pass mode: one section, photo by photo, keys 1–9.
   - **Pinned paths** (Clothing, Camera) are carried over to the next photo as a proposal. Enter applies
     it; → moves on without writing.
   - There is no wizard: the user is a frequent user, and the paths change at different rates.
8. **Clothing impression:**
   - Formality, exclusive: `casual` → `evening-wear`.
   - Coverage, exclusive: `modest` → `barely-clothed`.
   - Style, several allowed: `elegant`, `sexy`, `edgy` ….
   - Context: `inappropriate-attire`, `costume`, `uniform`.
9. **Intensity stays separate** (ADR-0036). The Composer has no act tags and no acts path.
10. **Visuals come from examples.**
    - Any tag can show the user's own photos as examples: a title example plus up to four more. The tile
      shape is set per path.
    - **Comparable, not free** (amended 2026-11-22): the user draws a box tightly around the subject, and a
      rule per path makes the crop — the subject fills the same share of every tile (Figure 85 %, hung 7 %
      below the top edge, like a fashion shop's model line; Expression 70 %; Clothing and Camera 85 %,
      centred). The scale always holds; where the photo ends the tile shows a neutral mat. Box and crop are
      both stored, so a changed rule re-frames every example. A free frame was tried first and dropped:
      examples did not compare. Later, pose estimation can propose the box.
    - Pictograms are used only for camera angles.
    - Without an example, a tile shows its text.
    - This arrives in slice S4.
11. **Existing tags move into the vocabulary.** For example `view-back` → `from-behind`, `half-body` →
    `upper-body`, `footwear-heels` → `high-heels`, `legwear-stockings` → `thighhighs`. The old names stay
    as aliases.
12. **Tenant:** xpulse and dev only (`scripts/add-composer-vocabulary.ts`). Pulse has no body or outfit
    groups.

## Slices

1. **S1 — foundation (this change):**
   - the tables and the implication DAG;
   - the query box reads Danbooru spellings;
   - the seeded vocabulary (260 tags, 32 new groups, 18 renames).
2. **S2 — the tag workbench** for a set or session:
   - the paths;
   - refinement that unfolds in place;
   - the matrix;
   - the composition (what to add, what to remove);
   - carry-over with Enter / →;
   - a filmstrip showing coverage.
3. **S3 — bulk work:**
   - apply to a selection, shown as "n/N";
   - painting in the filmstrip;
   - pass mode.
4. **S4 — examples:** examples with crops, a hover card, proposals, and camera pictograms.
5. **S5 — set view:** a computed wardrobe, coverage, and `@photos:`.
6. **S6 — presets.**
7. **Later:** pose estimation.

## Consequences

- One additive migration (`20261121120000_tag_composer_foundation`), applied to every tenant. Pulse has
  empty tables.
- The starter vocabulary (`TAG_VOCABULARY`, `BODY_AND_OUTFIT_VOCABULARY`) follows the new names, so a dev
  reseed does not bring the old ones back. The starter Outfit group is gone.
- Old names still resolve through their aliases: `#view-back` files, saved queries.
