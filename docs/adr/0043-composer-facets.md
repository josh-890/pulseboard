# ADR-0043: Composer facets — body-part facets, context relevance, person lanes, shot tiers

- **Status:** Accepted (R1 core, R2 starting table, R3 workbench, R4 management built 2026-11-22)
- **Date:** 2026-11-22
- **Refines:** ADR-0042

## Context

The Composer's Figure refinement was a flat list of named poses. The user's sketch of nine sitting poses showed
where that breaks:
- six of the nine were combinations of existing tags;
- three needed building blocks that were missing (one knee up, legs stretched out, a raised seat / hanging
  legs);
- one was not sitting at all (a squat).

Detail photos (close-ups, macro) need different facets entirely: the region, the feature on it, the surface.

The research behind the decisions:
- **Danbooru** divides its posture group by body part: positions, rest points, head, torso inclination,
  arms/hands, hips, and legs split into leg location, knee location and foot position. Its `…_focus` tags name a
  photo's body-part subject.
- **Yoga-82** groups 82 poses under 20 classes by what the legs and spine do.
- **OWAS** codes a posture as back × arms × legs.
- **BAP** codes each body part on its own.
- **For maintaining the relations:**
  - feature models (FeatureIDE) give one-of / any-of groups and requires/excludes edges;
  - SAP variant tables and DMN decision tables keep dense compatibility as a matrix with a hit policy;
  - PoolParty/SKOS shows a relation graph around one concept.

## Decision

1. **Facets per body part, one total set for the whole body.** A value such as `knee-up` is one tag whatever the
   base posture.
2. **Relevance per context, in three levels:**
   - **typical**: shown first;
   - **possible**: behind "more …", or shown at once when nothing in the facet is typical;
   - **impossible**: hidden. Values already held always show.

   Contexts are any tags (base postures, framing, regions). Within one context the most specific row answers
   (value → facet → path). Across the contexts present, the **strictest level wins**. No row means possible.
   So a framing hides facet by facet, and a region can bring a facet back that the framing leaves alone
   (`tag_relevance`).
3. **The choice per facet** (`tag_group.composerChoice`) is ONE or MANY. It is separate from `isExclusive`, which
   is per photo: a duo may hold two values of a ONE facet. A ONE pick replaces; Shift adds.
4. **Combinations** (named forms such as seiza) are tags with several parents (ADR-0042). When all the parts are
   chosen, the Composer suggests them. Taking one replaces the parts; nothing is merged automatically.
5. **Person lanes.** Tags stay on the photo, and `media_item_tag_person` records whom each describes.
   - A person's remove keeps the photo tag while someone else holds it; the last one takes it with it.
   - A photo-level remove takes every attribution with it.
   - Paths are marked `personal` (Figure, Expression, Clothing); Camera stays on the photo.
6. **Focus flow:** a ONE facet collapses after a pick, and focus moves to the first facet with something
   typical and nothing chosen.
7. **Visuals:**
   - the example framing is set per facet (`tag_group.framingFill/Top/tileAspect`, inheriting the path's);
   - an optional uploaded line drawing per value (`tag_definition.drawingKey`).
8. **Shot tiers through relevance, not code:**
   - Figure (wide-shot, full-body, cowboy-shot);
   - Partial view (upper-body, lower-body, portrait, close-up), led by Region;
   - Detail (detail, macro): Region, Feature, Surface, optics.
9. **Region is a maintainable facet** (face, midriff, back, legs …, refined through parents). A region may link
   to the code catalogue (`tag_definition.regionCatalogId`).
10. **The Detail tier bridges to the person archive.** It offers the person's body marks in the region and uses
    the existing detail-assign route.
11. **Everything is maintained by the user** in Settings → Composer (R4): a tree, the relevance matrix, a
    relationship view, "+ value" in the workbench. As built: order by ↑ ↓ buttons rather than dragging
    (keyboard-reachable); relations are linked through a search picker, not by dragging edges; a line drawing is
    rendered to WebP on upload, so no SVG (and no script in one) is ever served.

12. **Facet defaults** (added while building R3): `tag_group.composerDefault` is a facet's level where no
    context present has a say. Seat, Lying orientation, Named forms and Region default to impossible, so they
    are asked only once a context asks for them (sitting, lying, a close shot). This is the "facet default row"
    of the matrix; a rule derived from the rows alone ("a facet some context forbids waits") hid too much,
    because the framing forbids body facets without ever asking for them.
13. **The shot leads:** the section named `Framing` (named `Shot` until 2026-11-22; the old name is still honoured) is drawn as a row above the tabs.

## Consequences

- One additive migration (`20261122150000_composer_facets`).
- `applyComposition` takes an optional person and returns attributions.
- A tag merge carries attributions and relevance.
- A tag or group delete clears its relevance rows (`targetId` has no foreign key).
- The `REFINEMENT` section kind is retired in R3, in favour of a named-forms facet plus relevance.
