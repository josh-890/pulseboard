# Pulseboard — Component Inventory

## Conventions

- **File names:** `kebab-case.tsx` (e.g., `kpi-card.tsx`)
- **Component names:** `PascalCase` (e.g., `KpiCard`)
- **Props type:** `{ComponentName}Props` (e.g., `KpiCardProps`)
- **Exports:** Named exports only (no default exports)
- **Location:** Group by feature domain under `components/`

---

## shadcn/ui Components to Install

These are the Radix UI-based primitives to install via the shadcn CLI:

| Component | Usage |
|---|---|
| `button` | Primary actions, quick actions, filters |
| `card` | Base for all glass cards (KPI, project, activity) |
| `input` | Search bar on projects page |
| `badge` | Project status badges, tags |
| `separator` | Visual dividers in sidebar and settings |
| `sheet` | Mobile drawer navigation |
| `switch` | Dark mode toggle in settings |
| `dropdown-menu` | Optional: additional actions on cards |

Install command:
```bash
npx shadcn@latest add button card input badge separator sheet switch
```

---

## Custom Components

### Layout Components (`components/layout/`)

#### `AppShell`
Top-level layout wrapper. Renders sidebar on desktop, drawer on mobile, and the main content area.

```typescript
type AppShellProps = {
  children: React.ReactNode;
};
```

#### `Sidebar`
Fixed left sidebar for desktop navigation. Contains logo, nav links, and optional theme toggle.

```typescript
// No props — reads route for active state via usePathname()
```

#### `MobileDrawer`
Slide-out drawer for mobile navigation. Wraps shadcn `Sheet` component.

```typescript
type MobileDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};
```

#### `NavLink`
Single navigation item with active state highlighting.

```typescript
type NavLinkProps = {
  href: string;
  icon: React.ReactNode;
  label: string;
};
```

---

### Dashboard Components (`components/dashboard/`)

#### `KpiCard`
Displays a single metric with a label and value.

```typescript
type KpiCardProps = {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
};
```

#### `KpiGrid`
Async Server Component. Responsive grid that renders multiple `KpiCard` components with computed stats from the database.

```typescript
// No props — async, fetches data internally via services
```

#### `ActivityFeed`
Renders a list of recent activity items. Limiting is done at the service/DB level.

```typescript
type ActivityFeedProps = {
  items: ActivityItem[];
};
```

#### `ActivityItem`
Single activity entry showing title, type icon, and timestamp.

```typescript
type ActivityItemProps = {
  item: ActivityItem;
};
```

#### `QuickActions`
Group of shortcut buttons for common actions (e.g., "New Project", "View All Projects").

```typescript
// No props — actions are hardcoded links/buttons
```

---

### Project Components (`components/projects/`)

#### `ProjectCard`
Displays a single project's summary in a glass card. Links to the project detail page.

```typescript
type ProjectCardProps = {
  project: Project;
};
```

#### `ProjectList`
Responsive grid of `ProjectCard` components. Handles empty state.

```typescript
type ProjectListProps = {
  projects: Project[];
};
```

#### `ProjectSearch`
Self-managing Client Component. Reads/writes URL searchParams (`?q=...`). Debounces input by 300ms, uses `router.replace` to update URL.

```typescript
// No props — reads from useSearchParams(), writes via useRouter()
```

#### `StatusFilter`
Self-managing Client Component. Reads/writes URL searchParams (`?status=...`). Uses `router.push` for filter changes.

```typescript
// No props — reads from useSearchParams(), writes via useRouter()
```

#### `EmptyState`
Placeholder shown when no projects match the current search/filter.

```typescript
type EmptyStateProps = {
  message?: string;
};
```

---

### People Components (`components/people/`)

#### `PersonAvatar`
Colored circle with initials. Supports three sizes.

```typescript
type PersonAvatarProps = {
  firstName: string;
  lastName: string;
  avatarColor: string;
  size?: "sm" | "md" | "lg";
};
```

#### `RoleBadge`
Colored badge showing project role (purple=Stakeholder, blue=Lead, slate=Member).

```typescript
type RoleBadgeProps = {
  role: ProjectRole;
};
```

#### `PersonCard`
Glass card displaying person summary with avatar, name, email, and role badges. Links to person detail.

```typescript
type PersonCardProps = {
  person: Person;
  roles: PersonProjectAssignment[];
};
```

#### `PersonList`
Responsive grid of `PersonCard` components. Handles empty state.

```typescript
type PersonListProps = {
  persons: Person[];
  personRoles: Map<string, PersonProjectAssignment[]>;
};
```

#### `PersonSearch`
Self-managing Client Component. Reads/writes URL searchParams (`?q=...`). Debounces input by 300ms, uses `router.replace` to update URL.

```typescript
// No props — reads from useSearchParams(), writes via useRouter()
```

#### `RoleFilter`
Self-managing Client Component. Reads/writes URL searchParams (`?role=...`). Uses `router.push` for filter changes.

```typescript
// No props — reads from useSearchParams(), writes via useRouter()
```

#### `EmptyState` (People)
Placeholder shown when no people match the current search/filter. Uses `UserX` icon.

```typescript
type EmptyStateProps = {
  message?: string;
};
```

#### `ProjectTeamSection` (in `components/projects/`)
Team section for project detail page showing all assigned people with avatars and role badges.

```typescript
type ProjectTeamSectionProps = {
  team: { person: Person; role: ProjectRole }[];
};
```

---

### Settings Components (`components/settings/`)

#### `ThemeToggle`
Switch for toggling between light and dark mode. Reads/writes to theme context.

```typescript
// No props — uses ThemeContext internally
```

---

### Shared Components (`components/shared/`)

#### `TagInput`
Text input that tokenizes on Enter/comma, renders tags as removable badges.

```typescript
type TagInputProps = {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
};
```

#### `ColorPicker`
Grid of circular color swatches with ring indicator on selected.

```typescript
type ColorPickerProps = {
  value: string;
  onChange: (color: string) => void;
  colors: readonly string[];
};
```

#### `PersonSelect`
Dropdown showing person avatar + name. Wraps shadcn `Select`.

```typescript
type PersonSelectProps = {
  persons: Person[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};
```

#### `MemberMultiSelect`
Popover with scrollable checkbox list for multi-selecting team members.

```typescript
type MemberMultiSelectProps = {
  persons: Person[];
  value: string[];
  onChange: (ids: string[]) => void;
  excludeIds?: string[];
};
```

#### `DeleteButton`
Destructive button that opens an AlertDialog for confirmation before executing a server action.

```typescript
type DeleteButtonProps = {
  title: string;
  description: string;
  onDelete: () => Promise<{ success: boolean; error?: string }>;
  redirectTo: string;
};
```

---

### Form Components

#### `ProjectForm` (`components/projects/project-form.tsx`)
Client Component for creating and editing projects. Uses react-hook-form with Zod validation.

```typescript
type ProjectFormProps = {
  mode: "create" | "edit";
  defaultValues?: ProjectFormValues;
  projectId?: string;
  persons: Person[];
};
```

#### `PersonForm` (`components/people/person-form.tsx`)
Client Component for creating and editing people. Includes live avatar preview.

```typescript
type PersonFormProps = {
  mode: "create" | "edit";
  defaultValues?: PersonFormValues;
  personId?: string;
};
```

---

## Component Dependency Map

```
AppShell
├── Sidebar
│   ├── NavLink (x4: Dashboard, Projects, People, Settings)
│   └── ThemeToggle (optional)
├── MobileDrawer
│   └── NavLink (x4)
└── Main Content
    ├── Dashboard Page
    │   ├── KpiGrid
    │   │   └── KpiCard (x5)
    │   ├── ActivityFeed
    │   │   └── ActivityItem (xN)
    │   └── QuickActions
    │       └── Button (shadcn, x2)
    ├── Projects Page
    │   ├── ProjectSearch
    │   │   └── Input (shadcn)
    │   ├── StatusFilter
    │   │   └── Button (shadcn, x4)
    │   ├── ProjectList
    │   │   └── ProjectCard (xN)
    │   │       ├── Card (shadcn)
    │   │       └── Badge (shadcn)
    │   └── EmptyState
    ├── Project Detail Page
    │   ├── Badge (shadcn, status + tags)
    │   ├── Card (shadcn)
    │   └── ProjectTeamSection
    │       ├── PersonAvatar (xN)
    │       └── RoleBadge (xN)
    ├── People Page
    │   ├── PersonSearch
    │   │   └── Input (shadcn)
    │   ├── RoleFilter
    │   │   └── Button (shadcn, x4)
    │   ├── PersonList
    │   │   └── PersonCard (xN)
    │   │       ├── PersonAvatar
    │   │       └── RoleBadge (xN)
    │   └── EmptyState (people)
    ├── Person Detail Page
    │   ├── PersonAvatar (lg)
    │   ├── StatusBadge (xN)
    │   └── RoleBadge (xN)
    └── Settings Page
        ├── Card (shadcn)
        └── ThemeToggle
            └── Switch (shadcn)
```

---

## Build Order (Suggested)

1. **Types** — Define `Project`, `ActivityItem`, `ProjectStatus` in `lib/types/`
2. **Mock data + Services** — Create data files and service functions
3. **Layout** — `AppShell`, `Sidebar`, `MobileDrawer`, `NavLink`
4. **Dashboard** — `KpiCard`, `KpiGrid`, `ActivityFeed`, `QuickActions`
5. **Projects** — `ProjectCard`, `ProjectList`, `ProjectSearch`, `StatusFilter`, `EmptyState`
6. **Settings** — `ThemeToggle` + theme context
7. **Polish** — Responsive testing, transitions, final styling pass
