#!/usr/bin/env bash
set -euo pipefail

# Deploy pending Prisma migrations to production database(s).
# Supports both single-tenant (DATABASE_URL) and multi-tenant (TENANT_REGISTRY) modes.
# Usage: bash scripts/deploy-migrations.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load production env
if [ ! -f "$PROJECT_DIR/.env.production" ]; then
  echo "ERROR: .env.production not found."
  exit 1
fi

# Source all env vars from .env.production
set -a
# shellcheck disable=SC1091
source "$PROJECT_DIR/.env.production"
set +a

echo "=== PRODUCTION Migration ==="

# Check if multi-tenant mode
if [ -n "${TENANT_REGISTRY:-}" ]; then
  echo "Multi-tenant mode: $TENANT_REGISTRY"
  echo ""

  IFS=',' read -ra TENANTS <<< "$TENANT_REGISTRY"

  for TENANT in "${TENANTS[@]}"; do
    TENANT=$(echo "$TENANT" | xargs) # trim whitespace
    UPPER=$(echo "$TENANT" | tr '[:lower:]' '[:upper:]')
    URL_VAR="TENANT_${UPPER}_DATABASE_URL"
    TENANT_URL="${!URL_VAR:-}"

    if [ -z "$TENANT_URL" ]; then
      echo "WARNING: $URL_VAR not set, skipping tenant '$TENANT'"
      continue
    fi

    MASKED_URL=$(echo "$TENANT_URL" | sed 's|://[^:]*:[^@]*@|://***:***@|')
    echo "Tenant '$TENANT': $MASKED_URL"
  done

  echo ""
  read -rp "Apply pending migrations to ALL production databases? (y/N) " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborted."
    exit 0
  fi

  for TENANT in "${TENANTS[@]}"; do
    TENANT=$(echo "$TENANT" | xargs)
    UPPER=$(echo "$TENANT" | tr '[:lower:]' '[:upper:]')
    URL_VAR="TENANT_${UPPER}_DATABASE_URL"
    TENANT_URL="${!URL_VAR:-}"

    if [ -z "$TENANT_URL" ]; then
      continue
    fi

    echo ""
    echo "--- Migrating tenant '$TENANT' ---"
    DATABASE_URL="$TENANT_URL" npx prisma migrate deploy
    echo "Tenant '$TENANT' done."
  done
else
  # Single-tenant mode — use DATABASE_URL directly
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "ERROR: Neither TENANT_REGISTRY nor DATABASE_URL found in .env.production"
    exit 1
  fi

  MASKED_URL=$(echo "$DATABASE_URL" | sed 's|://[^:]*:[^@]*@|://***:***@|')
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
fi

echo ""
echo "Production migrations applied successfully."
