#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.production.yml"
ENV_FILE="${ENV_FILE:-$PROJECT_ROOT/server/.env.production}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing production environment file: $ENV_FILE" >&2
  exit 1
fi
mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$BACKUP_DIR/stardust-campus-circle-$TIMESTAMP.sql.gz"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db sh -lc 'pg_dump --format=plain --no-owner --no-privileges "$POSTGRES_DB"' | gzip -9 > "$TARGET"
gzip -t "$TARGET"
echo "Backup verified: $TARGET"
