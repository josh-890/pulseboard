# Pulseboard — Visual Design System

## Design Direction

Glassmorphism / modern: frosted glass cards, subtle gradients, soft shadows. Clean and visually striking while remaining readable.

---

## Color Palette

### Light Mode

| Token | Value | Usage |
|---|---|---|
| `--background` | `#f0f4f8` | Page background |
| `--foreground` | `#0f172a` | Primary text |
| `--card` | `rgba(255, 255, 255, 0.7)` | Card backgrounds (glass) |
| `--card-foreground` | `#0f172a` | Card text |
| `--primary` | `#6366f1` | Primary actions, active nav |
| `--primary-foreground` | `#ffffff` | Text on primary |
| `--secondary` | `#e0e7ff` | Secondary actions, tags |
| `--secondary-foreground` | `#3730a3` | Text on secondary |
| `--muted` | `#f1f5f9` | Muted backgrounds |
| `--muted-foreground` | `#64748b` | Muted text, timestamps |
| `--accent` | `#c084fc` | Accent highlights, gradients |
| `--destructive` | `#ef4444` | Error states |
| `--border` | `rgba(255, 255, 255, 0.3)` | Glass card borders |

### Dark Mode

| Token | Value | Usage |
|---|---|---|
| `--background` | `#0b1120` | Page background |
| `--foreground` | `#e2e8f0` | Primary text |
| `--card` | `rgba(30, 41, 59, 0.7)` | Card backgrounds (glass) |
| `--card-foreground` | `#e2e8f0` | Card text |
| `--primary` | `#818cf8` | Primary actions, active nav |
| `--primary-foreground` | `#0f172a` | Text on primary |
| `--secondary` | `#1e293b` | Secondary actions, tags |
| `--secondary-foreground` | `#c7d2fe` | Text on secondary |
| `--muted` | `#1e293b` | Muted backgrounds |
| `--muted-foreground` | `#94a3b8` | Muted text, timestamps |
| `--accent` | `#a855f7` | Accent highlights, gradients |
| `--destructive` | `#f87171` | Error states |
| `--border` | `rgba(148, 163, 184, 0.2)` | Glass card borders |

### Status Colors

| Status | Light | Dark |
|---|---|---|
| Active | `#22c55e` | `#4ade80` |
| Paused | `#f59e0b` | `#fbbf24` |
| Done | `#6366f1` | `#818cf8` |

### Background Gradient

```css
/* Light mode */
background: linear-gradient(135deg, #e0e7ff 0%, #f0f4f8 50%, #fae8ff 100%);

/* Dark mode */
background: linear-gradient(135deg, #0b1120 0%, #1a1033 50%, #0b1120 100%);
```

---

## Glassmorphism Tokens

```css
/* Base glass effect */
.glass {
  background: var(--card);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border);
  border-radius: 1rem;      /* rounded-2xl */
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.08);
}

/* Elevated glass (hover, modals) */
.glass-elevated {
  backdrop-filter: blur(16px);
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.12);
}

/* Subtle glass (sidebar, secondary panels) */
.glass-subtle {
  backdrop-filter: blur(8px);
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.05);
}
```

### Tailwind Utility Classes

Apply glass effects with utility classes:

```tsx
// Standard glass card
<div className="bg-card/70 backdrop-blur-md border border-white/30 rounded-2xl shadow-lg">

// Elevated glass (hover states)
<div className="bg-card/80 backdrop-blur-lg border border-white/30 rounded-2xl shadow-xl">

// Subtle glass (sidebar)
<div className="bg-card/50 backdrop-blur-sm border-r border-white/20">
```

---

## Typography

| Token | Size | Weight | Usage |
|---|---|---|---|
| `heading-1` | `2.25rem` (text-4xl) | 700 (bold) | Page titles |
| `heading-2` | `1.5rem` (text-2xl) | 600 (semibold) | Section titles |
| `heading-3` | `1.25rem` (text-xl) | 600 (semibold) | Card titles |
| `body` | `1rem` (text-base) | 400 (normal) | Body text |
| `body-small` | `0.875rem` (text-sm) | 400 (normal) | Secondary text, labels |
| `caption` | `0.75rem` (text-xs) | 500 (medium) | Timestamps, metadata |

**Font family:** System font stack (Inter if installed, falls back to system sans-serif).

```typescript
// tailwind.config.ts
fontFamily: {
  sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
}
```

---

## Spacing & Layout

### Grid System

```tsx
// Page content container
<main className="px-4 py-6 md:px-8 md:py-8 max-w-7xl mx-auto">

// Card grid (responsive)
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">

// KPI grid (always 2+ columns)
<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
```

### Spacing Scale

Use Tailwind's default spacing scale. Key breakpoints:

| Token | Value | Usage |
|---|---|---|
| `gap-4` | `1rem` | Card grid gap (mobile) |
| `gap-6` | `1.5rem` | Card grid gap (desktop) |
| `p-4` | `1rem` | Card inner padding (mobile) |
| `p-6` | `1.5rem` | Card inner padding (desktop) |
| `space-y-6` | `1.5rem` | Section spacing |
| `space-y-8` | `2rem` | Page section spacing |

### Layout Dimensions

| Element | Value |
|---|---|
| Sidebar width (desktop) | `16rem` (w-64) |
| Sidebar breakpoint | `md` (768px) |
| Max content width | `80rem` (max-w-7xl) |
| Card border radius | `1rem` (rounded-2xl) |

---

## Component Patterns

### Card (Glass)

```tsx
<div className="bg-card/70 backdrop-blur-md border border-white/30 dark:border-white/10 rounded-2xl p-4 md:p-6 shadow-lg transition-shadow hover:shadow-xl">
  {children}
</div>
```

### KPI Card

```tsx
<div className="bg-card/70 backdrop-blur-md border border-white/30 dark:border-white/10 rounded-2xl p-4 shadow-lg">
  <p className="text-sm text-muted-foreground">{label}</p>
  <p className="text-3xl font-bold mt-1">{value}</p>
</div>
```

### Button (Primary)

```tsx
<button className="bg-primary text-primary-foreground px-4 py-2 rounded-xl font-medium shadow-md hover:shadow-lg transition-all hover:brightness-110">
  {label}
</button>
```

### Status Badge

```tsx
// Use semantic colors from the status palette
<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
  Active
</span>
```

### Nav Link (Active State)

```tsx
// Active
<a className="flex items-center gap-3 px-3 py-2 rounded-xl bg-primary/10 text-primary font-medium">

// Inactive
<a className="flex items-center gap-3 px-3 py-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
```

---

## Tailwind Config Extensions

```typescript
// tailwind.config.ts — key extensions
{
  theme: {
    extend: {
      colors: {
        // Map CSS variables to Tailwind tokens
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: 'var(--card)',
        'card-foreground': 'var(--card-foreground)',
        primary: 'var(--primary)',
        'primary-foreground': 'var(--primary-foreground)',
        secondary: 'var(--secondary)',
        'secondary-foreground': 'var(--secondary-foreground)',
        muted: 'var(--muted)',
        'muted-foreground': 'var(--muted-foreground)',
        accent: 'var(--accent)',
        destructive: 'var(--destructive)',
        border: 'var(--border)',
      },
      borderRadius: {
        '2xl': '1rem',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
}
```

---

## Animation & Transitions

Keep animations subtle and purposeful:

```css
/* Default transition for interactive elements */
transition: all 150ms ease;

/* Hover lift for cards */
.card-hover:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.12);
}
```

Tailwind classes:
- `transition-all duration-150` — interactive elements
- `transition-shadow` — card hover effects
- `transition-colors` — nav links, buttons
