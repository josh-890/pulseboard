# Person Pages — Design Principles & Structure

This document captures the design decisions, component architecture, and style conventions
for the People section of Pulseboard: the `/people` list page and `/people/[id]` detail page.

---

## 1. Design Philosophy

### Information Hierarchy

Person pages follow a **talent-management UX** model: the person is the primary entity,
and everything else (sets, labels, connections) is context around them. Design decisions
prioritize:

1. **Identity first** — name, photo, status, and ICG-ID are always visible
2. **Physical profile second** — age, nationality, appearance traits surface early
3. **Career & network third** — work history and connections are one click deeper
4. **Progressive disclosure** — the list page shows just enough to scan and select;
   the detail page reveals everything in organized tabs

### Card-Based Scanning

Both the list page and detail page use **glassmorphism cards** (`bg-card/70 backdrop-blur-sm
border-white/20`) as the primary content container. Cards are scannable, grouped by topic,
and maintain consistent padding/rounding across the application.

### Density Awareness

The list page supports two density modes (comfortable / compact) via `useDensity()`.
Compact mode hides secondary information (birth alias, tags) and shrinks photo/text sizes
to fit more cards on screen.

---

## 2. Hero Card (Detail Page)

The hero card is the topmost section of `/people/[id]`, rendered inside `PersonDetailTabs`.
It uses a **3-column layout** on desktop: photo carousel, identity info, and KPI stats panel.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ┌───────────┐  Name (ICG-ID)                ┌───── KPI Panel ──────────┐  │
│  │           │  [birth] Alias [alias] Alias   │ She started in 2018 at  │  │
│  │  Photo    │  🌍 USA · 25 yrs · Female      │ age 21. Working for 8   │  │
│  │ Carousel  │  ● Active — Since 2024         │ years, now 29.          │  │
│  │ 200×250   │  ★ ★ ★ ★ ☆  4/5               │                         │  │
│  │           │                                │  ┌─────┐ ┌─────┐        │  │
│  │           │                                │  │  12  │ │  3  │        │  │
│  └───────────┘                                │  │ Sets │ │Labels│       │  │
│                                               │  ├─────┤ ├─────┤        │  │
│                                               │  │  45  │ │  8  │        │  │
│                                               │  │Photos│ │Conn.│        │  │
│                                               │  └─────┘ └─────┘        │  │
│                                               │                         │  │
│                                               │  PGRADE            7/10 │  │
│                                               │  [██████████░░░░░░░░░░] │  │
│                                               └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Field Inventory

| Field | Source | Display |
|-------|--------|---------|
| Photo | `CarouselHeader` + `photos[]` | 200×250px carousel with profile label management |
| Display name | `person.commonAlias (person.icgId)` | `<h1>` bold text |
| Aliases | `person.aliases[]` (non-common) | Colored pills by `AliasType` |
| Nationality | `person.nationality` | Globe icon + ISO alpha-3 code |
| Age | `computeAge(person.birthdate)` | "X yrs" |
| Sex at birth | `person.sexAtBirth` | Plain text |
| Status | `person.status` | Colored dot + label + "Since YYYY" |
| Rating | `person.rating` | 1–5 star icons (filled amber / empty muted) |
| Career summary | `buildCareerSummary(person)` | Pronoun-aware text: start year, age, years working |
| Stats grid | `kpiCounts` (sets, labels, photos, connections) | 2x2 tile grid with icons + counts |
| PGRADE | `person.pgrade` | 10-segment colored horizontal bar gauge (hidden when null) |

### KPI Stats Panel

The right-hand column shows:
1. **Career summary text** — derived from `activeSince`, `birthdate`, `sexAtBirth`, and `status`
   - Pronouns: Female → She, Male → He, null → They
   - Active: "She started in 2018 at age 21. Working for 8 years, now 29."
   - Inactive: "She started in 2018 at age 21. Retired."
   - Hidden when `activeSince` is null
2. **Stats grid** — 2×2 compact tiles showing Sets, Labels, Photos, Connections counts
3. **PGRADE gauge** — 10-segment bar with domain-specific RGB colors, filled segments at full opacity,
   unfilled at 12% opacity. Hidden when `pgrade` is null.

### PGRADE Segment Colors

| Seg | Color |
|-----|-------|
| 1 | `rgb(162,214,176)` |
| 2 | `rgb(177,214,160)` |
| 3 | `rgb(196,214,140)` |
| 4 | `rgb(213,200,125)` |
| 5 | `rgb(230,176,110)` |
| 6 | `rgb(224,155,110)` |
| 7 | `rgb(219,133,110)` |
| 8 | `rgb(214,110,110)` |
| 9 | `rgb(171,103,143)` |
| 10 | `rgb(128,96,176)` |

### Responsive Behavior

- **Desktop (sm+)**: 3-column layout — photo, identity (flex-1), KPI panel (w-52 shrink-0)
- **Mobile (< sm)**: all three sections stack vertically, KPI panel goes full width
- Photo fallback: initials circle (`getInitialsFromName`) in `bg-primary/10`

---

## 3. Tab Structure

Five tabs organize the detail page content. Each tab is lazy-rendered (only mounts when
active) to keep the initial paint fast.

| Tab | Icon | Badge | Purpose |
|-----|------|-------|---------|
| Overview | `BookUser` | — | Identity, digital identities, notes, persona history |
| Appearance | `Fingerprint` | — | Physical stats, body marks |
| Career | `Film` | work history count | Work history table, skills, label affiliations |
| Network | `Network` | connections count | Interpersonal connections |
| Photos | `Camera` | photos count | Gallery + upload |

### Why Five Tabs

- **Overview** collects the "who is this person" basics — prevents the page from being
  one long scroll of unrelated sections
- **Appearance** is separated because physical attributes are a distinct concern in
  talent management (casting, continuity tracking)
- **Career** groups all professional context (sets, labels, skills) into one view
- **Network** isolates relationship data, which has its own interaction patterns
- **Photos** deserves its own space for gallery browsing and bulk upload

### Tab Bar

- ARIA: `role="tablist"` container, each tab is `role="tab"` with `aria-selected` and
  `aria-controls` pointing to its panel
- Active tab: `bg-background text-foreground shadow-sm`
- Inactive tab: `text-muted-foreground hover:text-foreground`
- Mobile: `overflow-x-auto scrollbar-none` for horizontal scrolling
- Badge counts use `bg-muted/80 text-muted-foreground` rounded pills

---

## 4. Tab Content Details

### Overview Tab

2-column responsive grid (`grid-cols-1 lg:grid-cols-2`):

| Column | Section | Contents |
|--------|---------|----------|
| Left | Basic Info | Birthdate, birth place, location, nationality, ethnicity, sex at birth |
| Left | Digital Identities | Platform + handle rows from `currentState.activeDigitalIdentities` |
| Right | Notes & Tags | Tag pills + freetext notes |
| Right | History | Collapsible persona timeline (`ChevronDown`/`ChevronUp` toggle) |

### Appearance Tab

2-column responsive grid:

| Column | Section | Contents |
|--------|---------|----------|
| Left | Physical Stats | Static: height, eye color, natural hair, body type, measurements; Separator; Computed: current hair, weight, build, vision aids, fitness level |
| Right | Body Marks | `BodyMarkCard` list from `currentState.activeBodyMarks` |

### Career Tab

Full-width stacked sections:

| Section | Contents |
|---------|----------|
| Professional | Active since, specialization, `SkillItem` list |
| Work History | Scrollable table: Title / Type / Role / Label / Released — set titles link to `/sets/[id]` |
| Affiliations | Chip grid: label name + set count badge |

### Network Tab

| Section | Contents |
|---------|----------|
| Connections | 2-column grid of connection cards: avatar initials, name, shared set count, relationship source badge, optional label |

### Photos Tab

| Section | Contents |
|---------|----------|
| Gallery | `JustifiedGallery` component |
| Upload | `ImageUpload` component; triggers `router.refresh()` on complete |

---

## 5. Person Cards (`/people` List)

Person cards are rendered by `PersonCard` in a responsive grid via `PersonList`.

### Card Layout

```
┌──────────┬──────────────────────────────────────┐
│          │  Display Name (ICG-ID)   [Active]    │
│  Photo   │  AKA: Birth Name                     │
│  100×140 │  🌍 USA · 25 yrs · ✦ Blonde · 📍 LA │
│          │  [dancer] [model] [+2]                │
└──────────┴──────────────────────────────────────┘
```

### Grid Columns by Density

| Density | sm | lg | xl | 2xl |
|---------|----|----|----|----|
| Comfortable | 2 | 3 | 4 | 5 |
| Compact | 2 | 4 | 5 | 6 |

### Field Priority (what shows at each density)

| Field | Comfortable | Compact |
|-------|:-----------:|:-------:|
| Display name + ICG-ID | Yes | Yes (smaller) |
| Status badge | Yes | Yes (smaller) |
| Meta row (nationality, age, hair, location) | Yes | Yes (smaller icons) |
| Birth alias (AKA) | Yes | Hidden |
| Tags (max 3 + overflow count) | Yes | Hidden |
| Photo | 100×140px | 72×100px |

### Card Sizing

- Comfortable: `sm:h-[140px]`, photo `sm:w-[100px]`
- Compact: `sm:h-[100px]`, photo `sm:w-[72px]`
- Mobile: stacks vertically (`flex-col`), photo 120px tall full-width

### Interaction States

- Hover: `border-white/30 bg-card/90 shadow-lg -translate-y-0.5`
- Active: `scale-[0.98] shadow-sm translate-y-0`
- Focus-visible: `ring-2 ring-ring ring-offset-2`
- Transition: `duration-200`

---

## 6. Component Architecture

### Key Components

| Component | File | Type | Purpose |
|-----------|------|------|---------|
| `PersonCard` | `components/people/person-card.tsx` | Client | List card with density support |
| `PersonList` | `components/people/person-list.tsx` | Client | Grid layout + pagination |
| `PersonSearch` | `components/people/person-search.tsx` | Client | Debounced (300ms) text search |
| `StatusFilter` | `components/people/status-filter.tsx` | Client | Status pill filter bar |
| `PersonDetailTabs` | `components/people/person-detail-tabs.tsx` | Client | Hero card + 5-tab panel system |
| `AddPersonSheet` | `components/people/add-person-sheet.tsx` | Client | Create person slide-in form |
| `EditPersonSheet` | `components/people/edit-person-sheet.tsx` | Client | Edit person slide-in form |
| `BodyMarkCard` | `components/people/body-mark-card.tsx` | Server | Body mark display card |
| `DigitalIdentityRow` | `components/people/digital-identity-row.tsx` | Server | Identity platform + handle row |
| `SkillItem` | `components/people/skill-item.tsx` | Server | Skill name + level badge row |
| `PersonaTimelineEntry` | `components/people/persona-timeline-entry.tsx` | Server | Timeline dot + persona change card |

### Internal Sub-Components (inside `person-detail-tabs.tsx`)

| Component | Purpose |
|-----------|---------|
| `HeroCard` | Photo carousel + identity + vitals + status + rating + KPI panel |
| `KpiStatsPanel` | Career summary text + 2×2 stats grid + PGRADE gauge |
| `PgradeGauge` | 10-segment colored horizontal bar for PGRADE 1–10 |
| `OverviewTab` | Basic info, digital identities, notes, history |
| `AppearanceTab` | Physical stats, body marks |
| `CareerTab` | Professional info, work history table, affiliations |
| `NetworkTab` | Connection cards grid |
| `PhotosTab` | Gallery + upload |
| `SectionCard` | Glassmorphism card wrapper with icon + title + optional count badge |
| `EmptyState` | Italic muted placeholder for empty sections |
| `StarRating` | 1–5 filled/empty star icons |
| `InfoRow` | `<dt>/<dd>` pair with fixed-width label column |

### Data Flow

```
Server Page (page.tsx)
  ├── getPersonWithDetails(id)      ─┐
  ├── getPersonWorkHistory(id)       │  5 parallel fetches
  ├── getPersonConnections(id)       │
  ├── getPhotosForEntity("person")   │
  ├── getProfileImageLabels()       ─┘
  ├── deriveCurrentState(person)     ── sync fold
  ├── deriveAffiliations(workHistory) ── sync fold
  ├── strip photo.variants           ── RSC payload optimization
  └── <PersonDetailTabs ... />       ── single client component boundary
```

The detail page keeps a **single client component boundary** at `PersonDetailTabs`.
All data is fetched server-side, derived server-side, and passed as serializable props.
This avoids waterfalls and keeps the client bundle focused on interactivity (tab switching,
collapsibles, photo upload).

---

## 7. Data Layer

### `PersonWithCommonAlias` (list card type)

Flat record returned by `getPersonsPaginated` / `getPersons`:

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | UUID |
| `icgId` | `string` | Unique identifier (uppercase) |
| `commonAlias` | `string \| null` | Display name from `AliasType.common` alias |
| `birthAlias` | `string \| null` | Name from `AliasType.birth` alias |
| `status` | `PersonStatus` | active / inactive / wishlist / archived |
| `birthdate` | `Date \| null` | |
| `nationality` | `string \| null` | ISO alpha-3 |
| `naturalHairColor` | `string \| null` | |
| `location` | `string \| null` | |
| `tags` | `string[]` | |
| `specialization` | `string \| null` | |
| `activeSince` | `Date \| null` | |

### `PersonCurrentState` (derived type)

Produced by `deriveCurrentState()` — a **sync** pure function that folds persona data
chronologically to compute the person's current physical state:

| Field | Type |
|-------|------|
| `currentHairColor` | `string \| null` |
| `weight` | `number \| null` |
| `build` | `string \| null` |
| `visionAids` | `string \| null` |
| `fitnessLevel` | `string \| null` |
| `activeBodyMarks` | `BodyMarkWithEvents[]` |
| `activeDigitalIdentities` | `PersonDigitalIdentityItem[]` |
| `activeSkills` | `PersonSkillItem[]` |

### Key Utilities

| Function | File | Purpose |
|----------|------|---------|
| `computeAge(birthdate: Date)` | `lib/utils.ts` | Completed years, handles month/day boundary |
| `getDisplayName(alias, icgId)` | `lib/utils.ts` | `"Name (ICG-ID)"` or just `"ICG-ID"` |
| `getInitialsFromName(name)` | `lib/utils.ts` | Up to 2 initials, `"?"` for empty |
| `formatRelativeTime(date)` | `lib/utils.ts` | "3 days ago", "just now", etc. |

### Service Query Shape

The person service (`lib/services/person-service.ts`) uses two query strategies:

1. **List queries** (`getPersonsPaginated`): cursor-based, 50/page max 500, searches
   `icgId` and `aliases.name` with `mode: "insensitive"`, returns flat
   `PersonWithCommonAlias` records
2. **Detail queries** (`getPersonWithDetails`): eager-loads all relations (aliases,
   personas with physicalChange + bodyMarkEvents + digitalIdentities + skills),
   then `deriveCurrentState` and `deriveAffiliations` fold the data without extra
   DB round trips

---

## 8. Responsive & Accessibility

### Mobile Tab Scrolling

The tab bar uses `overflow-x-auto scrollbar-none` so all five tabs remain accessible
on narrow screens without wrapping. Touch users can swipe horizontally.

### Keyboard Navigation

- Tab bar tabs are `<button>` elements with proper `role="tab"` and `aria-selected`
- Focus ring: `focus-visible:ring-2 ring-ring ring-offset-2` on all interactive elements
- Person cards are wrapped in `<Link>` with `group-focus-visible` ring styling
- Collapsible sections (History) toggle with `<button>` + `ChevronDown`/`ChevronUp`

### ARIA Roles

| Element | Role | Attributes |
|---------|------|------------|
| Tab container | `tablist` | — |
| Each tab | `tab` | `aria-selected`, `aria-controls` |
| Tab panel | `tabpanel` | `id` matching `aria-controls` |
| Status filter | group of buttons | active button uses `bg-primary` |

### Skeleton Loading

Both `/people/loading.tsx` and `/people/[id]/loading.tsx` mirror their page layouts
exactly with animated pulse placeholders. Key dimensions match:

- List card skeleton: `sm:h-[140px]` with photo + text placeholders
- Detail skeleton: hero `h-[250px] w-[200px]` photo + 5 tab buttons + 2-column grid

> **Maintenance rule**: any change to page layout must be reflected in the corresponding
> `loading.tsx` skeleton to maintain visual continuity during loading.

---

## 9. Style Conventions

### Status Colors

Used consistently across hero card, list cards, and filter pills:

| Status | Background | Text | Dot |
|--------|-----------|------|-----|
| Active | `emerald-500/15` | `emerald-600` / `emerald-400` (dark) | `emerald-500` |
| Inactive | `slate-500/15` | `slate-600` / `slate-400` (dark) | `slate-400` |
| Wishlist | `amber-500/15` | `amber-600` / `amber-400` (dark) | `amber-500` |
| Archived | `red-500/15` | `red-600` / `red-400` (dark) | `red-500` |

### Alias Pill Styles

| Type | Border | Background | Text |
|------|--------|------------|------|
| Common | `primary/30` | `primary/10` | `primary` |
| Birth | `amber-500/30` | `amber-500/10` | `amber-600` / `amber-400` (dark) |
| Alias | `white/15` | `muted/50` | `foreground` |

### Contribution Role Badges

| Role | Color Family |
|------|-------------|
| Main | Blue |
| Supporting | Purple |
| Background | Slate |

### Set Type Badges

| Type | Color Family |
|------|-------------|
| Photo | Sky |
| Video | Violet |

### Relationship Source Badges

| Source | Color Family |
|--------|-------------|
| Derived | Slate |
| Manual | Primary |

### Skill Level Colors

| Level | Color |
|-------|-------|
| Beginner | Slate |
| Intermediate | Blue |
| Advanced | Violet |
| Professional | Emerald |
| Expert | Amber |

### Body Mark Type Colors

| Type | Color |
|------|-------|
| Tattoo | Indigo |
| Scar | Rose |
| Mark | Amber |
| Burn | Orange |
| Deformity | Slate |
| Other | Muted |

### Glassmorphism Cards

All section cards follow the standard glass card pattern:

```css
bg-card/70 backdrop-blur-sm border border-white/20 rounded-2xl shadow-md
```

Hover state (interactive cards only):

```css
hover:border-white/30 hover:bg-card/90 hover:shadow-lg hover:-translate-y-0.5
```

### Badge & Count Conventions

- Status badges: `rounded-full border px-1.5 py-0.5 text-xs font-medium`
- Tab count badges: `bg-muted/80 text-muted-foreground rounded-full px-1.5 text-xs`
- Tag pills: `rounded-full border border-white/10 bg-muted/60 px-1.5 py-0.5 text-[10px]`
- Overflow count: same as tag pill, content `+N`
