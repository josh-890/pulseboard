#!/usr/bin/env bash
set -euo pipefail

# Deploy pending Prisma migrations to the PRODUCTION database.
# Usage: bash scripts/deploy-migrations.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load production env
if [ ! -f "$PROJECT_DIR/.env.production" ]; then
  echo "ERROR: .env.production not found."
  exit 1
fi

DATABASE_URL=$(grep '^DATABASE_URL=' "$PROJECT_DIR/.env.production" | sed 's/^DATABASE_URL="//' | sed 's/"$//')

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL not found in .env.production"
  exit 1
fi

MASKED_URL=$(echo "$DATABASE_URL" | sed 's|://[^:]*:[^@]*@|://***:***@|')

echo "=== PRODUCTION Migration ==="
echo "Target: $MASKED_URL"
echo ""
read -rp "Apply pending migrations to PRODUCTION? (y/N) " confirm

if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "Running prisma migrate deploy..."
DATABASE_URL="$DATABASE_URL" npx prisma migrate deploy

echo ""
echo "Production migrations applied successfully."
