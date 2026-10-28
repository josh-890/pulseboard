#!/usr/bin/env bash
set -euo pipefail

# Back up ONE tenant's production database and record when (ADR-0038 S3).
#
#   bash scripts/tenant-backup.sh xpulse     # or: pulse
#
# Writes backups/<database>_<timestamp>.sql, checks the dump ran to its end, and
# only then records the time in that database (Setting "backup.lastAt") — the
# catalogue load refuses its first run unless that time is under 24 hours old.
# (scripts/db-backup.sh backs up DATABASE_URL only, i.e. pulse.)

TENANT="${1:-}"
case "$TENANT" in
  pulse) VAR="DATABASE_URL" ;;
  xpulse) VAR="TENANT_XPULSE_DATABASE_URL" ;;
  *) echo "Usage: bash scripts/tenant-backup.sh pulse|xpulse"; exit 1 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env.production"
[ -f "$ENV_FILE" ] || { echo "ERROR: .env.production not found"; exit 1; }

URL=$(grep "^$VAR=" "$ENV_FILE" | cut -d= -f2- | tr -d '"')
[ -n "$URL" ] || { echo "ERROR: $VAR not found in .env.production"; exit 1; }
DB="${URL##*/}"; DB="${DB%%\?*}"

PG_DUMP="/usr/lib/postgresql/17/bin/pg_dump"
[ -x "$PG_DUMP" ] || PG_DUMP="pg_dump"

mkdir -p "$PROJECT_DIR/backups"
OUT="$PROJECT_DIR/backups/${DB}_$(date +%Y%m%d_%H%M%S).sql"
echo "Backing up $TENANT ($DB) → $OUT"
"$PG_DUMP" "$URL" > "$OUT"

if ! tail -c 2000 "$OUT" | grep -q "PostgreSQL database dump complete"; then
  echo "ERROR: the dump did not finish — nothing recorded"
  exit 1
fi

NOW=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
psql "$URL" -q -c "INSERT INTO \"Setting\" (key, value, \"updatedAt\") VALUES ('backup.lastAt', '$NOW', now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, \"updatedAt\" = now();"
echo "Done: $(du -h "$OUT" | cut -f1), recorded backup.lastAt = $NOW"
