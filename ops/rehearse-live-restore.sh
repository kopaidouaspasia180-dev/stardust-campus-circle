#!/usr/bin/env bash
set -euo pipefail

# Restores a custom-format PostgreSQL backup into a disposable database on the
# same server. The production database is only used as the administrative
# connection; it is never restored into or modified.

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 /absolute/path/to/server.env /absolute/path/to/backup.dump" >&2
  exit 2
fi

ENV_FILE="$1"
DUMP_FILE="$2"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Environment file not found: $ENV_FILE" >&2
  exit 1
fi
if [[ ! -f "$DUMP_FILE" ]]; then
  echo "Backup file not found: $DUMP_FILE" >&2
  exit 1
fi

read_database_url() {
  node -e '
    const fs = require("node:fs")
    const path = require("node:path")
    const envFile = process.argv[1]
    const dotenv = require(require.resolve("dotenv", {paths: [path.dirname(envFile)]}))
    const env = dotenv.parse(fs.readFileSync(envFile, "utf8"))
    process.stdout.write(String(env.DATABASE_URL || ""))
  ' "$ENV_FILE"
}

DATABASE_URL="$(read_database_url)"
if [[ -z "$DATABASE_URL" ]]; then
  echo "DATABASE_URL is required in $ENV_FILE" >&2
  exit 1
fi

pg_restore --list "$DUMP_FILE" >/dev/null

REHEARSAL_DB="stardust_restore_rehearsal_$(date -u +%Y%m%dT%H%M%SZ)_$$"
if [[ ! "$REHEARSAL_DB" =~ ^stardust_restore_rehearsal_[A-Za-z0-9_]+$ ]]; then
  echo "Unsafe rehearsal database name" >&2
  exit 1
fi

REHEARSAL_URL="$(node -e '
  const url = new URL(process.argv[1])
  url.pathname = "/" + process.argv[2]
  process.stdout.write(url.toString())
' "$DATABASE_URL" "$REHEARSAL_DB")"
DATABASE_USER="$(node -e 'const url = new URL(process.argv[1]); process.stdout.write(decodeURIComponent(url.username))' "$DATABASE_URL")"

if [[ -z "$DATABASE_USER" || ! "$DATABASE_USER" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "Unsafe or missing PostgreSQL application role" >&2
  exit 1
fi

run_postgres_admin() {
  if [[ "$(id -un)" == "postgres" ]]; then
    "$@"
  elif sudo -n -u postgres true 2>/dev/null; then
    sudo -n -u postgres "$@"
  else
    echo "A local PostgreSQL administrator is required for the disposable rehearsal database" >&2
    return 1
  fi
}

cleanup() {
  run_postgres_admin psql --set ON_ERROR_STOP=1 --command \
    "DROP DATABASE IF EXISTS \"$REHEARSAL_DB\" WITH (FORCE);" >/dev/null
}
trap cleanup EXIT

run_postgres_admin createdb --owner "$DATABASE_USER" "$REHEARSAL_DB"

pg_restore --exit-on-error --no-owner --no-privileges \
  --dbname "$REHEARSAL_URL" "$DUMP_FILE"

TABLE_COUNT="$(psql "$REHEARSAL_URL" --tuples-only --no-align --set ON_ERROR_STOP=1 \
  --command "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';")"
MIGRATION_TABLE_COUNT="$(psql "$REHEARSAL_URL" --tuples-only --no-align --set ON_ERROR_STOP=1 \
  --command "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('schema_migrations', 'migrations');")"

if [[ "$TABLE_COUNT" -lt 1 ]]; then
  echo "Restore rehearsal failed: restored database has no public tables" >&2
  exit 1
fi

printf 'Restore rehearsal passed: database=%s tables=%s migration_tables=%s\n' \
  "$REHEARSAL_DB" "$TABLE_COUNT" "$MIGRATION_TABLE_COUNT"
