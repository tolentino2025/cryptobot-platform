// ═══════════════════════════════════════════════════════════════
// Risk Types
// Risk Engine configuration, review, and limit types
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';
import { RiskVerdict, RiskDenialReason } from './enums.js';
import type { ModelDecision } from './decision.js';

/** Risk limits configuration — all mandatory parameters */
export interface RiskLimits {
  // ── Position & Exposure ──
  maxPositionNotional: number;       // Max single position in quote currency
  maxTotalExposureNotional: number;  // Max total exposure across all positions
  maxOpenPositions: number;

  // ── Loss Limits ──
  maxDailyLoss: number;              // Max daily loss in quote currency
  maxWeeklyLoss: number;             // Max weekly loss in quote currency

  // ── Rate Limits ──
  maxTradesPerHour: number;
  maxConsecutiveLosses: number;
  cooldownAfterLossMinutes: number;

  // ── Market Quality ──
  maxSpreadBps: number;              // Max spread in basis points
  maxSlippageBps: number;            // Max allowed slippage in bps

  // ── Whitelist & Sessions ──
  allowedSymbols: string[];
  allowedSessions: string[];         // e.g., ["*"] for 24/7, or time ranges

  // ── Data Quality ──
  dataFreshnessMaxMs: number;        // Max age of market data in ms
  maxOrderRetries: number;

  // ── Kill Conditions ──
  killOnExchangeDesync: boolean;
  killOnMarketDataGap: boolean;
  killOnUnexpectedPosition: boolean;
  killOnRepeatedRejections: boolean;

  // ── Safety ──
  noTradeDuringIncident: boolean;
  noTradeWhenBalanceBelowThreshold: boolean;
  minBalanceThreshold: number;

  // ── Confidence ──
  minConfidence: number;             // Minimum model confidence to consider

  // ── Pyramiding ──
  allowPyramiding: boolean;
}

/** Zod schema for risk limits validation */
export const RiskLimitsSchema = z.object({
  maxPositionNotional: z.number().positive(),
  maxTotalExposureNotional: z.number().positive(),
  maxOpenPositions: z.number().int().positive(),
  maxDailyLoss: z.number().positive(),
  maxWeeklyLoss: z.number().positive(),
  maxTradesPerHour: z.number().int().positive(),
  maxConsecutiveLosses: z.number().int().positive(),
  cooldownAfterLossMinutes: z.number().int().nonnegative(),
  maxSpreadBps: z.number().positive(),
  maxSlippageBps: z.number().positive(),
  allowedSymbols: z.array(z.string().min(1)).min(1),
  allowedSessions: z.array(z.string()).min(1),
  dataFreshnessMaxMs: z.number().int().positive(),
  maxOrderRetries: z.number().int().nonnegative(),
  killOnExchangeDesync: z.boolean(),
  killOnMarketDataGap: z.boolean(),
  killOnUnexpectedPosition: z.boolean(),
  killOnRepeatedRejections: z.boolean(),
  noTradeDuringIncident: z.boolean(),
  noTradeWhenBalanceBelowThreshold: z.boolean(),
  minBalanceThreshold: z.number().nonnegative(),
  minConfidence: z.number().min(0).max(1),
  allowPyramiding: z.boolean(),
});

/** Result of risk evaluation */
export interface RiskReview {
  id: string;
  decisionId: string;
  requestId: string;
  verdict: RiskVerdict;
  denialReasons: RiskDenialReason[];
  /** If ADJUSTED, the adjusted decision parameters */
  adjustedParams: Partial<ModelDecision> | null;
  /** Human-readable explanation */
  explanation: string;
  /** All checks performed with pass/fail */
  checksPerformed: RiskCheck[];
  createdAt: Date;
}

/** Individual risk check result */
export interface RiskCheck {
  rule: string;
  passed: boolean;
  value: number | string | boolean;
  threshold: number | string | boolean;
  message: string;
}

/** Risk state — ephemeral counters maintained in Redis */
export interface RiskState {
  dailyPnl: number;
  weeklyPnl: number;
  tradesThisHour: number;
  consecutiveLosses: number;
  cooldownUntil: number | null;  // Unix timestamp
  lastTradeTimestamp: number | null;
  openPositionCount: number;
  totalExposure: number;
  activeIncidentCount: number;
  recentRejectionCount: number;
}
