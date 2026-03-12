// ═══════════════════════════════════════════════════════════════
// Test Factories — Generate test data for unit and integration tests
// ═══════════════════════════════════════════════════════════════

import {
  TradeAction,
  EntryType,
  type ModelDecision,
  type RiskLimits,
  type RiskState,
  type PortfolioSummary,
  type Ticker,
} from '@cryptobot/shared-types';

/** Create a test ModelDecision with overrides */
export function createTestDecision(overrides: Partial<ModelDecision> = {}): ModelDecision {
  return {
    action: TradeAction.BUY,
    symbol: 'BTCUSDT',
    confidence: 0.75,
    entry_type: EntryType.LIMIT,
    entry_price: 50000,
    size_quote: 50,
    stop_price: 49800,
    take_profit_price: 50150,
    max_slippage_bps: 5,
    time_horizon_sec: 300,
    thesis: 'Test thesis: pullback in uptrend',
    invalidate_if: ['Price drops below 49700'],
    ...overrides,
  };
}

/** Create conservative test risk limits */
export function createTestRiskLimits(overrides: Partial<RiskLimits> = {}): RiskLimits {
  return {
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
    ...overrides,
  };
}

/** Create a clean risk state (no issues) */
export function createTestRiskState(overrides: Partial<RiskState> = {}): RiskState {
  return {
    dailyPnl: 0,
    weeklyPnl: 0,
    tradesThisHour: 0,
    consecutiveLosses: 0,
    cooldownUntil: null,
    lastTradeTimestamp: null,
    openPositionCount: 0,
    totalExposure: 0,
    activeIncidentCount: 0,
    recentRejectionCount: 0,
    ...overrides,
  };
}

/** Create a test portfolio summary */
export function createTestPortfolio(overrides: Partial<PortfolioSummary> = {}): PortfolioSummary {
  return {
    totalEquity: 10000,
    availableBalance: 10000,
    lockedBalance: 0,
    totalExposure: 0,
    exposurePercent: 0,
    openPositions: [],
    dailyPnl: 0,
    dailyPnlPercent: 0,
    weeklyPnl: 0,
    totalRealizedPnl: 0,
    dailyTradeCount: 0,
    consecutiveLosses: 0,
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Create a test ticker */
export function createTestTicker(overrides: Partial<Ticker> = {}): Ticker {
  return {
    symbol: 'BTCUSDT',
    bid: 49999,
    ask: 50001,
    last: 50000,
    volume24h: 1000,
    quoteVolume24h: 50000000,
    high24h: 51000,
    low24h: 49000,
    timestamp: Date.now(),
    ...overrides,
  };
}
