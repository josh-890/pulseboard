# Pulseboard — Application Architecture

## Page Structure (App Router)

```
app/
├── layout.tsx              # Root layout
│   ├── ThemeProvider       # Dark/light mode context
│   └── AppShell            # Sidebar (desktop) + Drawer (mobile)
│
├── page.tsx                # / — Overview Dashboard (async Server Component)
│   ├── KPI Cards           # Summary stats (total projects, active, etc.)
│   ├── Activity Feed       # Recent activity list
│   └── Quick Actions       # Shortcut buttons
│
├── projects/
│   ├── page.tsx            # /projects — Project List (async Server Component)
│   │   ├── Search Bar      # Client Component — URL-driven search
│   │   ├── Status Filter   # Client Component — URL-driven filter
│   │   ├── Project Cards   # Grid of project cards
│   │   └── Empty State     # Shown when no results match
│   │
│   └── [id]/
│       └── page.tsx        # /projects/[id] — Project Detail (async Server Component)
│           ├── Project Header (name, status, tags)
│           ├── Project Info (description, updated date)
│           └── Project Team Section (assigned people)
│
├── people/
│   ├── page.tsx            # /people — People List (async Server Component)
│   │   ├── Search Bar      # Client Component — URL-driven search
│   │   ├── Role Filter     # Client Component — URL-driven filter
│   │   ├── Person Cards    # Grid of person cards
│   │   └── Empty State     # Shown when no results match
│   │
│   └── [id]/
│       └── page.tsx        # /people/[id] — Person Detail (async Server Component)
│           ├── Person Header (avatar, name, email)
│           └── Project Assignments (project name, status, role)
│
└── settings/
    └── page.tsx            # /settings — Settings
        └── Dark Mode Toggle
```

## Component Hierarchy

```
RootLayout
├── ThemeProvider (context)
└── AppShell
    ├── Sidebar (desktop: fixed left)
    │   ├── Logo / App Title
    │   ├── Nav Links (/, /projects, /people, /settings)
    │   └── Theme Toggle (optional)
    │
    ├── MobileDrawer (mobile: hamburger → slide-out)
    │   └── Same nav content as Sidebar
    │
    └── Main Content Area
        └── {page content}
```

### Component Folder Organization

```
components/
├── ui/                     # shadcn/ui auto-generated primitives
│   ├── button.tsx          # Do not edit — regenerate via CLI
│   ├── card.tsx
│   └── ...
│
├── layout/                 # App shell and navigation
│   ├── app-shell.tsx       # Wraps sidebar + main content
│   ├── sidebar.tsx         # Desktop sidebar navigation
│   ├── mobile-drawer.tsx   # Mobile slide-out navigation
│   └── nav-link.tsx        # Single nav item with active state
│
├── dashboard/              # Overview page components
│   ├── kpi-card.tsx        # Single stat card
│   ├── kpi-grid.tsx        # Grid of KPI cards (async Server Component)
│   ├── activity-feed.tsx   # Recent activity list
│   ├── activity-item.tsx   # Single activity entry
│   └── quick-actions.tsx   # Action button group
│
├── projects/               # Project page components
│   ├── project-card.tsx    # Single project card
│   ├── project-list.tsx    # Grid of project cards
│   ├── project-search.tsx  # Self-managing URL-driven search (Client Component)
│   ├── status-filter.tsx   # Self-managing URL-driven filter (Client Component)
│   ├── project-team-section.tsx  # Team list on project detail
│   └── empty-state.tsx     # No results placeholder
│
└── people/                 # People page components
    ├── person-avatar.tsx   # Initials circle (sm/md/lg)
    ├── role-badge.tsx      # Colored role badge
    ├── person-card.tsx     # Person summary card
    ├── person-list.tsx     # Grid of person cards
    ├── person-search.tsx   # Self-managing URL-driven search (Client Component)
    ├── role-filter.tsx     # Self-managing URL-driven filter (Client Component)
    └── empty-state.tsx     # No results placeholder
```

## Data Flow

```
PostgreSQL  →  Prisma Client  →  async services  →  Server Components  →  UI
                (lib/db.ts)      (lib/services/)     (app/ pages)
```

### Database Layer

PostgreSQL database with schema defined in `prisma/schema.prisma`. Models: `Person`, `Project`, `ProjectMember` (join table), `Activity`. Enums: `ProjectStatus`, `ActivityType`.

### Service Layer (`lib/services/`)

Async accessor functions that query the database via Prisma:

```typescript
// lib/services/project-service.ts
export async function getProjects(): Promise<Project[]> { ... }
export async function getProjectById(id: string): Promise<Project | null> { ... }
export async function searchProjects(query: string, status?: ProjectStatus | "all"): Promise<Project[]> { ... }

// lib/services/activity-service.ts
export async function getRecentActivities(limit?: number): Promise<ActivityItem[]> { ... }

// lib/services/person-service.ts
export async function getPersons(): Promise<Person[]> { ... }
export async function getPersonById(id: string): Promise<Person | null> { ... }
export async function searchPersons(query: string, role?: ProjectRole | "all"): Promise<Person[]> { ... }
export async function getPersonRoles(personId: string): Promise<PersonProjectAssignment[]> { ... }
export async function getPersonsByProject(projectId: string): Promise<{ person: Person; role: ProjectRole }[]> { ... }
```

**Why a service layer?**
- Components never import Prisma client directly
- Centralizes data access logic (filtering, sorting, joins)
- Keeps components focused on rendering
- All functions return Promises — consumed with `await` in Server Components

### Types (`lib/types/`)

Types are re-exported from Prisma-generated types:

```typescript
// lib/types/project.ts
export type { Project, ProjectStatus } from "@/generated/prisma/client";

// lib/types/activity.ts
export type { Activity as ActivityItem } from "@/generated/prisma/client";

// lib/types/person.ts — also includes computed types
export type { Person } from "@/generated/prisma/client";
export type ProjectRole = "stakeholder" | "lead" | "member";
export type PersonProjectAssignment = { project: Project; role: ProjectRole };
```

## State Management

| State | Scope | Mechanism |
|---|---|---|
| Theme (dark/light) | Global | React Context (`ThemeProvider`) |
| Search query | `/projects` page | URL searchParams (`?q=...`) |
| Status filter | `/projects` page | URL searchParams (`?status=...`) |
| Search query (people) | `/people` page | URL searchParams (`?q=...`) |
| Role filter | `/people` page | URL searchParams (`?role=...`) |
| Search input value | Client Components | `useState` with 300ms debounce |
| Sidebar open/closed (mobile) | Layout | `useState` in `AppShell` |

### Theme Context

```typescript
// lib/context/theme-context.tsx
type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
};
```

- Stored in `localStorage` for persistence
- Applied via a `data-theme` attribute or Tailwind `dark:` class strategy
- Toggle available in Settings page and optionally in Sidebar

## Rendering Strategy

Pages use **async Server Components** with data fetched via Prisma:
- Page components are `async` functions that `await` service calls
- Search/filter state is driven by URL searchParams (enables server-side filtering)
- Client Components (`"use client"`) are used only for interactive controls (search input, filter buttons)
- Client Components are wrapped in `<Suspense>` boundaries where needed

## Key Patterns

1. **Composition over configuration** — Build pages by composing small, focused components
2. **Server-first data fetching** — Data is fetched in Server Components, passed down as props
3. **URL-driven state** — Search/filter state lives in URL searchParams for shareability and SSR
4. **Service abstraction** — Components call async services, never Prisma directly
5. **Responsive-first** — Mobile layout is the base; desktop adds sidebar via breakpoints
