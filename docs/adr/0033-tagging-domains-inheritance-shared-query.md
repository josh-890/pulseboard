# ADR-0033: Tagging — group domains, computed inheritance, one shared query

- **Status:** Accepted (S1–S6 landed; S7 follows)
- **Date:** 2026-10-01

## Context

The tag model (TagGroup / TagDefinition / TagAlias + join tables for Person,
Session, MediaItem, Set and Project) had existed for months and was essentially
unused: on xpulse, 5 tag rows across 178 persons, 675 sets, 831 sessions and
63,518 images. Nothing could filter by a tag. Media had no bulk tagging, and the
picker could not create tags. Two stores disagreed: every entity also carried a
copied `tags String[]` field. It was rewritten from the join table on each tag
change, but not on rename, merge or delete. The Set/Project create sheets wrote
free-text strings into it, and the edit sheets resubmitted stale strings. The
seeded groups duplicated first-class fields: Status/Tier ≈ `Person.status` /
`rating`, and Content Type/Pose ≈ `MediaCategory`.

What tags are for (grilled 2026-10-01):
- Describing content (location, mood, outfit, pose, framing).
- Characterising persons.
- Workflow markers (to-dos).
- Personal judgment.
- Driving **dynamic (smart) collections** next to the static ones.

Tags are applied at every level about equally. The levels differ in meaning:
- A **session** (production) carries setting, location and mood.
- A **set** (publication) mostly agrees with it, but not always.
- An **image** carries what is specific to it.

### How other tools handle it

- **Stash** has one tag vocabulary across scenes, images, galleries and performers.
  It has parent/child tags with an "include sub-tags" filter, aliases, and filter
  criteria with includes / includes-all / excludes.
- **Hydrus** and **Danbooru** use namespaces or categories and siblings (aliases).
  They have parents/implications, autocomplete with counts, and a query syntax
  (`a -b ~c ~d`).
- **Lightroom** uses a hierarchical keyword tree, keyword sets on number keys, a
  painter tool, and a column browser with counts.
- **Linear** has label groups that allow only one label of a group per issue (our `isExclusive`).

None of them models *inheritance across a production → publication → image chain*.
That chain is Pulseboard's own.

## Decision

1. **A group carries a hard domain and a soft level.**
   - `TagGroup.domain` (`PERSON | CONTENT | PROJECT | ANY`) decides which entities
     its tags may sit on. This is enforced in `entity-tag-service` (`domainsForEntity`).
   - Inside CONTENT (session → set → image), `typicalLevel` is only a hint: it ranks
     the picker and presets a filter's source. A tag may override it.
   - This replaces the per-tag `scope[]` allow-list. The hard boundary pays off
     between domains (a person trait never shows up on an image facet). Inside the
     content chain it only gets in the way: content tags need every level for
     exceptions.
2. **One optional parent per tag (implication).** Filtering by a parent includes its
   children unless `=tag` is used. The chain is acyclic (checked in `tag-service`).
   Groups stay as coloured namespaces.
3. **Inheritance is computed, never copied.**
   - It flows downward: Session → Set (SetSession), Session → Image, Set → Image
     (SetMediaItem).
   - For **exclusive groups the nearest level wins** (image > set > session): an
     image tagged *Studio* in an *Outdoor* session is Studio. Other groups are a union.
   - **Workflow** groups (`kind = WORKFLOW`) never inherit.
   - Person tags never flow into content. Joining through them is an explicit
     relation criterion ("person has tag …").
4. **Filters choose the source per criterion:** `anywhere` (default), `image`, `set`
   or `session`. Facets combine as *any within a group, all across groups*.
5. **One query AST** serves the facet panel, the chips, a text syntax
   (`beach -studio ~pool ~beach outfit:* =swimwear @image:close-up is:fav rating>=4 …`),
   the URL and saved filters. Saved media filters are **Smart Collections**.
6. **The join tables are the only store.** The copied `tags String[]` columns are
   dropped. List views read chips through `TAG_CHIP_JOIN_SELECT` (`lib/tag-chip.ts`).
7. **Inline creation makes active tags.** It is a single-user app: the `pending`
   status and its approval queue are retired. The picker offers "did you mean"
   (fuzzy + alias) before creating.
8. **Starter vocabulary** in `lib/tag-vocabulary.ts`:
   - Setting · Location · Mood & Light · Outfit · Pose · Framing · Publication
     theme · Person traits · Workflow · Judgment.
   - Applied per tenant by `scripts/seed-tag-vocabulary.ts`, which also retires the
     overlapping seed groups (Content Type, Style, Status, Tier, Uncategorized).
   - Style:outdoor/studio assignments move to Setting.
   - xpulse's Appearance group is kept as Content · set.

## Considered and rejected

- **Strict per-tag scope.** It hides the tag needed for an exception (one outdoor
  image in a studio session), and narrowing a scope later leaves violating rows.
- **Separate vocabularies per level.** Inheritance would then need mappings between them.
- **Copying set/session tags onto images.** That drifts, and removing a tag
  becomes ambiguous (was it the image's own tag or inherited?).
- **Keeping the name cache with a fixed resync.** Every rename and merge would
  have to touch all five tables for all entities. The join read is cheap and
  can't go stale.

## Consequences

- Migration `20261001090000_tag_domains_hierarchy`:
  - New enums `TagDomain`, `TagLevel`, `TagGroupKind`.
  - Group `domain`/`typicalLevel`/`kind`.
  - Tag `parentId`/`typicalLevel`.
  - Slug unique per group.
  - `scope`/`status` dropped.
  - `tags String[]` dropped on Person, Session, MediaItem, Set and Project (verified
    on both tenants: every legacy string had a join row).
- Deleting a tag re-parents its children to its own parent. Merging moves the
  sources' children to the target.
- Gallery tiles lost their legacy tag-count badge until S2's join-backed tag dots.
- Facet counts (S4 v1) count every entity of the type carrying the tag (galleries: within the gallery), not the result narrowed by the other filters — the filter itself still ANDs with all of them.
- Follow-up slices:
  - S2: tag palette (`T`) and display with inherited tags.
  - S3: tri-state bulk, quick-tag slots 1–9, armed painter.
  - S4: facet filtering with the effective-tag view.
  - S5: query box.
  - S6: saved filters / smart collections.
  - S7: `/tags` pages + workflow To-do.
