# Pulseboard — Application Architecture

## Page Structure (App Router)

```
app/
├── layout.tsx                    # Root layout
│   ├── ThemeProvider             # Dark/light mode context
│   └── AppShell                  # Sidebar (desktop) + Drawer (mobile)
│
├── page.tsx                      # / — Dashboard (async Server Component)
│   ├── KPI Cards                 # Total persons, sets, labels, recent additions
│   ├── Activity Feed             # Recent activity list
│   └── Quick Actions             # Shortcut buttons
│
├── people/
│   ├── page.tsx                  # /people — People browser (async Server Component)
│   │   ├── PersonSearch          # Client: URL-driven text search
│   │   ├── StatusFilter          # Client: URL-driven status filter
│   │   ├── AttributeFilters      # Client: hair/body/ethnicity filters
│   │   └── PersonList            # Grid of person cards
│   │
│   └── [id]/
│       └── page.tsx              # /people/[id] — Person detail
│           ├── PersonHeader      # Primary alias, avatar, status badge, rating
│           ├── ProfileSection    # Demographics, physical, career
│           ├── PersonasSection   # Working identities list
│           ├── AliasesSection    # All known names
│           ├── PhotoGallery      # Profile/reference photos with lightbox
│           ├── WorkHistory       # Sets they appeared in, with role + date
│           ├── Affiliations      # Labels derived from set contributions
│           ├── Connections       # Co-workers (shared sets + manual relationships)
│           └── NotesSection      # Rating, notes, personal tags
│
├── sets/
│   ├── page.tsx                  # /sets — Set gallery (async Server Component)
│   │   ├── TypeFilter            # Client: photo / video filter
│   │   ├── SetSearch             # Client: URL-driven text search
│   │   └── SetGrid               # Gallery of set cards
│   │
│   └── [id]/
│       └── page.tsx              # /sets/[id] — Set detail
│           ├── SetHeader         # Title, type badge, release date, channel
│           ├── PhotoGallery      # Photos with lightbox (photo sets)
│           ├── CastSection       # People in this set with roles
│           └── SetMeta           # Description, notes, tags, session/project links
│
├── projects/
│   ├── page.tsx                  # /projects — Project list (async Server Component)
│   │   ├── ProjectSearch         # Client: URL-driven text search
│   │   ├── StatusFilter          # Client: URL-driven status filter
│   │   └── ProjectList           # List of project cards
│   │
│   └── [id]/
│       └── page.tsx              # /projects/[id] — Project detail
│           ├── ProjectHeader     # Name, status, tags
│           ├── LabelsSection     # Co-owning labels
│           └── SessionsList      # Sessions with their sets
│
├── labels/
│   ├── page.tsx                  # /labels — Label browser
│   │
│   └── [id]/
│       └── page.tsx              # /labels/[id] — Label detail
│           ├── LabelHeader       # Name, description, website
│           ├── ChannelsSection   # Channels owned by this label
│           ├── ProjectsSection   # Projects co-owned by this label
│           └── PeopleSection     # People associated via sets
│
├── networks/
│   ├── page.tsx                  # /networks — Network browser
│   │
│   └── [id]/
│       └── page.tsx              # /networks/[id] — Network detail
│           ├── NetworkHeader     # Name, description
│           ├── LabelsSection     # Member labels
│           └── StatsSection      # Aggregated stats (set count, person count)
│
└── settings/
    └── page.tsx                  # /settings — Settings
```

---

## Component Hierarchy

```
RootLayout
├── ThemeProvider (context)
└── AppShell
    ├── Sidebar (desktop: fixed left, collapsible)
    │   ├── Logo
    │   ├── Nav Links (/, /people, /sets, /projects, /labels, /networks, /settings)
    │   └── Collapse Toggle
    │
    ├── MobileDrawer (mobile: hamburger → slide-out)
    │   └── Same nav as Sidebar
    │
    └── Main Content Area
        └── {page content}
```

---

## Component Folder Organization

```
components/
├── ui/                           # shadcn/ui auto-generated primitives (do not edit)
│
├── layout/                       # App shell and navigation
│   ├── app-shell.tsx
│   ├── sidebar.tsx
│   ├── mobile-drawer.tsx
│   └── nav-link.tsx
│
├── dashboard/                    # Overview page components
│   ├── kpi-card.tsx
│   ├── kpi-grid.tsx
│   ├── activity-feed.tsx
│   ├── activity-item.tsx
│   └── quick-actions.tsx
│
├── people/                       # People browser + detail
│   ├── person-card.tsx           # Person summary card
│   ├── person-list.tsx           # Grid of person cards
│   ├── person-search.tsx         # URL-driven search (Client)
│   ├── status-filter.tsx         # URL-driven status filter (Client)
│   ├── attribute-filters.tsx     # Physical attribute filters (Client)
│   ├── person-header.tsx         # Detail page header
│   ├── profile-section.tsx       # Demographics + physical attributes
│   ├── personas-section.tsx      # Working identities list
│   ├── aliases-section.tsx       # Known names list
│   ├── work-history.tsx          # Sets they appeared in
│   ├── affiliations-section.tsx  # Label affiliations
│   ├── connections-section.tsx   # Co-workers
│   ├── notes-section.tsx         # Rating, notes, tags
│   └── empty-state.tsx
│
├── sets/                         # Sets gallery + detail
│   ├── set-card.tsx
│   ├── set-grid.tsx
│   ├── set-search.tsx
│   ├── type-filter.tsx
│   ├── set-header.tsx
│   ├── cast-section.tsx
│   └── empty-state.tsx
│
├── projects/                     # Projects list + detail
│   ├── project-card.tsx
│   ├── project-list.tsx
│   ├── project-search.tsx
│   ├── status-filter.tsx
│   ├── sessions-list.tsx
│   └── empty-state.tsx
│
├── labels/                       # Labels browser + detail
│   ├── label-card.tsx
│   ├── label-list.tsx
│   ├── channels-section.tsx
│   └── empty-state.tsx
│
├── networks/                     # Networks browser + detail
│   ├── network-card.tsx
│   ├── network-list.tsx
│   └── empty-state.tsx
│
├── photos/                       # Photo infrastructure (reused across person + set)
│   ├── image-carousel.tsx
│   ├── image-gallery.tsx
│   ├── lightbox.tsx
│   ├── image-upload.tsx
│   └── ...
│
└── shared/                       # Reusable cross-domain components
    ├── tag-input.tsx
    ├── delete-button.tsx
    └── ...
```

---

## Data Flow

```
Read path:
  PostgreSQL  →  Prisma Client  →  async services  →  Server Components  →  UI
                  (lib/db.ts)      (lib/services/)     (app/ pages)

Write path:
  Form submit  →  Server Action  →  Prisma Client  →  PostgreSQL
  (Client)        (lib/actions/)    (lib/db.ts)        + Activity log
                  + Zod validation                     + revalidatePath()
```

---

## Service Layer (`lib/services/`)

```typescript
// person-service.ts
getPersons(filters?)                        // people browser list
getPersonById(id)                           // detail page
getPersonWorkHistory(personId)              // sets they appeared in
getPersonAffiliations(personId)             // labels via set contributions
getPersonConnections(personId)              // related people

// set-service.ts
getSets(filters?)                           // sets gallery list
getSetById(id)                              // detail page with cast

// project-service.ts
getProjects(filters?)                       // project list
getProjectById(id)                          // detail with sessions + sets

// label-service.ts
getLabels(filters?)                         // label browser
getLabelById(id)                            // detail with channels + projects

// network-service.ts
getNetworks(filters?)                       // network browser
getNetworkById(id)                          // detail with member labels

// activity-service.ts
getRecentActivities(limit?)                 // dashboard feed

// stats-service.ts
getDashboardStats()                         // KPI counts
```

---

## State Management

| State | Scope | Mechanism |
|---|---|---|
| Theme (dark/light) | Global | React Context (`ThemeProvider`) |
| Search query | List pages | URL searchParams (`?q=...`) |
| Status filter | `/people`, `/projects` | URL searchParams (`?status=...`) |
| Type filter | `/sets` | URL searchParams (`?type=...`) |
| Attribute filters | `/people` | URL searchParams |
| Search input value | Client Components | `useState` with 300ms debounce |
| Sidebar open/closed (mobile) | Layout | `useState` in `AppShell` |

---

## Rendering Strategy

- Pages are **async Server Components** — data fetched server-side via Prisma services
- Search/filter state lives in URL searchParams (SSR-friendly, shareable)
- Client Components (`"use client"`) used only for interactive controls
- Client Components wrapped in `<Suspense>` where needed for streaming

## Key Patterns

1. **Server-first data fetching** — `await` service calls in page components
2. **URL-driven state** — filters/search in URL params for SSR and shareability
3. **Service abstraction** — components never import Prisma directly
4. **Responsive-first** — mobile base layout, desktop adds sidebar via breakpoints
5. **Soft-delete transparent** — extension filters `deletedAt: null` automatically
