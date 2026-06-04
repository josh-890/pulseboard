# Career tab: unified chronological timeline (Promoted + Staged blended)

Decided 2026-06-03 (UX grilling session via `/grill-with-docs`, implemented
in same slice).

## Context

The Career tab was visually overwhelmed by scale. xpulse's most-populated
person (Cara Mell) has 350 sets (21 promoted + 329 staged). Previous design
rendered ~220px-tall Work History cards + ~140px-tall Staged Set cards in
two separate sections, with no virtualisation, no year grouping, no type
filter — Cara Mell's Career tab was ~50,000px of vertical scroll. Even
Nancy A at 171 sets was ~26,000px. User reported feeling overwhelmed and
unable to find the right balance of overview-vs-detail.

The user's other constraints:
- 99% of the time they want either photos OR videos, not both mixed
- Promoted and Staged sets need to be *instinctively* distinguishable
- Date-first reading order matches the archive folder naming convention
  (`yyyy-mm-dd-CHANNEL-title`) and is the user's filesystem mental model
- Design principles must transfer to other surfaces (`/sets`,
  `/staging-sets`, `/channels/[id]`, `/labels/[id]`) for consistent feel

## Decision 1 — Blended chronological timeline, not separate sections

Promoted Sets and Staged StagingSets are merged into a single
chronologically-sorted list per type tab. Status differentiation lives on
each row, not in section headers.

Status indicated via three composable visual layers:
1. **Left border stripe** (3-4px): emerald-500 for promoted, amber-500 for staged.
2. **Status pill** at row-right: same colours, explicit label.
3. **Optional row background tint** (default ON): `bg-emerald-500/[0.06]` /
   `bg-amber-500/[0.06]`. Renders as an ambient category wash; can be
   toggled off via a forthcoming settings preference for users who find
   the tint noisy.

### Why not separate sections?

- The Career tab is the *narrative* of someone's professional life;
  splitting it across two sections breaks the story.
- At Cara Mell's 329:21 staged:promoted ratio, the Promoted section would
  read as a footnote and the Staged section dominate — the inverse of what
  the user wants visually.
- "Which sets need promotion?" is an admin workflow that already has a
  home on `/staging-sets`. The Career tab is not the right surface for it.

### Why not no differentiation?

- The user explicitly required instinctive distinction.
- Promoted sets are canonical; Staged sets are workflow intermediates
  with weaker data (no media yet, possibly weaker metadata). Treating them
  identically would over-promise.

### Best-in-class precedent

IMDb / Letterboxd / Mubi all show unified filmographies regardless of
production-stage; small pills indicate stage. Spotify is the exception
(tabs per release-type), but those are different *content types*, not
production stages of the same content.

## Decision 2 — Apple-Photos-style navigation, not collapsible year sections

Year grouping is **always-visible scrolling** with two affordances:
1. **Sticky year header** (CSS `position: sticky`): year label, era pill
   (when defined), set count — pinned just below the section toolbar.
   Reads the year of the topmost-visible row via IntersectionObserver.
2. **Right-edge year scrubber**: vertical strip of years with density bars
   and counts. Click → smooth-scroll to that year. Conditionally rendered
   when ≥ 5 years of activity (skip for sparse-history persons).

### Why not collapsible year sections (fold-older-years)?

The user preferred a scrolling-overview gestalt — "see the timeline density
unfold as I scroll" rather than "click-click-click into year folds." They
explicitly endorsed the Apple Photos pattern after seeing both.

### Virtualisation status

Virtualisation (`@tanstack/react-virtual`) is **installed but not yet
used**. At current scales (≤ 350 rows for the xpulse outlier),
lazy-loaded covers (Next.js `Image loading="lazy"`) handle the DOM
weight fine. Threshold for retrofitting virtualisation: ~1000 rows per
person. The plan and primitives are structured so virtualisation can be
added later without API changes to `TimelineSection`.

## Decision 3 — Row anatomy: date-first, title-second (mirror archive naming)

```
[60×80 cover]   2008-12-24 · FemJoy · 16 photos · age ~26
                Grecian Sirens                       ★★★★★  [PROMOTED]
```

- **Line 1** is the **scan column** (muted weight): ISO date, channel, count,
  age. Eye scrolls this column reading dates; when a year/title matches,
  attention drops to Line 2.
- **Line 2** is the **lock-in row** (bold title) + rating stars + status pill,
  right-aligned chip cluster.

### Why date-first?

User explicitly identified this scan pattern during grilling. ISO date
format matches the archive folder naming convention (`yyyy-mm-dd-CHANNEL-title`)
so the row visually mirrors the user's filesystem mental model.

### Per-tab cover aspect ratio

Photos tab uses 60×80 portrait covers (3:4); Videos tab uses 80×45
landscape covers (16:9). Each tab is type-exclusive, so within a tab the
heights are uniform.

## Consequences

- **Performance**: at 350 rows the page renders in ~6,900px instead of
  ~50,000px. With lazy-load, network and DOM cost stays bounded.
- **Reusability**: extracted primitives (`TimelineSetRow`,
  `SetHoverPreview`, `YearScrubber`, `TimelineSection`, `StatusPill`,
  `ratingFilterOptions`) live under `src/components/career/` and
  `src/components/shared/` and are designed for follow-up adoption on
  `/sets`, `/staging-sets`, `/channels/[id]`, `/labels/[id]`, and search
  results.
- **Filters / sort**: all 4 filters (channel, rating, era when defined,
  archive-link status) + 4 sorts (date desc/asc, rating desc/asc) ship
  with this slice. URL-driven via comma-separated multifacet params,
  mirroring the pattern shipped on `/sets`.

## Out of scope (planned follow-ups)

- **Settings toggle** for the tint-on-rows preference — the `withTint`
  prop is wired and the visual works both ways; the UI control is a
  small follow-up.
- **Per-year era badges in the sticky header** — data and component
  support are in place; the year → era resolver needs date-range logic
  before it can populate.
- **Virtualisation** — see Decision 2.
- **Primitive adoption** on `/sets`, `/staging-sets`, `/channels/[id]`,
  `/labels/[id]`, search — separate slices.
- **"Archive-only sets manually linked to a person"** — schema doesn't
  support this; would be a separate schema-extension slice.

## 2026-06-04 amendments (post-launch feedback)

After living with the shipped design, several refinements landed in
rapid succession. None overturn the three core decisions above; they
sharpen the row anatomy and the hover affordance:

1. **Row meta cluster.** Line 2 dropped `flex-1` on the title — title,
   status pill, archive pill, and rating now cluster tight on the left
   next to the cover, eliminating the ~750px horizontal saccade
   between cover/title and the status pill the original layout had on
   wide rows.
2. **Persistent right panel: tried and rolled back.** A master-detail
   layout (Linear / iCloud Photos pattern) was prototyped — sticky
   right panel with rich preview + idle career-summary card,
   responsive popover fallback < 1100px. Shipped briefly, then
   rolled back: the panel didn't earn the screen estate it occupied,
   and most of its content duplicated what the row already showed.
   Useful information from the panel got re-homed onto the row itself.
3. **Row 3rd line: co-participants.** Multi-cast sets show a 3rd
   line listing other participants (the viewer themselves is omitted).
   Solo sets stay 2-line tall. Photo rows always 90px (cover dictates),
   video rows 60px when solo / 90px when multi-cast.
4. **Cover-only hover popover.** Replaced the row-wide hover popover
   (which appeared far from the cursor on wide rows) with a tight
   cover-thumbnail hover that pops only an enlarged version of the
   cover (240×320 photos / 480×270 videos). No samples grid, no link
   pill — click anywhere on the row to navigate.
5. **Archive-link pill on every row.** Three visual states with a
   silent fourth for unlinked: green `In archive` (OK), slate `Linked`
   (PENDING/UNKNOWN — link exists but not validated), red specific
   label (`Missing` / `Changed` / `Incomplete`). Mirrors the hero pill
   style, recoloured to red-not-amber to avoid collision with STAGED.
6. **Label affiliation chips become filters.** Previously linked to
   `/labels/[id]`; now toggle a multi-select `clabel` filter on the
   timeline. Counts show `n/m` (photos / videos) computed across
   promoted + staged work history so newly-imported labels (e.g. only
   in staging) no longer go missing.
7. **Sample thumbnail strip.** Promoted photo rows render up to 4
   sample thumbnails on the right (h-16, width by aspect ratio),
   inspired by the Production Photos preview-strip pattern. Hidden
   on viewports < `lg` so the cluster stays the priority.

## Pointers

- Primitives: `src/components/career/`, `src/components/shared/status-pill.tsx`.
- Data layer: `src/lib/services/career-service.ts`.
- Affiliation derivation: `deriveAffiliations()` in
  `src/lib/services/person-service.ts` (consumes both
  `getPersonWorkHistory` and `getStagingWorkHistoryForPerson`).
- Page integration: `src/app/people/[id]/page.tsx`,
  `src/components/people/person-detail-tabs.tsx`,
  `src/components/people/career-tab.tsx`.
