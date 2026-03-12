// ═══════════════════════════════════════════════════════════════
// RiskEngine — Sovereign authority over all trading decisions
// Validates, adjusts, or denies every proposed trade
// Full rule implementations: ETAPA 3
// ═══════════════════════════════════════════════════════════════

import { createLogger, generateRequestId } from '@cryptobot/core';
import {
  RiskVerdict,
  RiskDenialReason,
  TradeAction,
  type ModelDecision,
  type RiskReview,
  type RiskCheck,
  type RiskLimits,
  type RiskState,
  type PortfolioSummary,
  SystemState,
  NON_TRADING_STATES,
} from '@cryptobot/shared-types';

const logger = createLogger('risk-engine');

export class RiskEngine {
  /**
   * Evaluate a proposed decision against all risk rules.
   * This is the FINAL authority — if denied here, the trade does not execute.
   */
  evaluate(
    decision: ModelDecision,
    limits: RiskLimits,
    riskState: RiskState,
    portfolio: PortfolioSummary,
    systemState: SystemState,
    dataFreshnessMs: number,
  ): RiskReview {
    const checks: RiskCheck[] = [];
    const denialReasons: RiskDenialReason[] = [];

    // If action is HOLD, no checks needed — just approve
    if (decision.action === TradeAction.HOLD) {
      return this.createReview(decision, RiskVerdict.APPROVED, [], checks, 'HOLD — no action required');
    }

    // ── Rule 1: System must be RUNNING ──
    this.checkRule(checks, denialReasons, {
      rule: 'system_state',
      passed: !NON_TRADING_STATES.has(systemState),
      value: systemState,
      threshold: 'RUNNING',
      message: `System state is ${systemState}, must be RUNNING`,
      denial: RiskDenialReason.SYSTEM_NOT_RUNNING,
    });

    // ── Rule 2: Symbol must be allowed ──
    this.checkRule(checks, denialReasons, {
      rule: 'allowed_symbols',
      passed: limits.allowedSymbols.includes(decision.symbol),
      value: decision.symbol,
      threshold: limits.allowedSymbols.join(','),
      message: `Symbol ${decision.symbol} not in whitelist`,
      denial: RiskDenialReason.SYMBOL_NOT_ALLOWED,
    });

    // ── Rule 3: Data freshness ──
    this.checkRule(checks, denialReasons, {
      rule: 'data_freshness',
      passed: dataFreshnessMs <= limits.dataFreshnessMaxMs,
      value: dataFreshnessMs,
      threshold: limits.dataFreshnessMaxMs,
      message: `Data age ${dataFreshnessMs}ms exceeds max ${limits.dataFreshnessMaxMs}ms`,
      denial: RiskDenialReason.DATA_STALE,
    });

    // ── Rule 4: Daily loss limit ──
    this.checkRule(checks, denialReasons, {
      rule: 'daily_loss',
      passed: Math.abs(riskState.dailyPnl) < limits.maxDailyLoss || riskState.dailyPnl >= 0,
      value: riskState.dailyPnl,
      threshold: -limits.maxDailyLoss,
      message: `Daily loss ${riskState.dailyPnl} exceeds limit ${limits.maxDailyLoss}`,
      denial: RiskDenialReason.DAILY_LOSS_EXCEEDED,
    });

    // ── Rule 5: Weekly loss limit ──
    this.checkRule(checks, denialReasons, {
      rule: 'weekly_loss',
      passed: Math.abs(riskState.weeklyPnl) < limits.maxWeeklyLoss || riskState.weeklyPnl >= 0,
      value: riskState.weeklyPnl,
      threshold: -limits.maxWeeklyLoss,
      message: `Weekly loss ${riskState.weeklyPnl} exceeds limit ${limits.maxWeeklyLoss}`,
      denial: RiskDenialReason.WEEKLY_LOSS_EXCEEDED,
    });

    // ── Rule 6: Max open positions ──
    if (decision.action === TradeAction.BUY || decision.action === TradeAction.SELL) {
      this.checkRule(checks, denialReasons, {
        rule: 'max_open_positions',
        passed: riskState.openPositionCount < limits.maxOpenPositions,
        value: riskState.openPositionCount,
        threshold: limits.maxOpenPositions,
        message: `Open positions ${riskState.openPositionCount} >= max ${limits.maxOpenPositions}`,
        denial: RiskDenialReason.MAX_OPEN_POSITIONS,
      });
    }

    // ── Rule 7: Trades per hour ──
    this.checkRule(checks, denialReasons, {
      rule: 'trades_per_hour',
      passed: riskState.tradesThisHour < limits.maxTradesPerHour,
      value: riskState.tradesThisHour,
      threshold: limits.maxTradesPerHour,
      message: `Trades this hour ${riskState.tradesThisHour} >= max ${limits.maxTradesPerHour}`,
      denial: RiskDenialReason.MAX_TRADES_PER_HOUR,
    });

    // ── Rule 8: Consecutive losses ──
    this.checkRule(checks, denialReasons, {
      rule: 'consecutive_losses',
      passed: riskState.consecutiveLosses < limits.maxConsecutiveLosses,
      value: riskState.consecutiveLosses,
      threshold: limits.maxConsecutiveLosses,
      message: `Consecutive losses ${riskState.consecutiveLosses} >= max ${limits.maxConsecutiveLosses}`,
      denial: RiskDenialReason.CONSECUTIVE_LOSSES,
    });

    // ── Rule 9: Cooldown ──
    const now = Date.now();
    const cooldownActive = riskState.cooldownUntil != null && now < riskState.cooldownUntil;
    this.checkRule(checks, denialReasons, {
      rule: 'cooldown',
      passed: !cooldownActive,
      value: cooldownActive,
      threshold: false,
      message: 'Cooldown period is active',
      denial: RiskDenialReason.COOLDOWN_ACTIVE,
    });

    // ── Rule 10: Max spread ──
    this.checkRule(checks, denialReasons, {
      rule: 'max_spread',
      passed: decision.max_slippage_bps <= limits.maxSpreadBps,
      value: decision.max_slippage_bps,
      threshold: limits.maxSpreadBps,
      message: `Slippage ${decision.max_slippage_bps}bps exceeds max ${limits.maxSpreadBps}bps`,
      denial: RiskDenialReason.SPREAD_TOO_WIDE,
    });

    // EXIT decisions skip position-count, notional, exposure, and balance checks —
    // you must always be able to exit an open position
    if (decision.action !== TradeAction.EXIT) {
      // ── Rule 11: Position notional ──
      if (decision.size_quote > 0) {
        this.checkRule(checks, denialReasons, {
          rule: 'max_position_notional',
          passed: decision.size_quote <= limits.maxPositionNotional,
          value: decision.size_quote,
          threshold: limits.maxPositionNotional,
          message: `Size ${decision.size_quote} exceeds max position ${limits.maxPositionNotional}`,
          denial: RiskDenialReason.MAX_POSITION_EXCEEDED,
        });
      }

      // ── Rule 12: Total exposure ──
      const newExposure = portfolio.totalExposure + decision.size_quote;
      this.checkRule(checks, denialReasons, {
        rule: 'max_total_exposure',
        passed: newExposure <= limits.maxTotalExposureNotional,
        value: newExposure,
        threshold: limits.maxTotalExposureNotional,
        message: `Total exposure ${newExposure} exceeds max ${limits.maxTotalExposureNotional}`,
        denial: RiskDenialReason.MAX_EXPOSURE_EXCEEDED,
      });

      // ── Rule 13: Sufficient balance ──
      this.checkRule(checks, denialReasons, {
        rule: 'sufficient_balance',
        passed: portfolio.availableBalance >= decision.size_quote,
        value: portfolio.availableBalance,
        threshold: decision.size_quote,
        message: `Available balance ${portfolio.availableBalance} < required ${decision.size_quote}`,
        denial: RiskDenialReason.INSUFFICIENT_BALANCE,
      });

      // ── Rule 14: Min balance threshold ──
      if (limits.noTradeWhenBalanceBelowThreshold) {
        this.checkRule(checks, denialReasons, {
          rule: 'min_balance',
          passed: portfolio.availableBalance >= limits.minBalanceThreshold,
          value: portfolio.availableBalance,
          threshold: limits.minBalanceThreshold,
          message: `Balance ${portfolio.availableBalance} below threshold ${limits.minBalanceThreshold}`,
          denial: RiskDenialReason.BALANCE_BELOW_THRESHOLD,
        });
      }
    }

    // ── Rule 15: Active incidents ──
    if (limits.noTradeDuringIncident) {
      this.checkRule(checks, denialReasons, {
        rule: 'active_incidents',
        passed: riskState.activeIncidentCount === 0,
        value: riskState.activeIncidentCount,
        threshold: 0,
        message: `${riskState.activeIncidentCount} active incidents`,
        denial: RiskDenialReason.ACTIVE_INCIDENT,
      });
    }

    // ── Rule 16: Confidence threshold ──
    this.checkRule(checks, denialReasons, {
      rule: 'min_confidence',
      passed: decision.confidence >= limits.minConfidence,
      value: decision.confidence,
      threshold: limits.minConfidence,
      message: `Confidence ${decision.confidence} below minimum ${limits.minConfidence}`,
      denial: RiskDenialReason.LOW_CONFIDENCE,
    });

    // ── Rule 17: Pyramiding ──
    if (!limits.allowPyramiding && riskState.openPositionCount > 0) {
      if (decision.action === TradeAction.BUY || decision.action === TradeAction.SELL) {
        this.checkRule(checks, denialReasons, {
          rule: 'no_pyramiding',
          passed: false,
          value: riskState.openPositionCount,
          threshold: 0,
          message: 'Position already open and pyramiding is disabled',
          denial: RiskDenialReason.PYRAMIDING_NOT_ALLOWED,
        });
      }
    }

    // ── Verdict ──
    const verdict = denialReasons.length > 0 ? RiskVerdict.DENIED : RiskVerdict.APPROVED;
    const explanation = denialReasons.length > 0
      ? `Denied: ${denialReasons.join(', ')}`
      : 'All checks passed';

    const passedCount = checks.filter((c) => c.passed).length;
    const failedRules = checks.filter((c) => !c.passed).map((c) => `${c.rule}:${c.value}`);

    if (verdict === RiskVerdict.APPROVED) {
      logger.info(
        { verdict, action: decision.action, symbol: decision.symbol, passedChecks: passedCount },
        `Risk APPROVED — ${passedCount} checks passed`,
      );
    } else {
      logger.info(
        { verdict, action: decision.action, symbol: decision.symbol, denialReasons, failedRules },
        `Risk DENIED — ${denialReasons.join(' | ')}`,
      );
    }

    return this.createReview(decision, verdict, denialReasons, checks, explanation);
  }

  private checkRule(
    checks: RiskCheck[],
    denials: RiskDenialReason[],
    params: {
      rule: string;
      passed: boolean;
      value: number | string | boolean;
      threshold: number | string | boolean;
      message: string;
      denial: RiskDenialReason;
    },
  ): void {
    checks.push({
      rule: params.rule,
      passed: params.passed,
      value: params.value,
      threshold: params.threshold,
      message: params.message,
    });
    if (!params.passed) {
      denials.push(params.denial);
    }
  }

  private createReview(
    _decision: ModelDecision,
    verdict: RiskVerdict,
    denialReasons: RiskDenialReason[],
    checks: RiskCheck[],
    explanation: string,
  ): RiskReview {
    return {
      id: generateRequestId(),
      decisionId: '',  // Will be set by caller
      requestId: '',   // Will be set by caller
      verdict,
      denialReasons,
      adjustedParams: null,
      explanation,
      checksPerformed: checks,
      createdAt: new Date(),
    };
  }
}
