#!/usr/bin/env bash
set -euo pipefail

# Default database connection string (reads from DATABASE_URL if available)
DB_URL="${DATABASE_URL:-postgresql://visualizer:visualizer_local@localhost:5432/visualizer_dev}"
BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.sql.gz"

echo "=== Starting Database Backup ==="
echo "Target backup: ${BACKUP_FILE}"

# Create backup directory
mkdir -p "${BACKUP_DIR}"

# Run pg_dump and compress with gzip
pg_dump "${DB_URL}" --no-owner --no-acl | gzip > "${BACKUP_FILE}"

echo "✓ Database backup completed successfully!"
echo "Size: $(du -sh "${BACKUP_FILE}" | cut -f1)"
