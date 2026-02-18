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

## Shared Components (`components/shared/`)

| Component | Type | Props | Description |
|---|---|---|---|
| `TagInput` | Client | `value`, `onChange`, `placeholder?` | Tokenizer — press Enter to add tag badges |
| `DeleteButton` | Client | `onDelete`, `label?` | Destructive button with confirmation AlertDialog |

---

## Component Rules

1. One component per file
2. Props type `{ComponentName}Props` defined at top of file
3. No `any` types — use Prisma-generated types from `lib/types/`
4. No default exports (except Next.js pages/layouts)
5. Server Components never import `"use client"` modules
6. Client Components are self-contained (manage their own URL param updates)
