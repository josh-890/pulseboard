# Pulseboard

A personal dashboard for tracking projects and team members, with a persona-based people system and photo management. Built with Next.js App Router, TypeScript, and PostgreSQL.

![Dashboard Screenshot](docs/screenshot-dashboard.png)

## Features

- **Dashboard** — KPI cards, recent activity feed, quick actions
- **Projects** — List with search, status filtering (Active/Paused/Done), detail pages with team members
- **People** — Persona-based people system with history tracking, horizontal card browser with density modes, cursor pagination
- **Photos** — Upload, carousel with thumbnails, lightbox, favorites, profile image slot assignment
- **Settings** — Color palette themes, configurable preferences
- **Cross-linking** — Navigate between projects and people seamlessly
- **Glassmorphism design** — Frosted glass UI with collapsible sidebar, responsive layout

## Tech Stack

- **Framework:** [Next.js 16](https://nextjs.org/) (App Router, Server Components)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS 4 + shadcn/ui
- **Database:** PostgreSQL via [Prisma 7](https://www.prisma.io/) ORM
- **Object Storage:** MinIO (S3-compatible) for photo uploads
- **Deployment:** Docker + Docker Compose
- **Icons:** Lucide React

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database
- MinIO (or S3-compatible storage) for photos

### Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your PostgreSQL connection string and MinIO credentials

# Generate Prisma client
npx prisma generate

# Run migrations and seed data
npx prisma migrate dev

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Docker Deployment

```bash
docker compose up -d
```

See [`docs/deployment.md`](docs/deployment.md) for full deployment instructions.

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx            # Dashboard
│   ├── projects/           # Project list + detail
│   ├── people/             # People list + detail
│   ├── photos/             # Photo gallery
│   └── settings/           # App settings
├── components/
│   ├── ui/                 # shadcn/ui primitives
│   ├── layout/             # Sidebar, Drawer, Shell
│   ├── dashboard/          # KPI cards, Activity feed
│   ├── projects/           # Project card, Search, Status filter
│   └── people/             # Person card, Carousel, Lightbox, Filters
├── lib/
│   ├── db.ts               # Prisma client singleton
│   ├── prisma-extensions.ts # Soft delete extension
│   ├── services/           # Async data access layer
│   ├── types/              # Re-exported Prisma types
│   └── utils.ts            # Helpers (cn, formatRelativeTime)
prisma/
├── schema.prisma           # Database schema
├── migrations/             # SQL migrations
└── seed.ts                 # Seed data
scripts/
├── deploy-migrations.sh    # Apply migrations to production
└── db-backup.sh            # Back up production database
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm run db:migrate` | Run Prisma migrations (dev) |
| `npm run db:reset` | Reset database and re-seed |
| `npm run db:studio` | Open Prisma Studio |
| `npm run db:seed` | Re-seed the database |
| `npm run test` | Run tests |

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — Page structure, data flow, component hierarchy
- [`docs/components.md`](docs/components.md) — Component inventory with props
- [`docs/data-model.md`](docs/data-model.md) — Database schema and relationships
- [`docs/database.md`](docs/database.md) — Database setup and migration workflow
- [`docs/deployment.md`](docs/deployment.md) — Docker deployment guide
- [`docs/media_photos.md`](docs/media_photos.md) — Photo system architecture
- [`docs/style-guide.md`](docs/style-guide.md) — Design tokens and glassmorphism system
- [`docs/ux-ui-skill.md`](docs/ux-ui-skill.md) — UX/UI design guidelines
