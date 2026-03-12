// ═══════════════════════════════════════════════════════════════
// Decision Types
// Claude Decision Engine input/output contracts
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';
import { TradeAction, EntryType } from './enums.js';

// ── Decision Context (sent TO Claude) ───────────────────────

/** Computed features/indicators — output of Feature Engine */
export interface ComputedFeatures {
  emaFast: number;
  emaSlow: number;
  rsi: number;
  atr: number;
  volumeRatio: number;       // Current vs 1h average
  spreadBps: number;         // Bid-ask spread in basis points
  bookImbalance: number;     // Bid volume / Ask volume (L5)
  tradeFlowImbalance: number; // Buy volume / Total volume (recent)
  realizedVolatility: number; // Short-term realized vol
  priceChangePercent1m: number;
  priceChangePercent5m: number;
}

/** Current position state (if any) */
export interface CurrentPositionContext {
  hasPosition: boolean;
  side: 'LONG' | 'SHORT' | null;
  entryPrice: number | null;
  quantity: number | null;
  notional: number | null;
  unrealizedPnl: number | null;
  unrealizedPnlPercent: number | null;
  holdingTimeSec: number | null;
}

/** Account/portfolio context */
export interface AccountContext {
  availableBalance: number;
  totalEquity: number;
  dailyPnl: number;
  dailyTradeCount: number;
  consecutiveLosses: number;
  lastTradeResult: 'WIN' | 'LOSS' | null;
}

/** Full context sent to Claude Decision Engine */
export interface DecisionContext {
  symbol: string;
  timestamp: number;
  ticker: {
    bid: number;
    ask: number;
    last: number;
    mid: number;
  };
  features: ComputedFeatures;
  position: CurrentPositionContext;
  account: AccountContext;
  /** Strategy parameters for context */
  strategyHints: {
    takeProfitBps: number;
    stopLossBps: number;
    timeoutSec: number;
  };
}

// ── Model Decision (received FROM Claude) ───────────────────

/**
 * Zod schema for validating Claude's structured output.
 * This is THE contract between the AI and the system.
 * Any response that doesn't match is treated as HOLD.
 */
export const ModelDecisionSchema = z.object({
  action: z.nativeEnum(TradeAction),
  symbol: z.string().max(20),
  confidence: z.number().min(0).max(1),
  entry_type: z.nativeEnum(EntryType),
  entry_price: z.number().nonnegative(),
  size_quote: z.number().nonnegative(),
  stop_price: z.number().nonnegative(),
  take_profit_price: z.number().nonnegative(),
  max_slippage_bps: z.number().int().min(0).max(100),
  time_horizon_sec: z.number().int().min(0).max(3600),
  thesis: z.string().min(1).max(500),
  invalidate_if: z.array(z.string().max(200)).max(5),
});

export type ModelDecision = z.infer<typeof ModelDecisionSchema>;

/** Default HOLD decision — used as fallback */
export const DEFAULT_HOLD_DECISION: ModelDecision = {
  action: TradeAction.HOLD,
  symbol: '',
  confidence: 0,
  entry_type: EntryType.LIMIT,
  entry_price: 0,
  size_quote: 0,
  stop_price: 0,
  take_profit_price: 0,
  max_slippage_bps: 0,
  time_horizon_sec: 0,
  thesis: 'No action — default fallback',
  invalidate_if: [],
};

/** Stored decision record with metadata */
export interface ModelDecisionRecord {
  id: string;
  requestId: string;
  symbol: string;
  decision: ModelDecision;
  /** Summarized input context (for audit, not full snapshot) */
  inputSummary: Record<string, unknown>;
  /** Raw model response text (for debugging) */
  rawResponse: string;
  /** Whether the response was valid per schema */
  isValid: boolean;
  /** Was this a fallback HOLD? */
  isFallback: boolean;
  /** Reason for fallback if applicable */
  fallbackReason: string | null;
  /** Claude API latency in ms */
  latencyMs: number;
  /** Claude model used */
  model: string;
  /** Tokens used */
  inputTokens: number;
  outputTokens: number;
  createdAt: Date;
}
