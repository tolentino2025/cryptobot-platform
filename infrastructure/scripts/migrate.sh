#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Database Migration Script
# ═══════════════════════════════════════════════════════════════

set -e

echo "📊 Running database migrations..."

cd "$(dirname "$0")/../.."

# Check if database is reachable
until npx --workspace=packages/db prisma migrate status 2>/dev/null; do
  echo "⏳ Waiting for database..."
  sleep 2
done

# Run migrations
npx --workspace=packages/db prisma migrate dev --name auto

echo "✅ Migrations complete"
