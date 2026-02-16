#!/usr/bin/env bash
set -euo pipefail

# Back up the production database before deploying migrations.
# Usage: bash scripts/db-backup.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load production env
if [ ! -f "$PROJECT_DIR/.env.production" ]; then
  echo "ERROR: .env.production not found. Cannot back up production database."
  exit 1
fi

# Extract DATABASE_URL from .env.production
DATABASE_URL=$(grep '^DATABASE_URL=' "$PROJECT_DIR/.env.production" | sed 's/^DATABASE_URL="//' | sed 's/"$//')

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL not found in .env.production"
  exit 1
fi

# Create backups directory
BACKUP_DIR="$PROJECT_DIR/backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/pulseboard_$TIMESTAMP.sql"

# Mask password in output
MASKED_URL=$(echo "$DATABASE_URL" | sed 's|://[^:]*:[^@]*@|://***:***@|')
echo "Backing up: $MASKED_URL"
echo "Output:     $BACKUP_FILE"

pg_dump "$DATABASE_URL" > "$BACKUP_FILE"

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "Done! Backup size: $SIZE"
