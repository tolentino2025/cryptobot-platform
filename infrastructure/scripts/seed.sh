#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Database Seed Script
# ═══════════════════════════════════════════════════════════════

set -e

echo "🌱 Seeding database..."

cd "$(dirname "$0")/../.."

npx --workspace=packages/db tsx prisma/seed.ts

echo "✅ Seed complete"
