#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: CONFIRM_RESTORE=<backup file> $0 /absolute/path/to/backup.sql.gz" >&2
  exit 2
fi

BACKUP_FILE="$1"
if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi
if [[ "${CONFIRM_RESTORE:-}" != "$BACKUP_FILE" ]]; then
  echo "Refusing restore. Set CONFIRM_RESTORE to the exact backup path after a maintenance window and a fresh backup." >&2
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.production.yml"
ENV_FILE="${ENV_FILE:-$PROJECT_ROOT/server/.env.production}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing production environment file: $ENV_FILE" >&2
  exit 1
fi
gzip -t "$BACKUP_FILE"
echo "Restoring into the configured production database. This overwrites data."
gzip -dc "$BACKUP_FILE" | docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db sh -lc 'psql --set ON_ERROR_STOP=1 --dbname "$POSTGRES_DB"'
echo "Restore completed; run the smoke checks before reopening traffic."
