// ═══════════════════════════════════════════════════════════════
// Database Seed — Initial Conservative Configuration
// Populates bot_config, strategy_config, risk_limits, and symbols
// ═══════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database with initial conservative configuration...');

  // ── Bot Config ──
  await prisma.botConfig.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      mode: 'SIM',
      exchange: 'SIMULATED',
      decisionIntervalSec: 15,
      claudeModel: 'claude-sonnet-4-20250514',
      claudeTimeoutMs: 5000,
      claudeMaxRetries: 1,
      version: 1,
      enabled: true,
    },
  });
  console.log('  ✓ Bot config created (mode: SIM)');

  // ── Strategy Config ──
  await prisma.strategyConfig.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      name: 'Micro Pullback',
      type: 'MICRO_PULLBACK',
      emaFastPeriod: 9,
      emaSlowPeriod: 21,
      rsiPeriod: 7,
      rsiOversold: 15,
      rsiOverbought: 68,
      atrPeriod: 14,
      minVolumeRatio: 0.15,
      minBookImbalance: 0.15,
      minConfidence: 0.5,
      takeProfitBps: 30,
      stopLossBps: 20,
      timeoutSeconds: 300,
      candleInterval: '1m',
      lookbackCandles: 60,
      version: 1,
      isActive: true,
    },
  });
  console.log('  ✓ Strategy config created (Micro Pullback)');

  // ── Risk Limits (very conservative) ──
  await prisma.riskLimits.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      maxPositionNotional: 100,
      maxTotalExposureNotional: 200,
      maxOpenPositions: 1,
      maxDailyLoss: 20,
      maxWeeklyLoss: 50,
      maxTradesPerHour: 4,
      maxConsecutiveLosses: 3,
      cooldownAfterLossMinutes: 30,
      maxSpreadBps: 15,
      maxSlippageBps: 10,
      allowedSymbols: ['BTCUSDT'],
      allowedSessions: ['*'],
      dataFreshnessMaxMs: 5000,
      maxOrderRetries: 2,
      killOnExchangeDesync: true,
      killOnMarketDataGap: true,
      killOnUnexpectedPosition: true,
      killOnRepeatedRejections: true,
      noTradeDuringIncident: true,
      noTradeWhenBalanceBelowThreshold: true,
      minBalanceThreshold: 10,
      minConfidence: 0.5,
      allowPyramiding: false,
      version: 1,
      isActive: true,
    },
  });
  console.log('  ✓ Risk limits created (conservative defaults)');

  // ── Symbols ──
  await prisma.symbol.upsert({
    where: { symbol: 'BTCUSDT' },
    update: {},
    create: {
      symbol: 'BTCUSDT',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      minNotional: 10,
      stepSize: 0.00001,
      pricePrecision: 2,
      quantityPrecision: 5,
      enabled: true,
    },
  });
  console.log('  ✓ Symbol BTCUSDT created');

  // ── Initial System State ──
  await prisma.systemState.create({
    data: {
      state: 'INITIALIZING',
      reason: 'Initial seed',
      triggeredBy: 'seed',
    },
  });
  console.log('  ✓ Initial system state created');

  console.log('\n✅ Seed complete. System ready for SIM mode.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
