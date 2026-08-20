#!/usr/bin/env bash
set -euo pipefail

# Default database connection string (reads from DATABASE_URL if available)
DB_URL="${DATABASE_URL:-postgresql://visualizer:visualizer_local@localhost:5432/visualizer_dev}"
BACKUP_FILE="${1:-}"

if [ -z "${BACKUP_FILE}" ]; then
  echo "Error: Backup file path argument is required."
  echo "Usage: ./restore.sh <path_to_backup_file.sql.gz>"
  exit 1
fi

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Error: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

echo "=== Starting Database Restoration ==="
echo "Source backup: ${BACKUP_FILE}"
echo "Warning: This will overwrite tables in the target database."

# Truncate existing schema/tables
echo "Recreating public schema..."
psql "${DB_URL}" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Decompress and apply restore
gunzip -c "${BACKUP_FILE}" | psql "${DB_URL}"

echo "✓ Database restoration completed successfully!"
