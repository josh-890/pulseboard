#!/usr/bin/env bash
set -uo pipefail
# NOTE: -e intentionally omitted so per-tenant failures don't abort the loop
# (each tenant is reported individually; final non-zero exit if any failed).

# Deploy pending Prisma migrations to production database(s).
# Supports both single-tenant (DATABASE_URL) and multi-tenant (TENANT_REGISTRY) modes.
# Usage: bash scripts/deploy-migrations.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Early sanity: this script needs npx on PATH (Prisma CLI is invoked via npx).
# On the Unraid host, node is not installed by default — fail loudly instead
# of silently appearing to succeed (caused the Phase G S1 deploy incident).
if ! command -v npx >/dev/null 2>&1; then
  echo "ERROR: npx not found on PATH."
  echo "       This script must run somewhere with Node.js installed (typically the dev box)."
  echo "       The Unraid host doesn't have node — run migrations from your dev machine"
  echo "       pointed at the production database URLs, or exec into the running container."
  exit 1
fi

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

  # Track per-tenant outcomes — don't abort the loop on first failure so the
  # operator sees the full picture and other tenants still get attempted.
  FAILED_TENANTS=()
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
    if DATABASE_URL="$TENANT_URL" npx prisma migrate deploy; then
      echo "Tenant '$TENANT' done."
    else
      echo "ERROR: Tenant '$TENANT' migration FAILED. Continuing with remaining tenants."
      FAILED_TENANTS+=("$TENANT")
    fi
  done

  if [ "${#FAILED_TENANTS[@]}" -gt 0 ]; then
    echo ""
    echo "=== SUMMARY ==="
    echo "FAILED tenants: ${FAILED_TENANTS[*]}"
    echo "Investigate the failed tenant(s) before redeploying. See:"
    echo "  docs/migration-recipes/README.md  (manual recovery patterns)"
    exit 1
  fi
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
