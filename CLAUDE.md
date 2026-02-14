# Pulseboard - Project Guidelines

## Project Overview

Pulseboard is a personal dashboard UI built to master Next.js App Router, TypeScript, and component-based UI development. Data is stored in PostgreSQL and accessed via Prisma ORM.

## Tech Stack

- **Framework:** Next.js (App Router)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS + shadcn/ui
- **Database:** PostgreSQL via Prisma ORM
- **Linting:** ESLint + Prettier (strict)
- **Data:** Async service layer backed by Prisma queries

## Project Structure

```
prisma/
├── schema.prisma           # Database schema (source of truth for models)
└── seed.ts                 # Seed script with initial data
src/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx          # Root layout (sidebar, theme provider)
│   ├── page.tsx            # / — Overview Dashboard
│   ├── projects/
│   │   ├── page.tsx        # /projects — Project list (Server Component)
│   │   └── [id]/
│   │       └── page.tsx    # /projects/[id] — Project detail
│   ├── people/
│   │   ├── page.tsx        # /people — People list (Server Component)
│   │   └── [id]/
│   │       └── page.tsx    # /people/[id] — Person detail
│   └── settings/
│       └── page.tsx        # /settings — Settings
├── components/
│   ├── ui/                 # shadcn/ui primitives (auto-generated)
│   ├── layout/             # Sidebar, Drawer, Shell
│   ├── dashboard/          # KPI cards, Activity feed, Quick actions
│   ├── projects/           # Project card, Project list, Filters
│   └── people/             # Person card, Person list, Filters
├── generated/
│   └── prisma/             # Prisma-generated client (gitignored)
├── lib/
│   ├── db.ts               # Prisma client singleton
│   ├── services/           # Async data accessor functions (Prisma queries)
│   ├── types/              # Re-exports from Prisma + computed types
│   └── utils.ts            # Utility helpers (cn, formatRelativeTime)
└── styles/
    └── globals.css         # Tailwind directives + custom CSS
```

## Coding Standards

### TypeScript
- Strict mode enabled — no exceptions
- **No `any` types allowed** — use proper types, `unknown`, or generics
- Use `type` over `interface` unless extending is needed
- Export types from `lib/types/`
- Prisma-generated types are the source of truth for DB models — re-export from `lib/types/`

### Components
- Use function declarations for components: `export function ComponentName()`
- One component per file
- File names: `kebab-case.tsx` (e.g., `kpi-card.tsx`)
- Component names: `PascalCase` (e.g., `KpiCard`)
- Props type named `{ComponentName}Props`
- Colocate component-specific types with the component

### Styling
- Tailwind utility classes only — no inline styles, no CSS modules
- Use the `cn()` utility for conditional classes
- Follow the glassmorphism design system in `docs/style-guide.md`
- All components must be responsive (mobile-first)

### File Conventions
- File names: `kebab-case` for all files
- Directory names: `kebab-case`
- Named exports only — no default exports (except pages/layouts as required by Next.js)
- Barrel exports (`index.ts`) for component directories

### Data Layer
- PostgreSQL database accessed via Prisma ORM
- All service functions in `lib/services/` are **async** (return Promises)
- Access data through service functions — never import Prisma client directly in components
- Date fields (`updatedAt`, `time`) are `Date` objects — use `formatRelativeTime()` for display

### State Management
- URL searchParams for search/filter state on `/projects` and `/people`
- React `useState` for local component state (search input debounce)
- React Context for theme (dark/light mode)
- No external state libraries

## Key Architecture Docs
- `docs/architecture.md` — Page structure, data flow, component hierarchy
- `docs/style-guide.md` — Design tokens, color palette, glassmorphism system
- `docs/components.md` — Full component inventory with props
- `docs/data-model.md` — Database schema and relationships

## Browser Verification (Playwright MCP)

After making UI changes, verify effects in the browser using Playwright MCP tools:

1. Ensure dev server is running (`npm run dev` on port 3000)
2. Navigate to affected route: `browser_navigate` → `http://localhost:3000/<route>`
3. Take an accessibility snapshot: `browser_snapshot` — verify content, structure, counts
4. Take a screenshot if visual verification is needed: `browser_screenshot`
5. Test interactions (search, filters): `browser_click`, `browser_fill`

### Routes to verify
| Route | What to check |
|---|---|
| `/` | KPI counts match DB, activity feed shows recent items |
| `/projects` | Project cards render, search filters work, status filter works |
| `/projects/[id]` | Detail page loads, team section shows members |
| `/people` | People list renders, search works, role filter works |
| `/people/[id]` | Detail page loads, project assignments show |

## Acceptance Criteria
- Zero TypeScript errors
- Responsive layout (mobile + desktop)
- Search and status filter work together on /projects
- No `any` types anywhere in the codebase
