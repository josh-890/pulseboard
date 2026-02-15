# Deployment Guide: Next.js + Prisma + Docker on Unraid

A reusable guide for deploying Next.js App Router applications with Prisma ORM as Docker containers on Unraid (or any Docker host). Based on real deployment experience and gotchas.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Prepare the Next.js App](#prepare-the-nextjs-app)
3. [Dockerfile](#dockerfile)
4. [Docker Compose](#docker-compose)
5. [Supporting Files](#supporting-files)
6. [Build and Deploy](#build-and-deploy)
7. [Development and Maintenance Workflow](#development-and-maintenance-workflow)
8. [Database Migrations](#database-migrations)
9. [Gotchas and Lessons Learned](#gotchas-and-lessons-learned)
10. [Troubleshooting](#troubleshooting)
11. [Checklist](#checklist)

---

## Prerequisites

- Docker and Docker Compose on the target machine
- PostgreSQL running and network-accessible from the Docker host
- Database already created (Prisma won't create the database itself)
- Git installed on the target machine (for pulling updates)

## Prepare the Next.js App

### 1. Enable standalone output

In `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

This makes `npm run build` produce a self-contained `.next/standalone/` folder with a `server.js` that includes only the node_modules actually needed at runtime. The final image stays ~150MB instead of ~500MB+.

**Important:** `output: "standalone"` has zero effect on `npm run dev` — local development is unchanged.

### 2. Mark database-dependent pages as dynamic

Any page that queries the database at render time **must not** be statically prerendered, because the database is unavailable during Docker build.

Add this export to every page that calls a service/Prisma function:

```ts
export const dynamic = "force-dynamic";
```

**How to identify affected pages:** Run `npm run build` locally and look at the route table:

```
Route (app)
┌ ○ /              ← Static (prerendered at build time)
├ ƒ /projects      ← Dynamic (rendered at request time)
```

If a page marked `○` (static) queries the database, it will fail during Docker build with `ECONNREFUSED`. Add `force-dynamic` to make it `ƒ`.

**Pages that are safe to leave static:**
- Pages with no async data fetching (pure UI like `/settings`, forms like `/projects/new`)
- Pages that only use client-side data fetching

**Pages that need `force-dynamic`:**
- Any page with `await` calls to service functions in the component body
- Server Components that import from `lib/services/`

### 3. Verify the build works without a database

```bash
# Temporarily break the DB connection to simulate Docker build
DATABASE_URL="postgresql://x:x@localhost:1/x" npm run build
```

If this succeeds, your Docker build will too.

## Dockerfile

Three-stage build for a minimal production image:

```dockerfile
# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build the application
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Stage 3: Production runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone build (must be FIRST — other COPY layers overlay on top)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Static assets are NOT included in standalone — copy them in
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
```

### Why three stages?

| Stage | What it does | Why separate |
|-------|-------------|--------------|
| `deps` | `npm ci` | Cached unless package.json changes |
| `builder` | `prisma generate` + `npm run build` | Has full node_modules for build |
| `runner` | Just `node server.js` | Only has what's needed at runtime |

### Critical: COPY order matters

The standalone directory contains its own `.next/` folder. If you copy `.next/static` **before** the standalone, the standalone COPY overwrites it. Always copy standalone first, then overlay `public/` and `.next/static/` on top.

## Docker Compose

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
    restart: unless-stopped
```

The `DATABASE_URL` is read from a `.env` file in the same directory.

### `.env` file on the server

```bash
DATABASE_URL="postgresql://user:password@db-host:5432/dbname"
```

**Never commit `.env` to git.** Create it manually on each deployment target.

## Supporting Files

### `.dockerignore`

```
node_modules
.next
.git
.gitignore
.env
.env.*
*.md
docs
.eslintrc*
.prettierrc*
.vscode
```

This keeps the Docker build context small. Without it, Docker sends your entire `node_modules` and `.next` to the daemon (slow, wasteful).

## Build and Deploy

### First-time setup on the server

```bash
git clone <repo-url> myapp
cd myapp

# Create the env file
cat > .env << 'EOF'
DATABASE_URL="postgresql://user:password@db-host:5432/dbname"
EOF

# Build and start
docker compose up -d --build
```

### Verify

```bash
docker compose ps              # Should show "Up"
docker compose logs -f app     # Watch for errors
curl http://localhost:3000      # Should return HTML
```

## Development and Maintenance Workflow

### Overview

Development happens entirely on your local machine. Docker is only used for production on the server. The two environments are connected through git.

```
Local (dev machine)                    Server (Unraid/Docker)
───────────────────                    ──────────────────────
npm run dev                            docker compose up -d
  ↓ hot reload                           ↓ serves production build
edit code → see changes instantly      static build, no hot reload
  ↓                                      ↑
git push  ──────────────────────────→  git pull && docker compose up -d --build
```

### Day-to-Day: Code Changes (no schema changes)

This is the most common workflow — editing components, fixing bugs, adding features.

**On your dev machine:**

```bash
# 1. Start the dev server
npm run dev

# 2. Make your changes
#    - Edit components, pages, styles, services
#    - Browser auto-refreshes at http://localhost:3000

# 3. When satisfied, commit and push
git add src/components/dashboard/kpi-card.tsx
git commit -m "fix: correct KPI card alignment on mobile"
git push
```

**On the server:**

```bash
# 4. Pull and rebuild
cd /path/to/myapp
git pull
docker compose up -d --build

# 5. Verify (optional)
docker compose logs -f app
```

That's it. No database steps, no migration steps. The rebuild takes 1-2 minutes thanks to Docker layer caching (only the build stage re-runs if just source code changed).

### Schema Changes (database migrations)

When you modify `prisma/schema.prisma` — adding tables, fields, or changing relations.

**On your dev machine:**

```bash
# 1. Edit the schema
#    prisma/schema.prisma

# 2. Create the migration (updates your local dev DB too)
npx prisma migrate dev --name add-status-field

# 3. Test locally
npm run dev
# Verify the new field/table works as expected

# 4. Apply migration to the production database
#    Point to the production DB and deploy
DATABASE_URL="postgresql://user:pass@db-host:5432/dbname" npx prisma migrate deploy

# 5. Commit everything (schema + migration files)
git add prisma/
git commit -m "feat: add status field to projects"
git push
```

**On the server:**

```bash
# 6. Pull and rebuild (migration already applied in step 4)
cd /path/to/myapp
git pull
docker compose up -d --build
```

**Important:** Always apply migrations (step 4) **before** rebuilding the container (step 6). The new code expects the new schema to exist.

### Adding Dependencies

When you `npm install` a new package.

**On your dev machine:**

```bash
# 1. Install the package
npm install some-package

# 2. Test locally
npm run dev

# 3. Commit and push (both package.json and package-lock.json)
git add package.json package-lock.json
git commit -m "feat: add some-package for XYZ"
git push
```

**On the server:**

```bash
# 4. Pull and rebuild — Docker will re-run npm ci because package.json changed
cd /path/to/myapp
git pull
docker compose up -d --build
```

This rebuild is slower than a code-only change because the `deps` stage cache is invalidated and all dependencies are reinstalled.

### Adding New Pages with Database Queries

When you create a new Server Component page that fetches data.

```bash
# 1. Create the page
#    src/app/reports/page.tsx

# 2. If the page fetches data at render time, mark it dynamic
#    Add to the top of the file:
#    export const dynamic = "force-dynamic";

# 3. Test locally
npm run dev

# 4. Verify the build still works
npm run build
#    Check the route table — your new page should show ƒ (dynamic), not ○ (static)

# 5. Commit and push, then rebuild on server
```

**Rule of thumb:** If a page has `await someService()` in the component body, it needs `force-dynamic`.

### Routine Maintenance

#### Checking container health

```bash
# Is it running?
docker compose ps

# Recent logs
docker compose logs --tail 50 app

# Resource usage
docker stats
```

#### Restarting without rebuilding

If the container is misbehaving but code hasn't changed:

```bash
docker compose restart
```

#### Full clean rebuild

If something seems cached incorrectly or you want a fresh start:

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

#### Checking disk space

Docker images accumulate over time. Clean up old ones:

```bash
# Remove unused images (safe — won't remove running containers' images)
docker image prune -f

# Nuclear option — remove all unused images, containers, networks
docker system prune -f
```

### Quick Reference

| Task | Dev machine | Server |
|------|------------|--------|
| Code change | Edit, test with `npm run dev`, push | `git pull && docker compose up -d --build` |
| Schema change | `npx prisma migrate dev`, apply to prod DB, push | `git pull && docker compose up -d --build` |
| New dependency | `npm install`, push | `git pull && docker compose up -d --build` |
| Rollback | `git revert`, push | `git pull && docker compose up -d --build` |
| View logs | — | `docker compose logs -f app` |
| Restart | — | `docker compose restart` |
| Full rebuild | — | `docker compose build --no-cache && docker compose up -d` |

## Database Migrations

### Why migrations don't run in the container

The Prisma CLI (`prisma`) is a devDependency with many transitive dependencies (`valibot`, `@prisma/dev`, etc.) that aren't available in the minimal runner image. Including them would bloat the image.

### How to handle migrations

Run migrations **from your dev machine** before deploying:

```bash
# On your dev machine (has full node_modules)
DATABASE_URL="postgresql://user:password@db-host:5432/dbname" npx prisma migrate deploy
```

Or if your `.env` already points to the production database:

```bash
npx prisma migrate deploy
```

### Workflow for schema changes

1. Edit `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name describe-change` (creates migration files)
3. Run `npx prisma migrate deploy` against the production database
4. Commit and push
5. Rebuild the Docker container: `git pull && docker compose up -d --build`

## Gotchas and Lessons Learned

### 1. Static pages fail with ECONNREFUSED during build

**Problem:** Next.js tries to prerender pages at build time. If those pages query the database, the build fails because there's no DB in the Docker build environment.

**Fix:** Add `export const dynamic = "force-dynamic"` to every page that fetches data from the database.

### 2. No CSS in production (unstyled page)

**Problem:** The standalone output does NOT include `.next/static/` (CSS, JS bundles) or `public/`. The page loads but looks completely unstyled.

**Fix:** Copy both directories into the standalone build in the Dockerfile. And make sure the COPY order is: standalone first, then static assets on top.

### 3. `prisma: not found` or `Cannot find module 'valibot'`

**Problem:** The Prisma CLI isn't available in the minimal runner stage because it's a devDependency with a large dependency tree.

**Fix:** Don't run prisma commands in the container. Run migrations from your dev machine.

### 4. `npx` not available in runner

**Problem:** The standalone runner has a minimal node_modules. `npx` may not resolve packages that aren't bundled.

**Fix:** If you must run a binary in the container, use `node node_modules/package/build/index.js` instead of `npx package`. But prefer keeping the runner minimal and running tools externally.

### 5. Prisma generate must happen before `npm run build`

**Problem:** Next.js needs the generated Prisma client at build time to compile server components.

**Fix:** The Dockerfile runs `npx prisma generate` before `npm run build` in the builder stage. The generated client at `src/generated/prisma/` gets bundled into the standalone output automatically.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Container keeps restarting | Check `docker compose logs` | Usually a missing env var or DB connection issue |
| ECONNREFUSED during build | Static page queries DB at build time | Add `export const dynamic = "force-dynamic"` |
| No CSS / broken layout | `.next/static` not in standalone | Check Dockerfile COPY order |
| `MODULE_NOT_FOUND` at runtime | Missing dependency in runner | Either add COPY for that dep or restructure to avoid needing it |
| DB connection timeout at runtime | PostgreSQL not accepting remote connections | Check `pg_hba.conf` allows Docker subnet (`172.16.0.0/12`, `10.0.0.0/8`) |
| Build is very slow | No Docker layer caching | Ensure `package.json` COPY is separate from source COPY |

### Useful debug commands

```bash
# Shell into the running container
docker compose exec app sh

# Check what files are in the container
docker compose exec app ls -la

# Check environment variables
docker compose exec app env

# Test database connectivity from container
docker compose exec app sh -c "nc -z db-host 5432 && echo OK || echo FAIL"

# Full rebuild without cache
docker compose build --no-cache
```

## Checklist

Use this before every new deployment:

- [ ] `output: "standalone"` in `next.config.ts`
- [ ] All DB-dependent pages have `export const dynamic = "force-dynamic"`
- [ ] `.dockerignore` exists and excludes `node_modules`, `.next`, `.git`, `.env`
- [ ] Dockerfile copies static assets AFTER standalone (correct order)
- [ ] `.env` file created on the server with correct `DATABASE_URL`
- [ ] Database migrations applied: `npx prisma migrate deploy`
- [ ] Build test: `docker compose build` succeeds
- [ ] Runtime test: `docker compose up -d` and `curl http://localhost:3000` returns HTML
- [ ] Logs clean: `docker compose logs app` shows no errors
