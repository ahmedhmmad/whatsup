#!/bin/sh
# Restores a dump produced by backup.sh:
#   docker compose run --rm -e BACKUP_FILE=/backups/sendwhats-2026....sql.gz backup /scripts/restore.sh
set -eu

: "${POSTGRES_HOST:=postgres}"
: "${POSTGRES_USER:=sendwhats}"
: "${POSTGRES_DB:=sendwhats}"
: "${BACKUP_FILE:?Set BACKUP_FILE to the dump you want to restore}"

echo "[restore] restoring $BACKUP_FILE into $POSTGRES_DB — existing data will be overwritten"
gunzip -c "$BACKUP_FILE" | psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB"
echo "[restore] done"
