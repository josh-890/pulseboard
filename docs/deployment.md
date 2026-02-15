# Pulseboard — Deployment Guide

## Architecture

```
Unraid (Docker)
  └── pulseboard container (port 3000)
        → PostgreSQL at 10.66.20.182:5432 (Proxmox)
```

The app runs as a standalone Next.js server inside a lightweight Alpine container (~150MB). It connects to your existing PostgreSQL instance over the network.

## Prerequisites

- Docker and Docker Compose on the host machine (Unraid has these built-in)
- PostgreSQL running and accessible from the Docker host
- The `pulseboard` database already exists with tables migrated

## Quick Start

### 1. Clone the repo on your Unraid machine

```bash
git clone <your-repo-url> pulseboard
cd pulseboard
```

### 2. Create the `.env` file

```bash
cat > .env << 'EOF'
DATABASE_URL="postgresql://pulseboard:your-password-here@10.66.20.182:5432/pulseboard"
EOF
```

Replace `your-password-here` with the actual database password.

### 3. Build and start

```bash
docker compose up -d --build
```

First build takes a few minutes (downloads node:20-alpine, installs deps, compiles Next.js). Subsequent rebuilds are faster due to Docker layer caching.

### 4. Verify

```bash
# Check container is running
docker compose ps

# Check logs for errors
docker compose logs -f pulseboard

# Test the app
curl http://localhost:3000
```

Open `http://<unraid-ip>:3000` in your browser.

## How the Docker Build Works

The Dockerfile uses a 3-stage build to keep the final image small:

| Stage | Purpose | Base |
|-------|---------|------|
| `deps` | Install npm dependencies | node:20-alpine |
| `builder` | Generate Prisma client + build Next.js | node:20-alpine |
| `runner` | Production server (~150MB) | node:20-alpine |

Key detail: Next.js `output: "standalone"` produces a self-contained `server.js` that bundles only the node_modules actually used. The `.next/static` (CSS/JS) and `public/` folders are **not** included in standalone and must be copied separately — the Dockerfile handles this.

## Common Operations

### Rebuild after code changes

```bash
docker compose up -d --build
```

### View logs

```bash
docker compose logs -f
```

### Stop the container

```bash
docker compose down
```

### Run database migrations

Migrations run automatically on container start (`prisma migrate deploy`). To run manually:

```bash
docker compose exec pulseboard npx prisma migrate deploy
```

### Change the port

Edit `docker-compose.yml`:

```yaml
ports:
  - "8080:3000"  # host:container
```

## Troubleshooting

### Container exits immediately

Check logs: `docker compose logs pulseboard`

Most likely causes:
- **Database unreachable** — Verify PostgreSQL is running and the `DATABASE_URL` is correct. Test with: `docker compose exec pulseboard sh -c "nc -z 10.66.20.182 5432 && echo OK"`
- **Migration failure** — If the database schema is out of sync, check the migration error in logs

### No CSS / unstyled page

This means the static assets weren't copied into the standalone build. Rebuild the image:

```bash
docker compose build --no-cache
```

### Cannot connect to database from container

Make sure PostgreSQL is configured to accept connections from Docker's network:

1. In `postgresql.conf`: `listen_addresses = '*'`
2. In `pg_hba.conf`: add a line for the Docker subnet, e.g.:
   ```
   host all all 172.16.0.0/12 md5
   host all all 10.0.0.0/8 md5
   ```
3. Restart PostgreSQL

## Development vs Production

| | Development | Production (Docker) |
|---|---|---|
| Command | `npm run dev` | `docker compose up -d` |
| Port | 3000 | 3000 (configurable) |
| Hot reload | Yes | No (rebuild required) |
| CSS | JIT compiled | Pre-built static files |
| Server | Next.js dev server | `node server.js` (standalone) |

`output: "standalone"` in `next.config.ts` has **no effect** on `npm run dev` — local development works exactly the same as before.
