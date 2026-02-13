# Pulseboard - Project Guidelines

## Project Overview

Pulseboard is a personal dashboard UI built to master Next.js App Router, TypeScript, and component-based UI development. No backend — all data is mocked.

## Tech Stack

- **Framework:** Next.js (App Router)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS + shadcn/ui
- **Linting:** ESLint + Prettier (strict)
- **Data:** Mock data via TypeScript modules + service layer

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx          # Root layout (sidebar, theme provider)
│   ├── page.tsx            # / — Overview Dashboard
│   ├── projects/
│   │   ├── page.tsx        # /projects — Project list
│   │   └── [id]/
│   │       └── page.tsx    # /projects/[id] — Project detail
│   └── settings/
│       └── page.tsx        # /settings — Settings
├── components/
│   ├── ui/                 # shadcn/ui primitives (auto-generated)
│   ├── layout/             # Sidebar, Drawer, Shell
│   ├── dashboard/          # KPI cards, Activity feed, Quick actions
│   └── projects/           # Project card, Project list, Filters
├── lib/
│   ├── data/               # Mock data (.ts files)
│   ├── services/           # Data accessor functions
│   ├── types/              # Shared TypeScript types
│   └── utils.ts            # Utility helpers (cn, etc.)
└── styles/
    └── globals.css         # Tailwind directives + custom CSS
```

## Coding Standards

### TypeScript
- Strict mode enabled — no exceptions
- **No `any` types allowed** — use proper types, `unknown`, or generics
- Use `type` over `interface` unless extending is needed
- Export types from `lib/types/`

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
- Mock data lives in `lib/data/` as typed TypeScript modules
- Access data through service functions in `lib/services/` (e.g., `getProjects()`, `getProjectById()`)
- Never import mock data directly in components — always go through services

### State Management
- React `useState` for local component state
- React Context for theme (dark/light mode)
- No external state libraries

## Key Architecture Docs
- `docs/architecture.md` — Page structure, data flow, component hierarchy
- `docs/style-guide.md` — Design tokens, color palette, glassmorphism system
- `docs/components.md` — Full component inventory with props

## Acceptance Criteria
- Zero TypeScript errors
- Responsive layout (mobile + desktop)
- Search and status filter work together on /projects
- No `any` types anywhere in the codebase
