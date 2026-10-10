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

---

## Sets Components (`components/sets/`)

| Component | Type | Props | Description |
|---|---|---|---|
| `SetGrid` | Server | `sets` | Gallery grid of set cards |
| `SetCard` | Server | `set` | Set summary card: type badge, title, release date, thumbnail |
| `SetSearch` | Client | — | URL-driven text search |
| `TypeFilter` | Client | — | URL-driven SetType filter (photo / video) |
| `SetHeader` | Server | `set` | Title, type badge, release date, channel name |
| `CastSection` | Server | `contributions` | People in the set with role badges |
| `SetMeta` | Server | `set` | Description, notes, tags, session/project links |
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
| `JustifiedGrid` | Client | `items`, `onOpen`, `selectable?`, `selectedIds?`, `onSelect?`, `onToggleSelect?(id, mods)`, `showOpenButton?`, `draggable?`, `showFavoriteBadge?` | Justified-row layout of `GalleryThumbnail`s. The selection checkbox is shown on every tile once anything is selected |
| `GalleryThumbnail` | Client | as above, per item | One tile. The checkbox and Space pass their modifier keys (`SelectModifiers`) so Shift can extend a range; Shift+mousedown suppresses text selection; `showOpenButton` adds a hover ⤢ that opens the lightbox for grids where a click selects |
| `PeopleFilterBar` | Client | `cast`, `items`, `visibleItems`, `filter`, `onChange` | ADR-0023 filter: a **Groups** row of the people combinations that occur (with counts; one click = exactly that group) and **Shows** chips cycling off → must show → must not show, combined with AND |
| `GroupSelectToggle` | Client | `state` (`all`/`some`/`none`), `label`, `onToggle` | Tri-state checkbox on a gallery group header (session, clip, set, "Session only") |
| `BulkPeopleShownControl` | Client | `cast`, `selectedIds`, `onApplied` | Selection-bar popover: show / hide a person across the selected images |

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
