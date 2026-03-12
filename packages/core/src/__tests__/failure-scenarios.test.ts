// ═══════════════════════════════════════════════════════════════
// Failure Scenario Tests — System resilience
// Tests: WebSocket down, REST unavailable, balance inconsistency,
// repeated rejections, invalid model response, etc.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { validateModelResponse } from '@cryptobot/decision-engine';
import { RiskEngine } from '@cryptobot/risk-engine';
import { SimulatedAdapter } from '@cryptobot/exchange';
import {
  RiskVerdict,
  SystemState,
  TradeAction,
  DEFAULT_HOLD_DECISION,
} from '@cryptobot/shared-types';

const ALLOWED = ['BTCUSDT'];

describe('Failure Scenarios', () => {
  // ── Model response failures ──

  describe('Invalid model responses', () => {
    it('should handle empty string from model', () => {
      const result = validateModelResponse('', ALLOWED);
      expect(result.valid).toBe(false);
      expect(result.decision.action).toBe(TradeAction.HOLD);
    });

    it('should handle HTML response from model', () => {
      const result = validateModelResponse('<html><body>Error 500</body></html>', ALLOWED);
      expect(result.valid).toBe(false);
    });

    it('should handle partial JSON from model', () => {
      const result = validateModelResponse('{"action": "BUY", "symbol":', ALLOWED);
      expect(result.valid).toBe(false);
    });

    it('should handle JSON with extra fields gracefully', () => {
      const raw = JSON.stringify({
        action: 'HOLD', symbol: '', confidence: 0, entry_type: 'LIMIT',
        entry_price: 0, size_quote: 0, stop_price: 0, take_profit_price: 0,
        max_slippage_bps: 0, time_horizon_sec: 0,
        thesis: 'No edge', invalidate_if: [],
        extra_field: 'should be ignored',
        another_field: 42,
      });
      const result = validateModelResponse(raw, ALLOWED);
      expect(result.valid).toBe(true); // Extra fields stripped by Zod
    });

    it('should handle unicode/emoji in thesis', () => {
      const raw = JSON.stringify({
        action: 'HOLD', symbol: '', confidence: 0, entry_type: 'LIMIT',
        entry_price: 0, size_quote: 0, stop_price: 0, take_profit_price: 0,
        max_slippage_bps: 0, time_horizon_sec: 0,
        thesis: '🚀 MOON! 📈💎🙌', invalidate_if: [],
      });
      const result = validateModelResponse(raw, ALLOWED);
      expect(result.valid).toBe(true);
    });
  });

  // ── Exchange adapter failures ──

  describe('Simulated adapter edge cases', () => {
    it('should report unhealthy when disconnected', async () => {
      const adapter = new SimulatedAdapter();
      expect(await adapter.isHealthy()).toBe(false);
    });

    it('should report healthy after connect', async () => {
      const adapter = new SimulatedAdapter();
      await adapter.connect();
      expect(await adapter.isHealthy()).toBe(true);
      await adapter.disconnect();
    });

    it('should handle cancel of non-existent order', async () => {
      const adapter = new SimulatedAdapter();
      await adapter.connect();
      const result = await adapter.cancelOrder('BTCUSDT', 'non_existent');
      expect(result.success).toBe(true); // Sim is lenient
    });

    it('should return empty for non-existent order status', async () => {
      const adapter = new SimulatedAdapter();
      await adapter.connect();
      const result = await adapter.getOrderStatus('BTCUSDT', 'non_existent');
      expect(result.success).toBe(false);
    });
  });

  // ── Risk engine under stress ──

  describe('Risk engine edge cases', () => {
    const engine = new RiskEngine();

    it('should handle zero-size order', () => {
      const review = engine.evaluate(
        { ...DEFAULT_HOLD_DECISION, action: TradeAction.BUY, symbol: 'BTCUSDT', confidence: 0.7, size_quote: 0 },
        {
          maxPositionNotional: 100, maxTotalExposureNotional: 200, maxOpenPositions: 1,
          maxDailyLoss: 20, maxWeeklyLoss: 50, maxTradesPerHour: 4,
          maxConsecutiveLosses: 3, cooldownAfterLossMinutes: 30, maxSpreadBps: 15,
          maxSlippageBps: 10, allowedSymbols: ['BTCUSDT'], allowedSessions: ['*'],
          dataFreshnessMaxMs: 5000, maxOrderRetries: 2,
          killOnExchangeDesync: true, killOnMarketDataGap: true,
          killOnUnexpectedPosition: true, killOnRepeatedRejections: true,
          noTradeDuringIncident: true, noTradeWhenBalanceBelowThreshold: true,
          minBalanceThreshold: 10, minConfidence: 0.5, allowPyramiding: false,
        },
        {
          dailyPnl: 0, weeklyPnl: 0, tradesThisHour: 0, consecutiveLosses: 0,
          cooldownUntil: null, lastTradeTimestamp: null, openPositionCount: 0,
          totalExposure: 0, activeIncidentCount: 0, recentRejectionCount: 0,
        },
        {
          totalEquity: 10000, availableBalance: 10000, lockedBalance: 0,
          totalExposure: 0, exposurePercent: 0, openPositions: [],
          dailyPnl: 0, dailyPnlPercent: 0, weeklyPnl: 0,
          totalRealizedPnl: 0, dailyTradeCount: 0, consecutiveLosses: 0,
          updatedAt: new Date(),
        },
        SystemState.RUNNING,
        100,
      );
      // Zero size should pass position check (0 <= 100)
      expect(review.verdict).toBe(RiskVerdict.APPROVED);
    });

    it('should deny everything when system is in SAFE_MODE', () => {
      const review = engine.evaluate(
        { ...DEFAULT_HOLD_DECISION, action: TradeAction.BUY, symbol: 'BTCUSDT', confidence: 0.99, size_quote: 10 },
        {
          maxPositionNotional: 1000, maxTotalExposureNotional: 5000, maxOpenPositions: 10,
          maxDailyLoss: 10000, maxWeeklyLoss: 50000, maxTradesPerHour: 100,
          maxConsecutiveLosses: 100, cooldownAfterLossMinutes: 0, maxSpreadBps: 1000,
          maxSlippageBps: 1000, allowedSymbols: ['BTCUSDT'], allowedSessions: ['*'],
          dataFreshnessMaxMs: 999999, maxOrderRetries: 100,
          killOnExchangeDesync: false, killOnMarketDataGap: false,
          killOnUnexpectedPosition: false, killOnRepeatedRejections: false,
          noTradeDuringIncident: false, noTradeWhenBalanceBelowThreshold: false,
          minBalanceThreshold: 0, minConfidence: 0, allowPyramiding: true,
        },
        {
          dailyPnl: 0, weeklyPnl: 0, tradesThisHour: 0, consecutiveLosses: 0,
          cooldownUntil: null, lastTradeTimestamp: null, openPositionCount: 0,
          totalExposure: 0, activeIncidentCount: 0, recentRejectionCount: 0,
        },
        {
          totalEquity: 100000, availableBalance: 100000, lockedBalance: 0,
          totalExposure: 0, exposurePercent: 0, openPositions: [],
          dailyPnl: 0, dailyPnlPercent: 0, weeklyPnl: 0,
          totalRealizedPnl: 0, dailyTradeCount: 0, consecutiveLosses: 0,
          updatedAt: new Date(),
        },
        SystemState.SAFE_MODE, // Even with ultra-permissive limits
        0,
      );
      expect(review.verdict).toBe(RiskVerdict.DENIED);
      expect(review.denialReasons).toContain('SYSTEM_NOT_RUNNING');
    });
  });
});
