#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# CryptoBot Platform — Local Setup Script
# Installs deps, starts infra, runs migrations, seeds DB
# ═══════════════════════════════════════════════════════════════

set -e

cd "$(dirname "$0")/../.."
ROOT=$(pwd)

echo "╔══════════════════════════════════════════════╗"
echo "║  CryptoBot Platform — Setup                  ║"
echo "║  ⚠️  No guarantee of financial returns.       ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── 1. Environment ──
if [ ! -f .env ]; then
  echo "📋 Creating .env from template..."
  cp .env.example .env
  # Generate random auth token
  TOKEN=$(openssl rand -hex 32 2>/dev/null || echo "change-this-to-a-secure-random-string-$(date +%s)")
  sed -i "s/change-this-to-a-secure-random-string/$TOKEN/" .env
  echo "   ✅ .env created with random API_AUTH_TOKEN"
  echo "   ⚠️  Edit .env to add ANTHROPIC_API_KEY if you want Claude decisions"
  echo ""
else
  echo "📋 .env already exists — keeping it"
fi

# ── 2. Dependencies ──
echo "📦 Installing dependencies..."
npm install
echo "   ✅ Dependencies installed"
echo ""

# ── 3. Infrastructure ──
echo "🐳 Starting PostgreSQL and Redis..."
cd infrastructure
docker compose up -d postgres redis
cd "$ROOT"

echo "⏳ Waiting for services..."
sleep 3

# Wait for PostgreSQL
for i in $(seq 1 30); do
  if docker exec cryptobot-postgres pg_isready -U cryptobot >/dev/null 2>&1; then
    echo "   ✅ PostgreSQL ready"
    break
  fi
  if [ "$i" = "30" ]; then
    echo "   ❌ PostgreSQL failed to start!"
    exit 1
  fi
  sleep 1
done

# Wait for Redis
for i in $(seq 1 15); do
  if docker exec cryptobot-redis redis-cli ping >/dev/null 2>&1; then
    echo "   ✅ Redis ready"
    break
  fi
  sleep 1
done
echo ""

# ── 4. Database ──
echo "🔧 Generating Prisma client..."
npx --workspace=packages/db prisma generate
echo "   ✅ Prisma client generated"

echo "📊 Running migrations..."
npx --workspace=packages/db prisma migrate dev --name init 2>/dev/null || \
npx --workspace=packages/db prisma db push
echo "   ✅ Database schema applied"

echo "🌱 Seeding database..."
npx --workspace=packages/db tsx prisma/seed.ts
echo "   ✅ Database seeded with conservative defaults"
echo ""

# ── 5. Verify ──
echo "🔍 Verifying setup..."
echo "   PostgreSQL: $(docker exec cryptobot-postgres pg_isready -U cryptobot 2>&1 | head -1)"
echo "   Redis:      $(docker exec cryptobot-redis redis-cli ping 2>&1)"
echo ""

# ── Done ──
echo "╔══════════════════════════════════════════════╗"
echo "║  ✅ Setup complete!                          ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "  Start API:       npm run --workspace=@cryptobot/api dev"
echo "  Start Dashboard: npm run --workspace=@cryptobot/web dev"
echo "  Run Tests:       npm run test"
echo "  Health Check:    bash infrastructure/scripts/healthcheck.sh"
echo ""
echo "  API:       http://localhost:3001"
echo "  Dashboard: http://localhost:3000"
echo ""
echo "  ⚠️  System starts in SIM mode (safe, no real money)."
echo "  ⚠️  Never switch to LIVE without thorough testing!"
echo ""
