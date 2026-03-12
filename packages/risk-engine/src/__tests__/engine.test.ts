// ═══════════════════════════════════════════════════════════════
// Risk Engine Tests — 25+ scenarios covering all rules
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from 'vitest';
import { RiskEngine } from '../engine.js';
import {
  RiskVerdict,
  RiskDenialReason,
  TradeAction,
  EntryType,
  SystemState,
  type ModelDecision,
  type RiskLimits,
  type RiskState,
  type PortfolioSummary,
} from '@cryptobot/shared-types';

// ── Factories ──

function decision(overrides: Partial<ModelDecision> = {}): ModelDecision {
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
    thesis: 'Test thesis',
    invalidate_if: [],
    ...overrides,
  };
}

function limits(overrides: Partial<RiskLimits> = {}): RiskLimits {
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

function riskState(overrides: Partial<RiskState> = {}): RiskState {
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

function portfolio(overrides: Partial<PortfolioSummary> = {}): PortfolioSummary {
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

describe('RiskEngine', () => {
  let engine: RiskEngine;

  beforeEach(() => {
    engine = new RiskEngine();
  });

  // ════════════════════════════════════════
  // HOLD always approved
  // ════════════════════════════════════════

  describe('HOLD decisions', () => {
    it('should APPROVE any HOLD decision regardless of state', () => {
      const review = engine.evaluate(
        decision({ action: TradeAction.HOLD }),
        limits(),
        riskState({ dailyPnl: -100 }), // Way over loss limit
        portfolio(),
        SystemState.PAUSED, // Not running
        99999, // Stale data
      );
      expect(review.verdict).toBe(RiskVerdict.APPROVED);
      expect(review.denialReasons).toHaveLength(0);
    });
  });

  // ════════════════════════════════════════
  // System state checks
  // ════════════════════════════════════════

  describe('System state', () => {
    it('should DENY when system is PAUSED', () => {
      const review = engine.evaluate(decision(), limits(), riskState(), portfolio(), SystemState.PAUSED, 100);
      expect(review.verdict).toBe(RiskVerdict.DENIED);
      expect(review.denialReasons).toContain(RiskDenialReason.SYSTEM_NOT_RUNNING);
    });

    it('should DENY when system is KILLED', () => {
      const review = engine.evaluate(decision(), limits(), riskState(), portfolio(), SystemState.KILLED, 100);
      expect(review.verdict).toBe(RiskVerdict.DENIED);
      expect(review.denialReasons).toContain(RiskDenialReason.SYSTEM_NOT_RUNNING);
    });

    it('should DENY when system is INITIALIZING', () => {
      const review = engine.evaluate(decision(), limits(), riskState(), portfolio(), SystemState.INITIALIZING, 100);
      expect(review.verdict).toBe(RiskVerdict.DENIED);
    });

    it('should APPROVE when system is RUNNING', () => {
      const review = engine.evaluate(decision(), limits(), riskState(), portfolio(), SystemState.RUNNING, 100);
      expect(review.verdict).toBe(RiskVerdict.APPROVED);
    });
  });

  // ════════════════════════════════════════
  // Symbol whitelist
  // ════════════════════════════════════════

  describe('Symbol whitelist', () => {
    it('should DENY when symbol is not in whitelist', () => {
      const review = engine.evaluate(
        decision({ symbol: 'ETHUSDT' }),
        limits({ allowedSymbols: ['BTCUSDT'] }),
        riskState(), portfolio(), SystemState.RUNNING, 100,
      );
      expect(review.verdict).toBe(RiskVerdict.DENIED);
      expect(review.denialReasons).toContain(RiskDenialReason.SYMBOL_NOT_ALLOWED);
    });

    it('should APPROVE when symbol is in whitelist', () => {
      const review = engine.evaluate(
        decision({ symbol: 'BTCUSDT' }),
        limits({ allowedSymbols: ['BTCUSDT', 'ETHUSDT'] }),
        riskState(), portfolio(), SystemState.RUNNING, 100,
      );
      expect(review.verdict).toBe(RiskVerdict.APPROVED);
    });
  });

  // ════════════════════════════════════════
  // Data freshness
  // ════════════════════════════════════════

  describe('Data freshness', () => {
    it('should DENY when data is stale', () => {
      const review = engine.evaluate(
        decision(), limits({ dataFreshnessMaxMs: 5000 }),
        riskState(), portfolio(), SystemState.RUNNING, 6000,
      );
      expect(review.verdict).toBe(RiskVerdict.DENIED);
      expect(review.denialReasons).toContain(RiskDenialReason.DATA_STALE);
    });

    it('should APPROVE when data is fresh', () => {
      const review = engine.evaluate(
        decision(), limits({ dataFreshnessMaxMs: 5000 }),
        riskState(), portfolio(), SystemState.RUNNING, 2000,
      );
      expect(review.verdict).toBe(RiskVerdict.APPROVED);
    });
  });

  // ════════════════════════════════════════
  // Loss limits
  // ════════════════════════════════════════

  describe('Daily loss limit', () => {
    it('should DENY when daily loss exceeds limit', () => {
      const review = engine.evaluate(
        decision(), limits({ maxDailyLoss: 20 }),
        riskState({ dailyPnl: -25 }),
        portfolio(), SystemState.RUNNING, 100,
      );
      expect(review.verdict).toBe(RiskVerdict.DENIED);
      expect(review.denialReasons).toContain(RiskDenialReason.DAILY_LOSS_EXCEEDED);
    });

    it('should APPROVE when daily PnL is positive', () => {
      const review = engine.evaluate(
        decision(), limits({ maxDailyLoss: 20 }),
        riskState({ dailyPnl: 10 }),
        portfolio(), SystemState.RUNNING, 100,
      );
      expect(review.denialReasons).not.toContain(RiskDenialReason.DAILY_LOSS_EXCEEDED);
    });
  });

  describe('Weekly loss limit', () => {
    it('should DENY when weekly loss exceeds limit', () => {
      const review = engine.evaluate(
        decision(), limits({ maxWeeklyLoss: 50 }),
        riskState({ weeklyPnl: -55 }),
        portfolio(), SystemState.RUNNING, 100,
      );
      expect(review.verdict).toBe(RiskVerdict.DENIED);
      expect(review.denialReasons).toContain(RiskDenialReason.WEEKLY_LOSS_EXCEEDED);
    });
  });

  // ════════════════════════════════════════
  // Position limits
  // ════════════════════════════════════════

  describe('Max open positions', () => {
    it('should DENY BUY when max positions reached', () => {
      const review = engine.evaluate(
        decision({ action: TradeAction.BUY }),
        limits({ maxOpenPositions: 1 }),
        riskState({ openPositionCount: 1 }),
        portfolio(), SystemState.RUNNING, 100,
      );
      expect(review.verdict).toBe(RiskVerdict.DENIED);
      expect(review.denialReasons).toContain(RiskDenialReason.MAX_OPEN_POSITIONS);
    });

    it('should APPROVE EXIT even when max positions reached', () => {
      const review = engine.evaluate(
        decision({ action: TradeAction.EXIT }),
        limits({ maxOpenPositions: 1 }),
        riskState({ openPositionCount: 1 }),
        portfolio(), SystemState.RUNNING, 100,
      );
      // EXIT doesn't check max positions
      expect(review.denialReasons).not.toContain(RiskDenialReason.MAX_OPEN_POSITIONS);
    });
  });

  // ════════════════════════════════════════
  // Trade rate limits
  // ════════════════════════════════════════

  describe('Trades per hour', () => {
    it('should DENY when trade rate exceeded', () => {
      const review = engine.evaluate(
        decision(), limits({ maxTradesPerHour: 4 }),
        riskState({ tradesThisHour: 4 }),
        portfolio(), SystemState.RUNNING, 100,
      );
      expect(review.verdict).toBe(RiskVerdict.DENIED);
      expect(review.denialReasons).toContain(RiskDenialReason.MAX_TRADES_PER_HOUR);
    });
  });

  // ════════════════════════════════════════
  // Consecutive losses & cooldown
  // ════════════════════════════════════════

  describe('Consecutive losses', () => {
    it('should DENY when consecutive losses exceeded', () => {
      const review = engine.evaluate(
        decision(), limits({ maxConsecutiveLosses: 3 }),
        riskState({ consecutiveLosses: 3 }),
        portfolio(), SystemState.RUNNING, 100,
      );
      expect(review.verdict).toBe(RiskVerdict.DENIED);
      expect(review.denialReasons).toContain(RiskDenialReason.CONSECUTIVE_LOSSES);
    });
  });

  describe('Cooldown', () => {
    it('should DENY when cooldown is active', () => {
      const review = engine.evaluate(
        decision(), limits(),
        riskState({ cooldownUntil: Date.now() + 60000 }), // 60s from now
        portfolio(), SystemState.RUNNING, 100,
      );
      expect(review.verdict).toBe(RiskVerdict.DENIED);
      expect(review.denialReasons).toContain(RiskDenialReason.COOLDOWN_ACTIVE);
    });

    it('should APPROVE when cooldown has expired', () => {
      const review = engine.evaluate(
        decision(), limits(),
        riskState({ cooldownUntil: Date.now() - 1000 }), // Expired
        portfolio(), SystemState.RUNNING, 100,
      );
      expect(review.denialReasons).not.toContain(RiskDenialReason.COOLDOWN_ACTIVE);
    });
  });

  // ════════════════════════════════════════
  // Spread / Slippage
  // ════════════════════════════════════════

  describe('Spread check', () => {
    it('should DENY when slippage exceeds max', () => {
      const review = engine.evaluate(
        decision({ max_slippage_bps: 20 }),
        limits({ maxSpreadBps: 15 }),
        riskState(), portfolio(), SystemState.RUNNING, 100,
      );
      expect(review.verdict).toBe(RiskVerdict.DENIED);
      expect(review.denialReasons).toContain(RiskDenialReason.SPREAD_TOO_WIDE);
    });
  });

  // ════════════════════════════════════════
  // Position sizing
  // ════════════════════════════════════════

  describe('Position notional', () => {
    it('should DENY when size exceeds max position', () => {
      const review = engine.evaluate(
        decision({ size_quote: 150 }),
        limits({ maxPositionNotional: 100 }),
        riskState(), portfolio(), SystemState.RUNNING, 100,
      );
      expect(review.verdict).toBe(RiskVerdict.DENIED);
      expect(review.denialReasons).toContain(RiskDenialReason.MAX_POSITION_EXCEEDED);
    });
  });

  describe('Total exposure', () => {
    it('should DENY when total exposure would exceed limit', () => {
      const review = engine.evaluate(
        decision({ size_quote: 80 }),
        limits({ maxTotalExposureNotional: 200 }),
        riskState(),
        portfolio({ totalExposure: 150 }),
        SystemState.RUNNING, 100,
      );
      expect(review.verdict).toBe(RiskVerdict.DENIED);
      expect(review.denialReasons).toContain(RiskDenialReason.MAX_EXPOSURE_EXCEEDED);
    });
  });

  // ════════════════════════════════════════
  // Balance checks
  // ════════════════════════════════════════

  describe('Insufficient balance', () => {
    it('should DENY when balance < order size', () => {
      const review = engine.evaluate(
        decision({ size_quote: 50 }),
        limits(),
        riskState(),
        portfolio({ availableBalance: 30 }),
        SystemState.RUNNING, 100,
      );
      expect(review.verdict).toBe(RiskVerdict.DENIED);
      expect(review.denialReasons).toContain(RiskDenialReason.INSUFFICIENT_BALANCE);
    });
  });

  describe('Min balance threshold', () => {
    it('should DENY when balance below threshold', () => {
      const review = engine.evaluate(
        decision({ size_quote: 5 }),
        limits({ minBalanceThreshold: 10, noTradeWhenBalanceBelowThreshold: true }),
        riskState(),
        portfolio({ availableBalance: 8 }),
        SystemState.RUNNING, 100,
      );
      expect(review.verdict).toBe(RiskVerdict.DENIED);
      expect(review.denialReasons).toContain(RiskDenialReason.BALANCE_BELOW_THRESHOLD);
    });
  });

  // ════════════════════════════════════════
  // Incidents
  // ════════════════════════════════════════

  describe('Active incidents', () => {
    it('should DENY when incidents are active', () => {
      const review = engine.evaluate(
        decision(), limits({ noTradeDuringIncident: true }),
        riskState({ activeIncidentCount: 2 }),
        portfolio(), SystemState.RUNNING, 100,
      );
      expect(review.verdict).toBe(RiskVerdict.DENIED);
      expect(review.denialReasons).toContain(RiskDenialReason.ACTIVE_INCIDENT);
    });

    it('should APPROVE when no active incidents', () => {
      const review = engine.evaluate(
        decision(), limits({ noTradeDuringIncident: true }),
        riskState({ activeIncidentCount: 0 }),
        portfolio(), SystemState.RUNNING, 100,
      );
      expect(review.denialReasons).not.toContain(RiskDenialReason.ACTIVE_INCIDENT);
    });
  });

  // ════════════════════════════════════════
  // Confidence threshold
  // ════════════════════════════════════════

  describe('Min confidence', () => {
    it('should DENY when confidence below threshold', () => {
      const review = engine.evaluate(
        decision({ confidence: 0.3 }),
        limits({ minConfidence: 0.5 }),
        riskState(), portfolio(), SystemState.RUNNING, 100,
      );
      expect(review.verdict).toBe(RiskVerdict.DENIED);
      expect(review.denialReasons).toContain(RiskDenialReason.LOW_CONFIDENCE);
    });
  });

  // ════════════════════════════════════════
  // Pyramiding
  // ════════════════════════════════════════

  describe('Pyramiding', () => {
    it('should DENY BUY when position exists and pyramiding disabled', () => {
      const review = engine.evaluate(
        decision({ action: TradeAction.BUY }),
        limits({ allowPyramiding: false }),
        riskState({ openPositionCount: 1 }),
        portfolio(), SystemState.RUNNING, 100,
      );
      expect(review.verdict).toBe(RiskVerdict.DENIED);
      expect(review.denialReasons).toContain(RiskDenialReason.PYRAMIDING_NOT_ALLOWED);
    });

    it('should APPROVE when pyramiding enabled', () => {
      const review = engine.evaluate(
        decision({ action: TradeAction.BUY }),
        limits({ allowPyramiding: true, maxOpenPositions: 3 }),
        riskState({ openPositionCount: 1 }),
        portfolio(), SystemState.RUNNING, 100,
      );
      expect(review.denialReasons).not.toContain(RiskDenialReason.PYRAMIDING_NOT_ALLOWED);
    });
  });

  // ════════════════════════════════════════
  // Multiple denials
  // ════════════════════════════════════════

  describe('Multiple denial reasons', () => {
    it('should accumulate multiple denial reasons', () => {
      const review = engine.evaluate(
        decision({ confidence: 0.2, size_quote: 500, symbol: 'ETHUSDT', max_slippage_bps: 30 }),
        limits({ maxPositionNotional: 100, allowedSymbols: ['BTCUSDT'], maxSpreadBps: 15, minConfidence: 0.5 }),
        riskState({ dailyPnl: -25 }),
        portfolio({ availableBalance: 50 }),
        SystemState.RUNNING, 100,
      );
      expect(review.verdict).toBe(RiskVerdict.DENIED);
      expect(review.denialReasons.length).toBeGreaterThanOrEqual(4);
      expect(review.denialReasons).toContain(RiskDenialReason.SYMBOL_NOT_ALLOWED);
      expect(review.denialReasons).toContain(RiskDenialReason.MAX_POSITION_EXCEEDED);
      expect(review.denialReasons).toContain(RiskDenialReason.LOW_CONFIDENCE);
      expect(review.denialReasons).toContain(RiskDenialReason.SPREAD_TOO_WIDE);
    });
  });

  // ════════════════════════════════════════
  // Checks performed
  // ════════════════════════════════════════

  describe('Checks metadata', () => {
    it('should include all checks performed in review', () => {
      const review = engine.evaluate(
        decision(), limits(), riskState(), portfolio(), SystemState.RUNNING, 100,
      );
      expect(review.checksPerformed.length).toBeGreaterThanOrEqual(10);
      review.checksPerformed.forEach((check) => {
        expect(check).toHaveProperty('rule');
        expect(check).toHaveProperty('passed');
        expect(check).toHaveProperty('value');
        expect(check).toHaveProperty('threshold');
        expect(check).toHaveProperty('message');
      });
    });
  });

  // ════════════════════════════════════════
  // EXIT action bypasses position/balance checks
  // ════════════════════════════════════════

  describe('EXIT action bypasses position/balance checks', () => {
    it('EXIT with insufficient balance should still APPROVE (balance check bypassed)', () => {
      const review = engine.evaluate(
        decision({ action: TradeAction.EXIT, size_quote: 500 }),
        limits(),
        riskState(),
        portfolio({ availableBalance: 5 }), // Way below size_quote
        SystemState.RUNNING,
        100,
      );
      expect(review.denialReasons).not.toContain(RiskDenialReason.INSUFFICIENT_BALANCE);
      expect(review.denialReasons).not.toContain(RiskDenialReason.BALANCE_BELOW_THRESHOLD);
      expect(review.verdict).toBe(RiskVerdict.APPROVED);
    });

    it('EXIT with max positions exceeded should still APPROVE (position count check bypassed)', () => {
      const review = engine.evaluate(
        decision({ action: TradeAction.EXIT }),
        limits({ maxOpenPositions: 1 }),
        riskState({ openPositionCount: 5 }), // Exceeds max positions
        portfolio(),
        SystemState.RUNNING,
        100,
      );
      expect(review.denialReasons).not.toContain(RiskDenialReason.MAX_OPEN_POSITIONS);
      expect(review.verdict).toBe(RiskVerdict.APPROVED);
    });

    it('EXIT while system is PAUSED should DENY (system state check still applies)', () => {
      const review = engine.evaluate(
        decision({ action: TradeAction.EXIT }),
        limits(),
        riskState(),
        portfolio(),
        SystemState.PAUSED,
        100,
      );
      expect(review.verdict).toBe(RiskVerdict.DENIED);
      expect(review.denialReasons).toContain(RiskDenialReason.SYSTEM_NOT_RUNNING);
    });

    it('EXIT with expired data should DENY (data freshness check still applies)', () => {
      const review = engine.evaluate(
        decision({ action: TradeAction.EXIT }),
        limits({ dataFreshnessMaxMs: 5000 }),
        riskState(),
        portfolio(),
        SystemState.RUNNING,
        10000, // 10s stale — exceeds 5s limit
      );
      expect(review.verdict).toBe(RiskVerdict.DENIED);
      expect(review.denialReasons).toContain(RiskDenialReason.DATA_STALE);
    });
  });

  // ════════════════════════════════════════
  // Happy path
  // ════════════════════════════════════════

  describe('Happy path', () => {
    it('should APPROVE a valid BUY with all checks passing', () => {
      const review = engine.evaluate(
        decision({
          action: TradeAction.BUY,
          symbol: 'BTCUSDT',
          confidence: 0.75,
          size_quote: 50,
          max_slippage_bps: 5,
        }),
        limits(),
        riskState(),
        portfolio({ availableBalance: 10000, totalExposure: 0 }),
        SystemState.RUNNING,
        500,
      );
      expect(review.verdict).toBe(RiskVerdict.APPROVED);
      expect(review.denialReasons).toHaveLength(0);
      expect(review.explanation).toBe('All checks passed');
    });
  });
});
