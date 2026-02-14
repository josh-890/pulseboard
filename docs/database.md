# Pulseboard — Database

## Connection

- **Host:** `10.66.20.182:5432`
- **Database:** `pulseboard`
- **User:** `postgres`
- **Password:** stored in `.env` (gitignored) — never committed to docs or code
- **Driver:** `@prisma/adapter-pg` (direct PostgreSQL connection, no Prisma proxy)

## Schema

See `prisma/schema.prisma` for the source of truth. Key features:

- **4 models:** Person, Project, ProjectMember, Activity
- **2 enums:** ProjectStatus (active/paused/done), ActivityType (deploy/note/task)
- **Soft deletes:** `deletedAt DateTime?` on all models, filtered automatically via Prisma client extension
- **Performance indexes:** on foreign keys, sort fields, filter fields, and deletedAt

## Soft Delete

Implemented via Prisma client extension (`src/lib/prisma-extensions.ts`):
- All read queries (`findMany`, `findFirst`, `findUnique`, `count`) automatically filter `deletedAt: null`
- No changes needed in the service layer — filtering is transparent

## Daily Development

```bash
npx prisma studio          # Visual DB browser at localhost:5555
npx prisma migrate dev     # Apply pending migrations
npx prisma migrate reset   # Drop DB, re-migrate, re-seed
npx prisma generate        # Regenerate client after schema changes
npx prisma db seed         # Re-seed data
```

## Schema Change Workflow

1. Edit `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name describe_the_change`
3. Review generated SQL in `prisma/migrations/`
4. Prisma auto-regenerates client
5. Update TypeScript code if needed
6. Commit migration files to git

## Migrations

All migrations live in `prisma/migrations/` and are committed to git:

| Migration | Description |
|---|---|
| `20260214093038_init` | Full schema: 4 models, enums, soft deletes, indexes |

## Seed Data

Seed script: `prisma/seed.ts` (configured in `prisma.config.ts`)

| Table | Count |
|---|---|
| Person | 10 |
| Project | 8 |
| ProjectMember | 18 |
| Activity | 10 |
