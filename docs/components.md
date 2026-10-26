# Pulseboard — Component Inventory

## Conventions

- **File names:** `kebab-case.tsx` (e.g., `kpi-card.tsx`)
- **Component names:** `PascalCase` (e.g., `KpiCard`)
- **Props type:** `{ComponentName}Props` (e.g., `KpiCardProps`)
- **Exports:** Named exports only (no default exports)
- **Location:** Group by feature domain under `components/`

---

## Layout Components (`components/layout/`)

| Component | Type | Props | Description |
|---|---|---|---|
| `AppShell` | Client | `children` | Wraps sidebar + main content, manages mobile drawer state |
| `Sidebar` | Client | — | Desktop collapsible sidebar with nav links |
| `MobileDrawer` | Client | — | Mobile slide-out drawer with same nav links |
| `NavLink` | Client | `href`, `icon`, `label`, `collapsed?` | Single nav item with active state highlight |
| `SidebarProvider` | Client | `children` | Context for sidebar collapsed state |

---

## Dashboard Components (`components/dashboard/`)

| Component | Type | Props | Description |
|---|---|---|---|
| `KpiGrid` | Server | — | Grid of 4 KPI cards; fetches stats |
| `KpiCard` | Server | `label`, `value`, `icon`, `href?` | Single stat card with label and value |
| `DashboardActivity` | Server | — | Suspense wrapper for activity feed |
| `ActivityFeed` | Server | `activities` | Scrollable list of recent activities |
| `ActivityItem` | Server | `activity` | Single activity entry with icon and time |
| `QuickActions` | Client | — | Action button group (add person, etc.) |

---

## People Components (`components/people/`)

### Browser
| Component | Type | Props | Description |
|---|---|---|---|
| `PersonList` | Server | `persons` | Grid of person cards |
| `PersonCard` | Server | `person` | Person summary card: avatar, name, status, tags |
| `PersonSearch` | Client | — | URL-driven text search input |
| `StatusFilter` | Client | — | URL-driven PersonStatus filter buttons |
| `AttributeFilters` | Client | — | Hair color, body type, ethnicity filter dropdowns |
| `EmptyState` | Server | `message?` | No results placeholder |

### Detail Page
| Component | Type | Props | Description |
|---|---|---|---|
| `PersonHeader` | Server | `person`, `primaryAlias` | Name, avatar/profile photo, status badge, star rating |
| `ProfileSection` | Server | `person` | Demographics, physical attributes, career info |
| `PersonasSection` | Server | `personas` | List of working identities with descriptions |
| `AliasesSection` | Server | `aliases` | All known names list |
| `WorkHistory` | Server | `contributions` | Sets with role, date, channel label |
| `AffiliationsSection` | Server | `labels` | Labels derived from set contributions |
| `ConnectionsSection` | Server | `relationships` | Co-workers with shared set count |
| `NotesSection` | Client | `person` | Editable rating, notes, and tags |
| `StaticLabelRow` | Client | `name`, `value`, `unit?`, `status?`, `baselineValue?`, `statusBearing?`, `edit?` | ALWAYS_STATIC row (ADR-0005); with `edit` a pencil opens `StaticAttributeEditor` in place |
| `StaticAttributeEditor` | Client | `personId`, `definition`, `baselineValue`, `baselineUnknown`, `overrides`, `currentValue`, `onClose` | Edits a never-changing trait as baseline (`recordPhysicalChangeAction` intent `baseline`; empty = clear); lists later changes that override it, each with `RemoveValueButton` (2026-10-20) |
| `RemoveValueButton` | Client | `deltaId`, `personId`, `what`, `where`, `label?`, `className?`, `onRemoved?` | Removes one ScalarDelta after a red confirm (`deleteScalarDeltaAction`); Undated drawer rows, `ScalarDeltaInlineEditor`, static editor |
| `TypedAttributeInput` | Client | `definition`, `value`, `onChange`, `isVerifiedUnknown?`, `onVerifiedUnknownChange?` | Catalog-typed input; SINGLE_SELECT has a **×** to clear (2026-10-20) |

### Overview (`components/people/overview/`)
| Component | Type | Props | Description |
|---|---|---|---|
| `PersonShowcase` | Client | `showcase`, `personName`, `person` | Mosaic of the person's best photos (1 large + up to 6; "+N"), source chips, "All N" lightbox, ▶ slideshow |
| `ShowcaseSlideshow` | Client | `items`, `startIndex`, `title`, `onClose` | Full-screen portal slideshow: crossfade + slow zoom (reduced-motion off), Space / ← → / Esc, progress bar |
| `ShowcaseSourceChip` | Server | `source`, `className?` | "Iconic" / "★ Favorite" / "Outtake" chip; nothing for random photos |
| `KnownForRow` | Server | `sets` | Scroll-snap row of 2:3 set posters (focal point, video badge, rating) linking to `/sets/[id]` |

---

## Career Components (`components/career/`)
| Component | Type | Props | Description |
|---|---|---|---|
| `CareerPromoteButton` | Client | `stagingSetId`, `title`, `stagingHref`, `variant: "tile" \| "row" \| "compact"`, `undevelopedParticipants`, `className?` | Promote badge for an approved staged set in the Career tab; popover fetches the promote preview (new set vs. enrich X), promotes via the staging promote route with `requireDevelopedCast`, then `router.refresh()`. Amber + warning + Promote disabled while anyone in the cast is not yet a Person |

## Intensity components (`components/intensity/`, ADR-0036) — shared by Settings and sessions

| Component | Type | Props | Description |
|---|---|---|---|
| `IntensityValue` | Server-safe | `value` (null → —), `max`, `className?` | A value as a pill in its heat colour (`intensityColor` / `intensityTextColor`, 0 → Max, green → violet) — used for session values, peaks, the person's matrix |
| `IntensityHoverText` | Client | `text`, `side?`, `className?` (trigger wrapper, default `min-w-0 flex-1`), `children` | Radix tooltip with a description; renders the children alone when there is none |
| `ActEvidenceList` | Client | `acts` (`EvidenceAct[]`), `stateOf(id)` (all/some/none), `onToggle(id, linked)`, `dark?` | Ticked acts grouped by person (`Name (ICG-ID)`), each a `role="checkbox"` (`aria-checked` mixed for some) with level, name, scenario; an empty hint without ticks (3b) |
| `BulkActEvidence` | Client | `acts`, `selectedIds`, `stateOf(id, mediaIds)`, `onToggle(id, mediaIds, linked)` | Selection bar "Act…": popover with `ActEvidenceList` over the selected photos |
| `useActEvidence(intensity)` | Hook | `GalleryIntensity` (`acts`, `evidence`: photo → act rows) | The gallery's evidence links, optimistic, re-synced when the server's copy changes; `stateOf`, `toggle` → `setActsEvidenceAction` |
| `IntensityExtrasPicker` | Client | `extras`, `groups`, `selected`, `onChange(ids)`, `inherited?`, `mixed?`, `disabled?`, `context` | Extras as controls: each group a `radiogroup` (— + its extras, +points), ungrouped as toggles, Max (amber, 10) apart; with `inherited`, a departure is ringed amber; `mixed` (several people, only some have it) dashed, `aria-pressed="mixed"` |

### Person intensity (`components/people/intensity/`, ADR-0036 slice 3)
| Component | Type | Props | Description |
|---|---|---|---|
| `PersonIntensityTab` | Client | `data` (`PersonIntensityData`: `summary` from `summarizePersonIntensity`, `scale`, `scenarios`) | The person's Intensity tab: peak tiles, matrix, course; an empty hint without sessions |
| `IntensityPeakTiles` | Server-safe | `data` | Peak overall + per scenario (with acts), each linking its session (date with precision · name) |
| `IntensityMatrixView` | Client | `data` | `role="table"`: rows = levels holding acts (scale title, hover description), a column per scenario; reached acts filled with first date (precision) · count, linking the first session; hover: description, first session, count |
| `IntensityEvidence` | Client | `data` (`evidence`: act id → photos) | "In pictures": per act with evidence, up to 8 thumbs (+N), each linking its session gallery filtered `act:"Scenario/Act"` |
| `IntensityCourse` | Client | `data` | A bar per session (oldest first, undated after a divider), ★ for first times, value + two-line date; each bar links its session, hover lists its acts |

The header's KPI box (`KpiStatsPanel` in `person-detail-tabs.tsx`) shows **INTENSITY** — peak as a bar with a segment per whole value up to the tenant's Max, each in its heat colour (`intensityColor`; half steps half-filled) and the mean as a red dot / `ø` — fed by `intensity.summary` (it replaced CP/WCP).

### Session intensity (`components/sessions/intensity/`)
| Component | Type | Props | Description |
|---|---|---|---|
| `IntensityPanelProvider` / `useIntensityPanel` | Client | `initialOpen` | Panel open/closed; remembered in the `pulseboard-intensity-panel` cookie (`INTENSITY_PANEL_COOKIE` in `types.ts`), read by the page so it renders as left — no jump after load |
| `SessionWorkspace` | Client | `main`, `sidebar`, `panel` | The production session's two columns; with the panel open it replaces the sidebar (`lg:grid-cols-[1fr_440px]`), sticky and scrolling on its own |
| `IntensityPanelToggle` | Client | `className?` | "Intensity" button (Media header, sidebar box) — `aria-pressed` |
| `IntensitySummary` | Client | `contributions`, `catalog` | Sidebar box while the panel is closed: each person's session value + the toggle |
| `SessionIntensityPanel` | Client | `contributions` (`SessionIntensity`), `catalog` (`SessionIntensityCatalog`), `release?` (`SetRelease` — on a set: values without its left-out acts, an in-set switch per act for a split session, "no photo here" hint) | `region` "Intensity panel": person chips (toggle, **only**, **All**; value with explanation), "Same as…", shared extras (`common`/`mixed` → `applySharedExtras`), act search (Enter ticks the first), scenario accordions (suggested ∪ ticked open; all while searching). `useOptimistic` over `panel-state.ts` (`reducePanel`, `personView`); unticking an act with a note, own extras or photos toasts **Undo** (`restoreContributionActsAction`); `sessionId` for the photo picker. Presets (2026-10-24): `IntensityPresetBar` + `IntensityReviewBar` under the chips, a review mark per chip, digits 1–9 / ⏎ on the panel's `onKeyDown` (not in text fields or on buttons), "Above the preset?" box (acts of the preset's scenarios above its highest act, while someone selected is to review); reducer changes `preset` / `unpreset` / `review`. `queue?` (`nextHref`, 2026-10-25): **Confirm all & next** (and ⏎) confirms every model, then `router.push(nextHref)`; keyed by session on the page |
| `IntensityPresetBar` | Client | `scenarios` (those with presets: `suggested`, `presets` with `value`), `scenarioId`, `onScenario`, `target`, `max`, `onApply` | A radiogroup "Presets for scenario" (suggested marked with a dot; **All** — `ALL_PRESETS` — at the end once two scenarios have presets: every preset, each naming its scenario), then the chosen scenario's presets as pills with their digit (1–9) and value heat pill; none at all → a link to the catalog. The panel starts it on the scenario the selection's cast suggests (else the first), keeps a pick per selection, and picking opens that scenario's acts |
| `IntensityReviewBar` | Client | `people` (`label`, `review`), `onConfirm`, `onReopen`, `onConfirmNext?` | Amber "Not rated yet / To review / n of m to review" + **Confirm ⏎**; all confirmed → green "Confirmed" + **Review again**; in the rating queue also a solid **Confirm all & next ⏎** |
| `RatingQueueBar` | Client | `queue` (`RatingQueue`), `rate` | `nav` "Rating queue" on top of a session page in rate mode (2026-10-25): *Rating n / m* · channel, **Prev** / **Next** links (keys `[` / `]` outside text fields; "Last one" at the end), **List** back |
| `RateTheseButton` | Client | `from` (`sessions` \| `sets`) | Header link on /sessions and /sets: the list's address (without paging, grouping, sort) → `rateStartHref` → `/sessions/rate` |
| `ActEvidencePicker` | Client | `sessionId`, `title`, `initialIds`, `onClose`, `onSave(ids)` | The panel's evidence picker: `MediaPickerShell` (multi, controlled) over `/api/media/search?sessionId=&galleryOnly=1`, paged; Save disabled while unchanged |
| `IntensityActCheck` | Client | `act`, `state` (all/some/none), `holders`, `value` (min–max), `explain`, `single`, `effective`, `inherited`, `saved`, `note`, `photos`, `onPhotos`, `extras`, `groups`, `onTick`, `onExtras`, `onNote`, `release?`, `preset?` (name — amber ◇ while the tick is from a preset and not confirmed) | One act, one compact line (+ photos button with count): checkbox (indeterminate for some), level, title (hover description), value badge (hover: explanation; amber at 10), "only …", note + sliders buttons (need one person) → note field / its own extras (`overridesFor`) |
| `SetIntensityPanel` | Client | `setId`, `intensity` (`SetIntensity`), `catalog` | The set's panel (2026-10-24): the session's panel with `release`; a set from several sessions picks one |
| `SetIntensitySummary` | Client | `intensity`, `catalog` | The set sidebar's Intensity box: each person's value in this release (session's minus left-out acts) |

`sessionIntensityCatalog(full)` (`catalog-view.ts`) — the catalog as the panel needs it (session and set pages), null without acts. The set page uses `SessionWorkspace` + `IntensityPanelProvider` like the session; `SetCard` takes `intensity?` (heat pill on the cover), `SetGrid` `intensity?` ({ values, max }, merged on load-more).

## Session Components (`components/sessions/`)

| Component | Type | Props | Description |
|---|---|---|---|
| `SessionMergeDialog` | Client | `sessionId`, `open`, `onOpenChange` | ⋯ → Same shoot as… on a session or a set (2026-10-18; renamed 2026-10-20 — the set's duplicate merge is "Same release imported twice…") — the finder: this session's card, a search combobox (↑/↓/Enter over a listbox) and the candidates — suggestions on open, search results after 300 ms (`getSessionMergeCandidatesAction`, newest answer wins). A pick (click/Enter) closes it and pushes the compare page (`sessionMergeHref`, 2026-10-20; `from` = the current path) |
| `MergeRoleBadge` | Server-safe | `role: "stays" \| "goes"` | **Stays** (green) / **Merged in** (amber) |
| `SessionMergeWorkspace` | Client | `comparison` | `/sessions/merge` (2026-10-20): `MergeFactsBar`, phone tabs, two `MergeSessionColumn`s (older left), `MergeConfirmBar`; owns the person filter, the pins (one per side, in a `createMergePinStore` store via `MergePinContext`), the lightbox (`GalleryLightbox` over the side's shown photos) and `MergeCompareLoupe` |
| `MergeFactsBar` | Server-safe | `survivor`, `absorbed`, `reason`, `sharedPersonIds`, `personFilter`, `onPersonFilter` | Date (with why older) / label / project / channel / content rows, differences amber; on-camera chips — green in both, else left/right only — toggle the person filter |
| `MergePinButton` | Client | `side`, `photoId` | Pin toggle on a compare tile; subscribes to the pin store for its own pinned flag only (`useSyncExternalStore`), so a pin redraws two buttons. `useMergePins(store)` gives the bar and loupe the whole pins |
| `MergeSessionColumn` | Client | `role`, `card`, `groups`, `onOpen` (stable), `filtered`, `className?` | One session: header (badge, ↗ new tab), per set a header + a memoised `JustifiedGrid` (marks off, `deferOffscreenRows`) whose `tileAction` is `MergePinButton` — a grid redraws only when its photos change (perf, 2026-10-20: 800 tiles); empty states for no photos / none with the person (`data-merge-role`, `data-set-group`) |
| `MergeCompareLoupe` | Client | `left`, `right` (`{ photos, id, name }`), `onChange(side, id)`, `onClose` | Portal, `role="dialog"`: two controlled `ZoomableImage`s sharing one `ZoomView` (Sync zoom / `S` to uncouple), ←/→ on the side last clicked, Esc closes (capture-phase keys) |
| `MergeConfirmBar` | Client | `survivor`, `absorbed`, `pinned`, `onUnpin`, `onCompare` | Sticky foot: pin slots + **Compare** (both pinned), "Afterwards: …", **Merge sessions** → `AlertDialog` → `mergeSessionsOldestSurvives` → survivor |
| `BrowserToolbar` — Esc | Client | — | Esc as the last layer (2026-10-20): with no `role=dialog/alertdialog/menu/listbox`, Radix popper or `[data-tag-selection-active]` in the DOM and no field focused, it clears the filters like **Clear all** but as `router.push` (Back restores) with an Undo toast. A reset skips the next debounced search sync (`skipSearchSyncRef`), which used to write the stale params back. The search field follows `q` when the address changes from outside (Undo, Back, a pivot — adjusted during render, 2026-10-21); before, Undo lost the search term and a late sync wrote the old filters back over the next Esc |
| `PivotScopeProvider` / `usePivot` | Client | `dateFrom`, `dateTo`, `valueParam`, `datePhrase` | `components/shared/pivot/` (2026-10-20): names the gallery's date-range params and its channel/label param; `/sets` and `/sessions` wrap their grid. `usePivot()` is `null` outside a scope (cards render plain text, e.g. on the tag page) — else `isActive(facet)`, `go(facet)` (`router.push`, a history step), `dateFacet`, `valueFacet`. Logic in `src/lib/pivot-filter.ts` (`applyPivot`, `isPivotActive`, `datePivotParts`) |
| `PivotDate` | Client | `date`, `precision`, `className?` | A card date whose year / month / day each filter (buttons with hover + `aria-pressed`); on a coarse pointer (`useCoarsePointer`) one button opening a 3-item menu |
| `PivotValue` | Client | `value`, `name`, `children`, `className?` | A card's channel or label as a filter button |
| `PivotPerson` / `PivotPersonAvatar` | Client | `personId`, `icgId`, `name`, `headshot?`, `size`, `age?` | The set/session card avatar: click filters to the person (`personId` + `personName` = `Name (ICG-ID)`), hover opens a popover (replaces the tooltip) with the big headshot and **Open profile** |
| `MergeBasketTray` | Client | — | Merge basket (2026-10-20), mounted in the root layout: fixed bottom-right (full width on phones, moves up while a selection bar or the photo compare tray is shown), the ≤2 sessions (thumb, name → session, ×), "Add one more…" with one, **Compare & merge** (`sessionMergeHref`, `from` = current URL) with two, × empties. Hidden on `/sessions/merge` |
| `useMergeBasket` / `mergeBasketStore` | Client | — | `merge-basket/merge-basket-store.ts`: module store on `sessionStorage` (`mergeBasket`, per tab) via `useSyncExternalStore`; `{ items, has, toggle(item), remove(...ids), clear }`. Capacity 2 — `toggle` adding a third drops the first with a toast. Cleared of a pair by `MergeConfirmBar` after the merge, of a session by `SessionActionsMenu` after delete |
| `MergeSessionCard` | Server-safe | `card`, `badge?`, `footer?`, `compact?` | A `SessionMergeCard`: name, date · label · project, its sets (cover, title, channel · release; +N more), or 4 photos without sets, people chips, counts |
| `MergeReasonChips` | Server-safe | `reasons` | Why a candidate is suggested: same person(s), same label (emerald), same project, released N days apart |
| `ContributionParticipantRow` | Server | `contributionId`, `sessionId`, `roleName`, `roleId?`, `roleOptions?`, `actCount?`, `creditNameOverride`, `era`, `person`, `sessionDate` | A contributor on the session page: role pill (with `roleOptions` → `ContributionRoleSwitch`), name, era pill, at-shoot snapshot. Listed leads first (`leadsFirst`) |
| `ContributionRoleSwitch` | Client | `contributionId`, `sessionId`, `roleId`, `roleName`, `options` (`{ id, name, presence }`), `actCount`, `personName` | ADR-0037: the role pill as a menu — Model ↔ Appearance (on-camera roles). To a SUPPORT role with acts ticked: an `AlertDialog` ("will be removed") first; `setContributionRoleAction`. Support's pill is dashed |
| `SessionCard` / `SessionHero` avatars | Client | — | Support after the models (`leadsFirst`), smaller and dimmed (title "Appearing") |

## Sets Components (`components/sets/`)

| Component | Type | Props | Description |
|---|---|---|---|
| `SetGrid` | Server | `sets` | Gallery grid of set cards |
| `SetCard` | Server | `set` | Set summary card: type badge, title, release date, thumbnail |
| `SetSearch` | Client | — | URL-driven text search |
| `TypeFilter` | Client | — | URL-driven SetType filter (photo / video) |
| `SetHeader` | Server | `set` | Title, type badge, release date, channel name |
| `CastSection` | Server | `contributions` | People in the set with role badges |
| `SetCastRail` | Client | `cast` (`CastMember[]`, `support?`) | The hero's cast chips; support (ADR-0037) after the models behind a vertical **Appearing** label, smaller chips (44 px), dimmed, `aria-label` "Name (appearing)". `SetCard` avatars: support after the models, 75 % size, dimmed |
| `SetMeta` | Server | `set` | Description, notes, tags, session/project links |
| `SetActionsMenu` | Client | `setId`, `setTitle`, `setType`, `sessionId?`, `onDelete`, `redirectTo?` | Set detail ⋯ menu: **Same shoot as…** (opens `SessionMergeDialog` for the set's primary session; only with `sessionId`), **Same release imported twice…** (`MergeSetSheet`), Delete — the two merges named by intent (2026-10-20) |
| `MergeSetSheet` / `MergeSetButton` | Client | `setId`, `setTitle`, `setType` (+ `open`, `onOpenChange`) | "Same release imported twice" — folds a duplicate set into this one; the set with more data survives. Points to "Same shoot as…" for different sets from one shoot |
| `EmptyState` | Server | `message?` | No results placeholder |

---

## Projects Components (`components/projects/`)

| Component | Type | Props | Description |
|---|---|---|---|
| `ProjectList` | Server | `projects` | List of project cards |
| `ProjectCard` | Server | `project` | Project summary: name, status, label count, set count |
| `ProjectSearch` | Client | — | URL-driven text search |
| `StatusFilter` | Client | — | URL-driven ProjectStatus filter |
| `SessionsList` | Server | `sessions` | Accordion of sessions with their sets |
| `EmptyState` | Server | `message?` | No results placeholder |

---

## Labels Components (`components/labels/`)

| Component | Type | Props | Description |
|---|---|---|---|
| `LabelList` | Server | `labels` | Grid of label cards |
| `LabelCard` | Server | `label` | Label summary: name, channel count, project count |
| `LabelHeader` | Server | `label` | Name, description, website link |
| `ChannelsSection` | Server | `channels` | List of channels with platform badges |
| `EmptyState` | Server | `message?` | No results placeholder |

---

## Networks Components (`components/networks/`)

| Component | Type | Props | Description |
|---|---|---|---|
| `NetworkList` | Server | `networks` | Grid of network cards |
| `NetworkCard` | Server | `network` | Network summary: name, label count |
| `NetworkHeader` | Server | `network` | Name, description |
| `NetworkLabels` | Server | `labels` | Member labels with links |
| `EmptyState` | Server | `message?` | No results placeholder |

---

## Photo Components (`components/photos/`)

Reused across person and set detail pages.

| Component | Type | Props | Description |
|---|---|---|---|
| `ImageCarousel` | Client | `photos`, `initialIndex?` | Carousel with prev/next and keyboard nav |
| `CarouselHeader` | Client | `photos`, `title?` | Profile header with photo + thumbnail strip |
| `ImageGallery` | Client | `photos`, `onPhotoClick?` | Justified grid layout |
| `Lightbox` | Client | `photos`, `initialIndex`, `onClose` | Full-screen lightbox with keyboard nav |
| `ImageUpload` | Client | `entityType`, `entityId`, `onUpload?` | Drag-and-drop upload zone |
| `ThumbnailStrip` | Client | `photos`, `activeIndex`, `onSelect` | Scrollable thumbnail row |

---

## Gallery Components (`components/gallery/`)

The image grid used by the set and session galleries. Selection and the people-shown
filter live in shared hooks (`lib/hooks/use-gallery-selection.ts`,
`lib/hooks/use-people-filter.ts`) over pure, unit-tested helpers
(`lib/gallery-selection.ts`, `lib/gallery-people-filter.ts`).

| Component | Type | Props | Description |
|---|---|---|---|
| `JustifiedGrid` | Client | `items`, `onOpen`, `selectable?`, `selectedIds?`, `onSelect?`, `onToggleSelect?(id, mods)`, `showOpenButton?`, `draggable?`, `showFavoriteBadge?`, `tileAction?(item)`, `deferOffscreenRows?` | Justified-row layout of `GalleryThumbnail`s. The selection checkbox is shown on every tile once anything is selected. `tileAction` renders a button of the grid's own top-left on each tile (the cover badge moves aside). `deferOffscreenRows` sets `content-visibility: auto` per row (with the row height as intrinsic size) for grids of hundreds of photos |
| `GalleryThumbnail` | Client | as above, per item | One tile. The checkbox and Space pass their modifier keys (`SelectModifiers`) so Shift can extend a range; Shift+mousedown suppresses text selection; `showOpenButton` adds a hover ⤢ that opens the lightbox for grids where a click selects; `markControls` (default true) — `GalleryTileMarks` up the right edge: iconic / ★ / outtake badges, toggle buttons on hover; mark tags are left out of the tag dots |
| `GalleryTileMarks` | Client | `item`, `interactive`, `showFavorite`, `className?` | The three photo marks on a tile, from `media-marks.ts` (`MARKS`, `itemMarks`): set marks as badges, all three as buttons on hover (not on touch); optimistic, persisted via `setMediaFavoriteAction` / `add|removeTagsToEntityAction` |
| `PeopleFilterBar` | Client | `cast`, `items`, `visibleItems`, `filter`, `onChange` | ADR-0023 filter: a **Groups** row of the people combinations that occur (with counts; one click = exactly that group) and **Shows** chips cycling off → must show → must not show, combined with AND |
| `GroupSelectToggle` | Client | `state` (`all`/`some`/`none`), `label`, `onToggle` | Tri-state checkbox on a gallery group header (session, clip, set, "Session only") |
| `BulkPeopleShownControl` | Client | `cast`, `selectedIds`, `onApplied` | Selection-bar popover: show / hide a person across the selected images |
| `LightboxActPill` | Client | `acts`, `linked`, `onToggle`, `open`, `onOpenChange` | Viewer toolbar (Organize), only with `GalleryLightbox`'s `actEvidence`: gauge + count of acts this photo is evidence for; popover `ActEvidenceList` (dark); key **A** (ADR-0036, 3b) |
| `LightboxOriginLink` | Client | `origin` (`MediaItemOrigin \| null \| undefined`) | The viewer bar's "back" chip (2026-10-18), left zone, only with `showOrigin`: ↶ + the first set's title (+N for more sets), tooltip with key `O` and the people shown; links `mediaOriginTarget(origin)` (set opened on the photo / reference person / session). Pulsing placeholder while loading, nothing when unknown |
| `LightboxOriginSection` | Client | `origin` | The info panel's **Origin** section: every set (each `?photo=`), the people shown (or the reference person) as `Name (ICG-ID)` links, and the session |

---

## Tag Components (`components/tags/`, ADR-0033)

| Component | Type | Props | Description |
|---|---|---|---|
| `TagPalette` | Client | `open`, `onOpenChange`, `entityType`, `selectedTagIds`, `onToggle(tag, on)` | cmdk palette (twin of the ADR-0019 collection palette). Fuzzy-finds by name, alias or group; Enter toggles and the palette stays open. Groups whose typical level fits the entity come first. An unknown name offers **Create … in <group>** — Tab / Shift+Tab cycles the group, the last one used is remembered per entity type (localStorage). Data from `/api/tags/palette` (cached per page life) |
| `EntityTagList` | Client | `tags` (`EffectiveTag[]`), `isLoading?`, `onRemove?`, `onAdd?`, `showHotkey?`, `tone?` | Effective tags: direct chips removable; inherited dashed + dimmed with "from set/session …"; overridden (exclusive group shadowed by a nearer level) struck through; workflow tags as amber badges whose ✕ reads "done" |
| `EntityTagsPanel` | Client | `entityType`, `entityId`, `initialTags?` | `EntityTagList` + `TagPalette` over `useEntityTags` — used on the person, session, set and project pages |
| `TagSlotBar` | Client | `entityType`, `onApplySlot(tag)`, `stateOf?`, `tone?` | Quick-tag slots 1–9 of the active slot set + set switcher; pencil mode assigns/clears slots (pick-mode palette) and adds/renames/deletes sets. Slots whose tag's domain does not fit `entityType` are disabled |
| `ArmedTagChip` | Client | `entityType`, `onArmRequest`, `tone?` | The armed tag (painter) with its `P` hint and ✕ to disarm, or an "Arm tag" button |
| `BulkTagControls` | Client | `entityType`, `entityIds`, `onApplied?`, `hotkeysEnabled?` | Selection-bar tagging: tri-state palette (`T`), Slots popover, armed chip; keys 1–9 / T / Shift+T / P / Shift+P act on the selection. Used by the set + session galleries and `BulkSelectionBar` (people/sets/sessions) |
| `BulkSelectionBar` | Client | `selectedIds`, `entityType`, `onClear`, `totalCount`, `onSelectAll?`, `actions?` | Floating selection bar of the people/set/session grids: count, All N, `actions` (a grid's own, e.g. sessions' **Compare & merge**, on with exactly 2 — 2026-10-20), `BulkTagControls`, clear |
| `ZoomableImage` | Client | `fitUrl`, `zoomUrl?`, `width?`, `height?`, `alt`, focal props, `onZoomChange?`, `view?`, `onViewChange?` | Pan/zoom viewer (lightbox, pickers, merge loupe); `view` + `onViewChange` = controlled `ZoomView`, so two images can zoom together |
| `TagFacetPanel` | Client | `facets`, `query`, `onChange`, `countNoun` | Facet panel: click include / Alt-click, right-click, ⊘ exclude; per-group any/all switch (≥2 included); sub-tags indented; counts; search + "unused" toggle |
| `TagFilterButton` | Client | `facets`, `query`, `onChange`, `countNoun` | "Tags" toolbar button (active count badge) opening the facet panel in a popover |
| `TagFilterChips` | Client | `entityType`, `facets`, `query`, `onChange`, `problems?` | Active tag filters as chips: one per clause with a level `<select>` (images: anywhere/image/set/session; sets: anywhere/set/session), one per exclusion, plus unresolved-term warnings |
| `SmartCollectionDialog` (collections/) | Client | `initialQuery?`, `facets`, `variant?` | Create a smart collection: name + query box; `compact` = the gallery filter's "Save as smart collection" |
| `SmartCollectionActions` (collections/) | Client | `id`, `name`, `dirty`, `preview`, `total` | Save query / Revert (while previewing), Rename, Freeze, Delete |
| `TagQueryBox` | Client | `value`, `onSubmit(text)`, `facets`, `entityType` | Text form of the tag filter with caret-token autocomplete (groups, tags, levels, predicates — `lib/tag-query/complete.ts`); ↑/↓, Tab/Enter take, Enter applies, Esc reverts; follows the applied value when chips change it |
| `TagFilterInline` | Client | `entityType`, `facets`, `value`, `onChange(text)`, `countNoun` | `TagFilterButton` + `TagQueryBox` + `TagFilterChips` for browsers that filter in the client (`/archive`, `/staging-sets`); asks the server for the query's problems (ADR-0034) |
| `TagNameClashHint` | Client | `name`, `groupName`, `excludeId?`, `onUseSuggestion?` | Naming guard: when the name already exists as a tag or alias in another group, an amber hint with a one-click thing-first alternative (`qualifiedTagName`); never blocks |
| `TagRowMenu` | Client | `tagId`, `tagName`, `open`, `onOpenChange`, `onRename/onMove/onParent/onMerge/onDelete` | The ⋯ menu of a catalogue row (also opened by right-click): rename (F2), edit details, move to group, sub-tag of, merge, delete (Del) |
| `TagMoveDialog` | Client | `tags`, `groups`, `initialGroupId?`, `open`, `onOpenChange`, `onMoved?`, `onMergeInstead?` | Pick a target group; checks the move live (`checkTagMoveAction`) and lists domain / one-per-item / same-name conflicts with numbers; Move stays off while any exist |
| `TagParentDialog` | Client | `tags`, `candidates`, `open`, `onOpenChange`, `onDone?` | Searchable parent picker (or top level) for one or many tags |
| `TagDeleteDialog` | Client | `tags` (with counts), `open`, `onOpenChange`, `onDeleted?` | Delete confirmation with how many items of each kind lose the tag and the `.pb\#…` note |
| `TagEditPanel` | Client | `tag`, `aliases`, `groups`, `initiallyOpen?` | Editor on `/tags/[id]`: name, typical level, description, aliases; buttons into the move / parent / merge / delete dialogs |
| `ArchiveFolderTags` | Client | `view: FolderTagsView`, `paletteOpen?`, `onPaletteOpenChange?` | A folder's tags (own, or its confirmed Set's) with + Tag, unknown `#…` markers as resolve chips (palette in pick mode → alias/create), conflict warning (ADR-0034) |
| `ArchiveFolderTagsLoader` | Client | `folderId`, palette control props | Loads a folder's `FolderTagsView` (staging slide panel, workbench inspector) and renders `ArchiveFolderTags` |
| `ArchiveKeyPopover` | Client | `stagingSetId`, `label` (the date as shown), `onLinked?` | A staged set's date as a trigger (hover 300 ms, click pins, Enter): lists the archive folders with its day + channel (Label siblings) and the near misses (±2 days, day/month swapped) in archive form, person/title agreement in green, each folder's link state, the day's staged sets and Sets with the folder each holds ("Sets on this day"), **Link** → `confirmArchiveFolderLinkAction`. Fetches once on open (`getArchiveKeyFoldersAction`) |
| `GalleryTagFilter` | Client | `facets`, `problems?`, `shown`, `total`, `allowSmartSave?`, `value?` | Tag filter row for image galleries (set, session, favorites), reading/writing `?tags=` |
| `TagCatalogTree` | Client | `groups` (`TagTreeGroup[]`) | /tags catalogue: groups → tag tree with own-use counts per entity type; search; inline rename, move-under select, merge (`TagMergeDialog`), delete; drag a tag onto another of its group → sub-tag / merge dialog |
| `TodoInbox` | Client | `todos` (`TodoTag[]`) | Workflow To-do: per workflow tag, its items (list + image thumbnails) with **Done** (removes that tag) |
| `TagDotStrip` | Server-safe | `tags?` (`TagChipData[]`), `max?` | One dot per **direct** tag in its group colour on gallery/media tiles; names in tooltip + aria-label |

`useEntityTags(entityType, entityId, initialTags?)` (`hooks/use-entity-tags.ts`) is the
controller: effective tags, optimistic `toggle`/`remove` through add/remove actions (never a
full replace), then a re-read so inherited/overridden flags stay right. The lightbox owns one
for the current image and shares it between the info panel and its `T` palette.
`BrowserToolbar` accepts a `tags` filter group (`entityType`, `facets`, `countNoun`, `problems`) and renders `TagFilterButton` + `TagFilterChips` from the `tags` URL param.
`useBulkTagging` (selection counts + add-to-all / remove-from-all), `useTagSlots` (module-level
slot-set store), `useArmedTag` (localStorage, `useSyncExternalStore`) and `useTagHotkeys` (same
dialog/typing guard as the gallery selection keys) back the S3 controls; `applyTagChangeToItems`
(`lib/gallery-tag-update.ts`) updates gallery tiles after a bulk change.

---

### Settings navigation (`components/settings/`)
| Component | Type | Props | Description |
|---|---|---|---|
| `SettingsNavProvider` | Client | `children` | Folded/unfolded state of the settings navigation, remembered in `localStorage` (guarded); `useSettingsNav()` → `{ collapsed, toggle }` |
| `SettingsSidebar` | Client | — | Section list; its panel button folds it to an icon rail (labels as `aria-label`/`title`) |
| `CatalogsSidebar` | Client | — | Catalog list; hidden while the settings navigation is folded |

### Intensity catalog (`components/settings/intensity/`, ADR-0036)
| Component | Type | Props | Description |
|---|---|---|---|
| `IntensityCatalogEditor` | Client | `catalog` (`IntensityCatalog`) | Settings → Catalogs → Intensity: a board with the act's panel beside it (K2), the sticky scale column opaque (card colour over the page background); each lane tinted with its heat colour at 7 % (`color-mix`, none while lit), every other scenario column `bg-foreground/[0.03]` (`role="table"`, `DndContext` id `intensity-board`, `DragOverlay` portalled to the body) — lanes = intensity values (`intensityRows()` from the board layout; "Half steps" toggle, all half steps while a card is held), compact by default ("Descriptions" toggle unfolds), sticky scale column, scenario columns + "add scenario"; then the extras panel |
| `IntensityScaleCell` | Client | `value`, `title`, `description`, `showDescription`, `onToggleDescription`, `maxName`, `max`, `active?` (the held card's lane), `selected?`, `onOpen` — to read: title (click → the level's panel, double-click → rename; `data-level`), ▸ unfolds the description (read-only) | Row header: the value, its title (inline) and description (inline textarea when unfolded, hover text when folded); the 10 row names Max |
| `IntensityScenarioHeader` | Client | `scenario`, `isFirst`, `isLast`, `focused`, `onFocusChange` | Column header ‹ ⋯ name ⤢ ›: inline rename, move, focus toggle (this scenario alone at full width); delete in the ⋯ menu with a confirmation (blocked while ticked) |
| `IntensityActCell` | Client | `scenario`, `level`, `acts`, `showDescriptions`, `dragging?`, `dropBeforeId?`, `selectedId?`, `onOpen` | One cell: a droppable + `SortableContext` of the scenario's acts on that level in their order, + "+ Act" (hover) to add one there; lit with a line where a card from another cell would land (`dropBeforeId`: before that act, `null` at the end) |
| `IntensityActRow` | Client | `act`, `showDescription`, `selected?`, `onOpen(id)` | One act, a sortable card (`data-act-id`; whole card drags — mouse after 6 px, touch after a 250 ms hold, Space for the keyboard; fields inside don't start a drag): title (description as hover text when folded, read-only text when unfolded) and the tick count (`3×`). Click / Enter → `onOpen`; double-click / F2 → rename in place (Enter saves, Esc leaves); `selected` rings it (`aria-current`) |
| `IntensityActPanel` | Client | `act`, `scenarioId`, `scenarios`, `onClose`, `onStep(±1)`, `canStep`, `className?` | The act's side-peek (K2), an `<aside>` "Act …": inline name, ↑ ↓ ✕, scenario `<select>` (→ `moveIntensityActsAction` at the same level), level `IntensityStepInput`, description textarea, "Ticked in N sessions" + list `Name (ICG-ID)` · date · session (read by `getIntensityActUsageAction` on open), delete with confirmation (disabled while ticked) |
| `IntensityDragCard` | Client | `name`, `start`, `grip`, `width` | The card in hand during a mouse/finger drag, portalled to the body: follows `mousemove`/`touchmove` itself, so it stays where it was gripped whatever shifts beneath it (keyboard drags use dnd-kit's `DragOverlay`) |
| `IntensityExtrasPanel` | Client | `groups`, `extras`, `scaleMax` | Two columns: left Max (rename only) and the ungrouped extras ("any combination"); right "New group", then one card per extra group ("pick one") |
| `IntensityPresetsPanel` | Client | `presets`, `scenarios`, `groups`, `extras`, `max` | Settings → Intensity, `#presets`: per scenario (two columns on wide screens) its presets and "New {scenario} preset"; one card per preset (acts of that scenario only, extras counting there) (▸ opens: description, acts per scenario as toggle pills with their level's heat colour, `IntensityExtrasPicker` for its extras), digit, value heat pill (`presetValue`), tick count, ↑ ↓, delete; "New preset" opens the new one |
| `IntensityCatalogTransfer` | Client | — | Settings → Intensity header: **Export** (link to `/api/intensity-catalog/export`) and **Import…** (file input → `previewIntensityCatalogImportAction`) → a dialog with problems (sheet, row), changes per sheet (+ added, ✎ changed with field details, − removed) and what stays because sessions use it; **Apply** (disabled with problems or nothing to change) sends the file with the preview's fingerprint |
| `IntensityExtraRow` | Client | `extra`, `groups` | One extra in one slim line: first the group icon — in a group ⛓ "Take … out of its group" (→ No group), without one a menu "Put … into a group" —, then inline name, points field, use count, delete (blocked while used) at the far end |
| `IntensityStepInput` | Client | `value`, `label`, `prefix?`, `onCommit`, `autoFocus?` | Number in 0.5 steps; saves 0.7 s after the last change, on Enter or blur (once); Esc or an invalid value restores; never disables itself, so arrow-stepping keeps focus |
| `IntensityAddInput` | Client | `placeholder`, `label`, `onAdd`, `onClose?`, `autoFocus?` | One-line add field; Enter adds and keeps the field ready; with `onClose`, Esc or leaving it empty closes it |

`IntensitySeam` (`intensity-seam.tsx`, props `value`, `boundary`, `open`, `onToggle`, `selected`, `onOpen(id)`, `headClassName`, `stripColor`) — the seam between two lanes (2026-10-23): without a boundary a zero-height row whose head offers "+ Boundary" on hover (→ name field; the new boundary's panel opens); with one a `separator` "Boundary at 4.5: title" — folded: zero height, the dashed line on the seam, ▸ and a pill ◆ title (`data-boundary-id`; description as hover text; click → panel, double-click → `IntensityRenameInput`); unfolded: a band in the head to read the description. The editor inserts one before every lane but the first; "Boundaries" unfolds all.

`IntensityBoundaryLine` (`intensity-boundary-line.tsx`, props `title`, `description`) — a boundary's dashed line across the board; an 8 px band along it is a hover zone, and title + description follow the pointer (portalled `tooltip`).

`IntensityScenarioScope` (`intensity-scenario-scope.tsx`, props `of`, `off`, `scenarios`, `onChange`) — the layers icon with a "Counts in" menu of scenario checkboxes (stays open); coloured while some are off; `scopeHint(off, scenarios)` → "not in Solo". In a group's header (before its name) and in a free extra's line.

`IntensityPanelShell` (`intensity-panel-shell.tsx`) — the frame of every catalog panel: `<aside>` with heading, ↑ ↓ ("Previous/Next {stepNoun}") ✕ ("Close the panel"). Used by `IntensityActPanel`, `IntensityLevelPanel` (value pill + title, description, acts on the level → their panels, Max note) and `IntensityBoundaryPanel` (title, "between a and b", description, delete with Undo). `IntensityRenameInput` — the in-place rename (double-click) for a value's title and a boundary's pill.

`IntensityMaxInput` (`intensity-max-input.tsx`, props `max`) — the "Max" field above the board: a whole number 3–20, saved on Enter/blur (`setIntensityMaxAction`), Esc restores; a refused lowering toasts the acts / values in the way.

`useCatalogCall()` runs a catalog action, refreshes, toasts a failure and throws so `InlineEditable` stays open.

`useActSelection(layout, scenarioIds, levels, known, scale)` (`use-act-selection.ts`, K2; levels and boundaries 2026-10-23) — what is open from `?act=` / `?level=` / `?boundary=` (one at a time, `useSearchParams`); `neighbour(±1)` walks cards in reading order or the scale (boundary before the level it is crossed into); set with the History API (push when none was open, replace when switching; close goes Back when it pushed), `neighbour(±1)` in reading order (column, level, order). `useWideScreen()` (≥ 1024 px): the panel docks beside the board (sticky), narrower it is a right `Sheet`. The editor binds ↑/↓/Esc while the panel is open (not while typing, dragging or in a dialog) and scrolls the open card into view.

`useActBoard(catalog)` (`use-act-board.ts`, K1) — the board's drag state: `layout` (cell `scenarioId|level` → act ids), `target` (another cell the held card would land in), `overLevel` (the lane under the held card, lit with its scale cell), `follow` (start/grip for `IntensityDragCard`), `dnd` props (sensors, pointer-first collision with a nearest-cell fallback and `closestCenter` for the keyboard, named announcements). A drop moves optimistically, saves via `moveIntensityActsAction`, toasts "→ Scenario · level" with **Undo**; `swallowClickAfterDrag` keeps the click that ends a drag from opening an editor.

## Shared Components (`components/shared/`)

| Component | Type | Props | Description |
|---|---|---|---|
| `TagInput` | Client | `value`, `onChange`, `placeholder?` | Tokenizer — press Enter to add tag badges |
| `TagPicker` | Client | `scope`, `selectedTagIds`, `onChange`, … | Inline search-and-pick for tag ids before an entity exists (set/project create sheets) and in the bulk bar |
| `TagChips` | Client | `tags`, `onRemove?`, `compact?` | Plain coloured chips |
| `DeleteButton` | Client | `onDelete`, `label?` | Destructive button with confirmation AlertDialog |

---

## Component Rules

1. One component per file
2. Props type `{ComponentName}Props` defined at top of file
3. No `any` types — use Prisma-generated types from `lib/types/`
4. No default exports (except Next.js pages/layouts)
5. Server Components never import `"use client"` modules
6. Client Components are self-contained (manage their own URL param updates)
