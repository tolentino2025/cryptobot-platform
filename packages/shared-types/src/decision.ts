// ═══════════════════════════════════════════════════════════════
// Decision Types
// Claude Decision Engine input/output contracts
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';
import { TradeAction, EntryType, AIMarketRegime, ExitReason } from './enums.js';

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

export interface MarketIntelligenceReport {
  sentiment: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
  volatilityClassification: 'CALM' | 'ELEVATED' | 'EXTREME';
  liquidityState: 'HEALTHY' | 'THIN' | 'STRESSED';
  macroBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  summary: string;
}

export interface TechnicalAnalysisReport {
  trendDirection: 'UP' | 'DOWN' | 'SIDEWAYS';
  momentumState: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
  setupQuality: 'HIGH' | 'MEDIUM' | 'LOW';
  keyLevels: {
    support: number;
    resistance: number;
  };
  summary: string;
}

export interface PhaseAReports {
  marketIntelligence: MarketIntelligenceReport;
  technicalAnalysis: TechnicalAnalysisReport;
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
    rsiOversold: number;
    rsiOverbought: number;
    minVolumeRatio: number;
    minBookImbalance: number;
  };
  phaseA?: PhaseAReports;
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
  /** Specific exit reason — set for EXIT actions from the AI assessment layer */
  exit_reason: z.nativeEnum(ExitReason).nullable().optional(),
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

// ── AI Assessment (received FROM Claude — new architecture) ─────────
//
// Claude's role is now:
//   1. Classify the current market regime
//   2. Veto entry if the regime does not support it
//   3. Signal exit + reason when position should close
//
// BUY entries are determined exclusively by DeterministicEntryEngine.
// Claude NEVER opens trades autonomously.
//

/**
 * Zod schema for validating Claude's AI market assessment output.
 */
export const AIAssessmentSchema = z.object({
  /** Current market regime classified by the AI */
  regime: z.nativeEnum(AIMarketRegime),
  /** If true, blocks any deterministic entry this cycle */
  entry_veto: z.boolean(),
  /** Human-readable reason when entry is vetoed */
  entry_veto_reason: z.string().max(300),
  /** If true, AI recommends closing the current position */
  should_exit: z.boolean(),
  /** The specific reason for the exit signal (null if should_exit is false) */
  exit_reason: z.nativeEnum(ExitReason).nullable(),
  /** Detailed thesis for the exit signal */
  exit_thesis: z.string().max(300),
  /** Assessment confidence [0, 1] */
  confidence: z.number().min(0).max(1),
  /** One-line explanation of the current market state */
  thesis: z.string().min(1).max(500),
});

export type AIAssessment = z.infer<typeof AIAssessmentSchema>;

/** Default assessment — all-hold fallback used when AI call fails */
export const DEFAULT_HOLD_ASSESSMENT: AIAssessment = {
  regime: AIMarketRegime.RANGE,
  entry_veto: true,
  entry_veto_reason: 'Default fallback — no actionable signal',
  should_exit: false,
  exit_reason: null,
  exit_thesis: '',
  confidence: 0,
  thesis: 'Default fallback — no actionable signal',
};

/** Stored AI assessment record with metadata */
export interface AIAssessmentRecord {
  id: string;
  requestId: string;
  symbol: string;
  assessment: AIAssessment;
  inputSummary: Record<string, unknown>;
  rawResponse: string;
  isValid: boolean;
  isFallback: boolean;
  fallbackReason: string | null;
  latencyMs: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  createdAt: Date;
}

// ─────────────────────────────────────────────────────────────────────

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
