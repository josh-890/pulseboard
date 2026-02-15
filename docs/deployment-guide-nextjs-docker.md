# Deployment Guide: Next.js + Prisma + Docker on Unraid

A reusable guide for deploying Next.js App Router applications with Prisma ORM as Docker containers on Unraid (or any Docker host). Based on real deployment experience and gotchas.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Prepare the Next.js App](#prepare-the-nextjs-app)
3. [Dockerfile](#dockerfile)
4. [Docker Compose](#docker-compose)
5. [Supporting Files](#supporting-files)
6. [Build and Deploy](#build-and-deploy)
7. [Updating the App](#updating-the-app)
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

## Updating the App

After pushing code changes to git:

```bash
cd /path/to/myapp
git pull
docker compose up -d --build
```

Docker layer caching makes rebuilds fast — only changed layers are rebuilt.

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
