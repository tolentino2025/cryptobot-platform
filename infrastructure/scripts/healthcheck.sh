#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Health Check Script — Verify all components are running
# ═══════════════════════════════════════════════════════════════

set -e

API_URL=${API_URL:-http://localhost:3001}
TOKEN=${API_AUTH_TOKEN:-}

echo "🔍 CryptoBot Platform — Health Check"
echo "====================================="

# API Health
echo -n "API Server:    "
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ OK"
  HEALTH=$(curl -s "$API_URL/health")
  echo "   $HEALTH"
else
  echo "❌ FAILED (HTTP $HTTP_CODE)"
fi

# System State
if [ -n "$TOKEN" ]; then
  echo -n "System State:  "
  STATE=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_URL/system/state" 2>/dev/null || echo '{"error":"unavailable"}')
  echo "$STATE"
fi

# PostgreSQL
echo -n "PostgreSQL:    "
if docker exec cryptobot-postgres pg_isready -U cryptobot >/dev/null 2>&1; then
  echo "✅ OK"
else
  echo "❌ FAILED"
fi

# Redis
echo -n "Redis:         "
if docker exec cryptobot-redis redis-cli ping >/dev/null 2>&1; then
  echo "✅ OK"
else
  echo "❌ FAILED"
fi

# Dashboard
echo -n "Dashboard:     "
DASH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000" 2>/dev/null || echo "000")
if [ "$DASH_CODE" = "200" ]; then
  echo "✅ OK (http://localhost:3000)"
else
  echo "⚠️  NOT RUNNING (HTTP $DASH_CODE)"
fi

echo ""
echo "====================================="
