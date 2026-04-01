#!/usr/bin/env bash
set -euo pipefail

# Create and initialize a new tenant database.
# Usage: bash scripts/create-tenant-db.sh <tenant_id>
#
# Prerequisites:
# - PostgreSQL running and accessible
# - .env or .env.production has TENANT_<ID>_DATABASE_URL set
# - MinIO running (for bucket creation)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <tenant_id>"
  echo "Example: $0 bob"
  exit 1
fi

TENANT_ID="$1"
UPPER=$(echo "$TENANT_ID" | tr '[:lower:]' '[:upper:]')

# Load env
ENV_FILE="${PROJECT_DIR}/.env"
if [ -f "$PROJECT_DIR/.env.production" ]; then
  ENV_FILE="$PROJECT_DIR/.env.production"
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

URL_VAR="TENANT_${UPPER}_DATABASE_URL"
TENANT_URL="${!URL_VAR:-}"
BUCKET_VAR="TENANT_${UPPER}_MINIO_BUCKET"
TENANT_BUCKET="${!BUCKET_VAR:-}"

if [ -z "$TENANT_URL" ]; then
  echo "ERROR: $URL_VAR not set in $ENV_FILE"
  exit 1
fi

echo "=== Create Tenant Database: $TENANT_ID ==="
echo "Database URL: $(echo "$TENANT_URL" | sed 's|://[^:]*:[^@]*@|://***:***@|')"
echo "MinIO bucket: ${TENANT_BUCKET:-not configured}"
echo ""

# Extract database name from URL
DB_NAME=$(echo "$TENANT_URL" | sed 's|.*/||' | sed 's|\?.*||')
# Extract connection base (without database name)
BASE_URL=$(echo "$TENANT_URL" | sed "s|/$DB_NAME.*|/postgres|")

echo "Step 1: Creating database '$DB_NAME' (if not exists)..."
psql "$BASE_URL" -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || \
  psql "$BASE_URL" -c "CREATE DATABASE \"$DB_NAME\""

echo "Step 2: Enabling extensions..."
psql "$TENANT_URL" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS unaccent;"

echo "Step 3: Running Prisma migrations..."
DATABASE_URL="$TENANT_URL" npx prisma migrate deploy

echo "Step 4: Seeding default data (skill catalog, categories)..."
TENANT_ID="$TENANT_ID" DATABASE_URL="$TENANT_URL" npx tsx prisma/seed.ts

if [ -n "$TENANT_BUCKET" ]; then
  echo "Step 5: Creating MinIO bucket '$TENANT_BUCKET'..."
  # Use the setup-minio script or mc CLI if available
  if command -v mc &> /dev/null; then
    mc mb "minio/$TENANT_BUCKET" --ignore-existing 2>/dev/null || true
    mc anonymous set download "minio/$TENANT_BUCKET" 2>/dev/null || true
    echo "Bucket created."
  else
    echo "WARNING: MinIO client (mc) not found. Create bucket '$TENANT_BUCKET' manually."
  fi
fi

echo ""
echo "Tenant '$TENANT_ID' database setup complete."
