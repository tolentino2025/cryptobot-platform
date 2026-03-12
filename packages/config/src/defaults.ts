// ═══════════════════════════════════════════════════════════════
// Default Configuration Values — Conservative & Safe
// ═══════════════════════════════════════════════════════════════

import type { RiskLimits, StrategyConfig } from '@cryptobot/shared-types';

export const DEFAULT_RISK_LIMITS: RiskLimits = {
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
};

export const DEFAULT_STRATEGY_CONFIG: Omit<StrategyConfig, 'id' | 'version' | 'isActive' | 'updatedAt'> = {
  name: 'Micro Pullback',
  type: 'MICRO_PULLBACK',
  emaFastPeriod: 9,
  emaSlowPeriod: 21,
  rsiPeriod: 7,
  rsiOversold: 40,
  rsiOverbought: 60,
  atrPeriod: 14,
  minVolumeRatio: 1.2,
  minBookImbalance: 0.6,
  minConfidence: 0.5,
  takeProfitBps: 30,
  stopLossBps: 20,
  timeoutSeconds: 300,
  candleInterval: '1m',
  lookbackCandles: 60,
};
