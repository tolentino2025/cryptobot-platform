#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Database Backup Script
# Creates a timestamped PostgreSQL dump
# ═══════════════════════════════════════════════════════════════

set -e

BACKUP_DIR=${BACKUP_DIR:-./backups}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="cryptobot_backup_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "📦 Backing up database..."

docker exec cryptobot-postgres pg_dump -U cryptobot cryptobot | gzip > "$BACKUP_DIR/$FILENAME"

SIZE=$(ls -lh "$BACKUP_DIR/$FILENAME" | awk '{print $5}')
echo "✅ Backup saved: $BACKUP_DIR/$FILENAME ($SIZE)"

# Keep only last 30 backups
ls -t "$BACKUP_DIR"/cryptobot_backup_*.sql.gz 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null || true
echo "🧹 Old backups cleaned (keeping last 30)"
