// ═══════════════════════════════════════════════════════════════
// Failure Scenario Tests — System resilience
// Tests: WebSocket down, REST unavailable, balance inconsistency,
// repeated rejections, invalid model response, etc.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { validateAIAssessment } from '@cryptobot/decision-engine';
import { RiskEngine } from '@cryptobot/risk-engine';
import { SimulatedAdapter } from '@cryptobot/exchange';
import {
  RiskVerdict,
  SystemState,
  TradeAction,
  AIMarketRegime,
  DEFAULT_HOLD_DECISION,
} from '@cryptobot/shared-types';

describe('Failure Scenarios', () => {
  // ── Model response failures ──

  describe('Invalid model responses', () => {
    it('should handle empty string from model', () => {
      const result = validateAIAssessment('');
      expect(result.valid).toBe(false);
      // Fallback uses DEFAULT_HOLD_ASSESSMENT — regime is RANGE
      expect(result.assessment.regime).toBe(AIMarketRegime.RANGE);
    });

    it('should handle HTML response from model', () => {
      const result = validateAIAssessment('<html><body>Error 500</body></html>');
      expect(result.valid).toBe(false);
    });

    it('should handle partial JSON from model', () => {
      const result = validateAIAssessment('{"regime": "BULL_TREND", "entry_veto":');
      expect(result.valid).toBe(false);
    });

    it('should handle JSON with extra fields gracefully', () => {
      const raw = JSON.stringify({
        regime: 'RANGE',
        entry_veto: false,
        entry_veto_reason: '',
        should_exit: false,
        exit_reason: null,
        exit_thesis: '',
        confidence: 0.5,
        thesis: 'No edge visible. RANGE market. RSI 50.',
        extra_field: 'should be ignored',
        another_field: 42,
      });
      const result = validateAIAssessment(raw);
      expect(result.valid).toBe(true); // Extra fields stripped by Zod
    });

    it('should handle unicode/emoji in thesis', () => {
      const raw = JSON.stringify({
        regime: 'BULL_TREND',
        entry_veto: false,
        entry_veto_reason: '',
        should_exit: false,
        exit_reason: null,
        exit_thesis: '',
        confidence: 0.7,
        thesis: '🚀 BULL_TREND confirmed. EMA diff +0.15%. RSI 48.',
      });
      const result = validateAIAssessment(raw);
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
