#!/usr/bin/env bash
set -euo pipefail

# Standalone backup helper for an existing Node + PostgreSQL deployment.
# It deliberately does not delete old backups; retention must be enabled only
# after an operator has confirmed an off-host copy and a recovery rehearsal.

ENV_FILE="${1:-/opt/stardust-campus-circle-api/.env}"
BACKUP_DIR="${BACKUP_DIR:-/home/ubuntu/campus-circle-backups/daily}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Environment file not found: $ENV_FILE" >&2
  exit 1
fi

read_env_value() {
  local key="$1"
  node -e '
    const fs = require("node:fs")
    const path = require("node:path")
    const envFile = process.argv[1]
    const key = process.argv[2]
    const dotenv = require(require.resolve("dotenv", {paths: [path.dirname(envFile)]}))
    const env = dotenv.parse(fs.readFileSync(envFile, "utf8"))
    process.stdout.write(String(env[key] || ""))
  ' "$ENV_FILE" "$key"
}

DATABASE_URL="$(read_env_value DATABASE_URL)"
UPLOAD_DIR="$(read_env_value UPLOAD_DIR)"

if [[ -z "$DATABASE_URL" ]]; then
  echo "DATABASE_URL is required in $ENV_FILE" >&2
  exit 1
fi

umask 077
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BASE="$BACKUP_DIR/stardust-campus-circle-$STAMP"
DATABASE_DUMP="$BASE.dump"

pg_dump --format=custom --no-owner --no-privileges --file "$DATABASE_DUMP" "$DATABASE_URL"
pg_restore --list "$DATABASE_DUMP" >/dev/null

if [[ -n "$UPLOAD_DIR" && -d "$UPLOAD_DIR" ]]; then
  UPLOAD_ARCHIVE="$BASE.uploads.tgz"
  tar -C "$(dirname "$UPLOAD_DIR")" -czf "$UPLOAD_ARCHIVE" "$(basename "$UPLOAD_DIR")"
  gzip -t "$UPLOAD_ARCHIVE"
fi

printf 'Backup verified: %s\n' "$DATABASE_DUMP"
if [[ -n "${UPLOAD_ARCHIVE:-}" ]]; then
  printf 'Uploads archived: %s\n' "$UPLOAD_ARCHIVE"
fi
