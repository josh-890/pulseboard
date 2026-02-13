# Pulseboard — Application Architecture

## Page Structure (App Router)

```
app/
├── layout.tsx              # Root layout
│   ├── ThemeProvider       # Dark/light mode context
│   └── AppShell            # Sidebar (desktop) + Drawer (mobile)
│
├── page.tsx                # / — Overview Dashboard
│   ├── KPI Cards           # Summary stats (total projects, active, etc.)
│   ├── Activity Feed       # Recent activity list
│   └── Quick Actions       # Shortcut buttons
│
├── projects/
│   ├── page.tsx            # /projects — Project List
│   │   ├── Search Bar      # Client-side text search
│   │   ├── Status Filter   # Filter by active/paused/done
│   │   ├── Project Cards   # Grid of project cards
│   │   └── Empty State     # Shown when no results match
│   │
│   └── [id]/
│       └── page.tsx        # /projects/[id] — Project Detail
│           ├── Project Header (name, status, tags)
│           └── Project Info (description, updated date)
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
    │   ├── Nav Links (/, /projects, /settings)
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
│   ├── kpi-grid.tsx        # Grid of KPI cards
│   ├── activity-feed.tsx   # Recent activity list
│   ├── activity-item.tsx   # Single activity entry
│   └── quick-actions.tsx   # Action button group
│
└── projects/               # Project page components
    ├── project-card.tsx    # Single project card
    ├── project-list.tsx    # Grid of project cards
    ├── project-search.tsx  # Search input
    ├── status-filter.tsx   # Status filter buttons/tabs
    └── empty-state.tsx     # No results placeholder
```

## Data Flow

```
lib/data/*.ts          →  lib/services/*.ts       →  Components
(raw mock data)           (accessor functions)        (consume via props)
```

### Mock Data Layer (`lib/data/`)

Static TypeScript arrays/objects that represent the database:

```typescript
// lib/data/projects.ts
export const projects: Project[] = [
  { id: "1", name: "Pulseboard", status: "active", ... },
  { id: "2", name: "Blog Engine", status: "paused", ... },
];

// lib/data/activities.ts
export const activities: ActivityItem[] = [
  { id: "1", title: "Deployed v1.2", type: "deploy", ... },
];
```

### Service Layer (`lib/services/`)

Typed accessor functions that mirror a real API layer:

```typescript
// lib/services/project-service.ts
export function getProjects(): Project[] { ... }
export function getProjectById(id: string): Project | undefined { ... }
export function getProjectsByStatus(status: ProjectStatus): Project[] { ... }

// lib/services/activity-service.ts
export function getRecentActivities(limit?: number): ActivityItem[] { ... }
```

**Why a service layer?**
- Components never import raw data directly
- Easy to swap mock data for real API calls later
- Centralizes data access logic (filtering, sorting)
- Keeps components focused on rendering

### Types (`lib/types/`)

```typescript
// lib/types/project.ts
export type ProjectStatus = "active" | "paused" | "done";

export type Project = {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  updatedAt: string;
  tags: string[];
};

// lib/types/activity.ts
export type ActivityItem = {
  id: string;
  title: string;
  time: string;
  type: "deploy" | "note" | "task";
};
```

## State Management

| State | Scope | Mechanism |
|---|---|---|
| Theme (dark/light) | Global | React Context (`ThemeProvider`) |
| Search query | `/projects` page | `useState` in page component |
| Status filter | `/projects` page | `useState` in page component |
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

All pages are **client-rendered** for this project:
- No API routes needed (mock data is local)
- Interactive features (search, filter, theme toggle) require client state
- Pages that need interactivity use `"use client"` directive

## Key Patterns

1. **Composition over configuration** — Build pages by composing small, focused components
2. **Props down, events up** — Data flows down via props; user actions bubble up via callbacks
3. **Service abstraction** — Components call services, not raw data
4. **Responsive-first** — Mobile layout is the base; desktop adds sidebar via breakpoints
