#!/bin/sh
# Nightly Postgres dump, kept for RETENTION_DAYS.
# Run by the `backup` service in docker-compose.yml; safe to run by hand too.
set -eu

: "${POSTGRES_HOST:=postgres}"
: "${POSTGRES_USER:=sendwhats}"
: "${POSTGRES_DB:=sendwhats}"
: "${BACKUP_DIR:=/backups}"
: "${RETENTION_DAYS:=14}"
: "${BACKUP_INTERVAL_SECONDS:=86400}"

mkdir -p "$BACKUP_DIR"

run_backup() {
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  target="$BACKUP_DIR/${POSTGRES_DB}-${stamp}.sql.gz"

  echo "[backup] dumping $POSTGRES_DB -> $target"
  if pg_dump -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner | gzip > "$target.partial"; then
    # Only name it as a real backup once the dump finished, so a crashed run
    # never leaves a truncated file that looks restorable.
    mv "$target.partial" "$target"
    echo "[backup] wrote $(du -h "$target" | cut -f1) to $target"
  else
    rm -f "$target.partial"
    echo "[backup] FAILED for $POSTGRES_DB" >&2
    return 1
  fi

  find "$BACKUP_DIR" -name "${POSTGRES_DB}-*.sql.gz" -type f -mtime "+$RETENTION_DAYS" -delete
}

if [ "${BACKUP_ONCE:-false}" = "true" ]; then
  run_backup
  exit $?
fi

while true; do
  run_backup || echo "[backup] retrying at the next interval" >&2
  sleep "$BACKUP_INTERVAL_SECONDS"
done
