// ═══════════════════════════════════════════════════════════════
// Prompt Builder — Constructs the controlled prompt for Claude
//
// NEW ARCHITECTURE (v2):
//   Claude's role is ANALYST only, not executor:
//     1. Classify market regime
//     2. Veto entries when conditions are unsuitable
//     3. Signal exits with a specific reason
//
//   Entries are 100% deterministic (DeterministicEntryEngine).
//   Claude NEVER opens trades autonomously.
// ═══════════════════════════════════════════════════════════════

import type { DecisionContext } from '@cryptobot/shared-types';

/** System prompt — analytical role only, no BUY authority */
export const SYSTEM_PROMPT = `You are a market regime analyst for a BTC/USDT spot trading system.

YOUR ROLE (read carefully — this is non-negotiable):
- You DO NOT open trades. A separate deterministic rule engine handles entries.
- You classify the current market regime.
- You may VETO an entry if the regime does not support it (entry_veto: true).
- You may signal EXIT if a held position should close (should_exit: true).
- When uncertain, do NOT veto and do NOT exit — let the deterministic rules decide.
- Prefer the numeric thresholds provided under strategy_hints when they are present.

REGIME CLASSIFICATION (choose exactly one):
- BULL_TREND:    ema_fast > ema_slow by >0.1%, RSI trending up, sustained price momentum
- BEAR_TREND:    ema_fast < ema_slow by >0.1%, RSI falling, negative price momentum
- RANGE:         ema_diff_pct between -0.1% and +0.1%, RSI between 40-60, no clear direction
- VOLATILE:      price_change_5m absolute > 0.5% OR volatility_1m > 0.003, erratic movement
- LOW_LIQUIDITY: volume_ratio < 0.35 OR spread_bps > 5, thin market

ENTRY VETO RULES — set entry_veto: true ONLY if:
- Regime is BEAR_TREND, VOLATILE, or LOW_LIQUIDITY
- RSI > 70 (overbought — dangerous entry)
- RSI < strategy_hints.rsi_oversold (knife catching)
- price_change_5m < -0.25% (momentum collapsing)
- book_imbalance < 0.2 (heavy ask pressure)
- Regime is RANGE but RSI > 65 (range top)
Default: entry_veto: false (let deterministic engine decide)

EXIT SIGNAL RULES — set should_exit: true if a position is LONG and any of:
1. RSI > 72 → exit_reason: TAKE_PROFIT
2. ema_fast < ema_slow (bearish cross while long) → exit_reason: REGIME_EXIT
3. price_change_5m < -0.2% while LONG → exit_reason: VOLATILITY_EXIT
4. Regime is VOLATILE while LONG → exit_reason: VOLATILITY_EXIT
5. Regime is BEAR_TREND while LONG → exit_reason: REGIME_EXIT
6. holding_time_sec > 80% of timeout_sec → exit_reason: TIME_EXIT
7. unrealized_pnl_pct < -0.35% (stop-loss threshold) → exit_reason: STOP_LOSS
If no position, should_exit must always be false.

EXIT REASON VALUES (use exact string):
STOP_LOSS | TAKE_PROFIT | TIME_EXIT | VOLATILITY_EXIT | REGIME_EXIT | EMERGENCY_EXIT

CONFIDENCE:
- 0.8-1.0: Multiple confirming signals, high conviction
- 0.6-0.8: Clear signal with minor uncertainty
- 0.4-0.6: Moderate — mixed signals but dominant regime is clear
- 0.0-0.4: Uncertain — use when defaulting to no-action

RESPONSE FORMAT:
Respond ONLY with valid JSON. No markdown. No text before or after.

{
  "regime": "BULL_TREND | BEAR_TREND | RANGE | VOLATILE | LOW_LIQUIDITY",
  "entry_veto": true | false,
  "entry_veto_reason": "why vetoed, or empty string if not vetoed",
  "should_exit": true | false,
  "exit_reason": "STOP_LOSS | TAKE_PROFIT | TIME_EXIT | VOLATILITY_EXIT | REGIME_EXIT | EMERGENCY_EXIT | null",
  "exit_thesis": "specific exit trigger description, or empty string if not exiting",
  "confidence": 0.0 to 1.0,
  "thesis": "concise 1-sentence regime summary with key values (max 200 chars)"
}

Important rules:
- Treat strategy_hints as the source of truth for RSI, volume, and book thresholds.
- Do not invent stricter RSI/range-top limits than strategy_hints.
- If should_exit is false, exit_reason MUST be null and exit_thesis MUST be empty string.
- If should_exit is true but there is no position (has_position: false), set should_exit: false.
- thesis must always mention: regime, ema_diff_pct, RSI value.`;

/** Build the user message with decision context */
export function buildUserMessage(ctx: DecisionContext): string {
  const f = ctx.features;
  const emaDiff = f.emaFast - f.emaSlow;
  const emaDiffPct = f.emaSlow > 0 ? (emaDiff / f.emaSlow) * 100 : 0;
  const lowLiquidityVolumeThreshold = ctx.strategyHints.minVolumeRatio;
  const bullTrendThresholdPct = 0.05;
  const volatileMoveThresholdPct = 0.5;

  // Pre-classify regime hint for Claude (it should agree or override with reasoning)
  let regimeHint: string;
  if (f.volumeRatio < lowLiquidityVolumeThreshold || f.spreadBps > 5) {
    regimeHint = 'LOW_LIQUIDITY';
  } else if (Math.abs(f.priceChangePercent5m) > volatileMoveThresholdPct || f.realizedVolatility > 0.003) {
    regimeHint = 'VOLATILE';
  } else if (Math.abs(emaDiffPct) < bullTrendThresholdPct) {
    regimeHint = 'RANGE';
  } else if (emaDiff > 0) {
    regimeHint = 'BULL_TREND';
  } else {
    regimeHint = 'BEAR_TREND';
  }

  return JSON.stringify({
    symbol: ctx.symbol,
    timestamp: new Date(ctx.timestamp).toISOString(),
    regime_hint: regimeHint,
    ticker: {
      bid: round(ctx.ticker.bid, 2),
      ask: round(ctx.ticker.ask, 2),
      last: round(ctx.ticker.last, 2),
      mid: round(ctx.ticker.mid, 2),
    },
    features: {
      ema_fast: round(f.emaFast, 2),
      ema_slow: round(f.emaSlow, 2),
      ema_diff_pct: round(emaDiffPct, 4),
      rsi: round(f.rsi, 1),
      atr: round(f.atr, 2),
      volume_ratio: round(f.volumeRatio, 2),
      spread_bps: round(f.spreadBps, 2),
      book_imbalance: round(f.bookImbalance, 3),
      trade_flow_imbalance: round(f.tradeFlowImbalance, 3),
      volatility_1m: round(f.realizedVolatility, 5),
      price_change_1m_pct: round(f.priceChangePercent1m, 4),
      price_change_5m_pct: round(f.priceChangePercent5m, 4),
    },
    position: ctx.position.hasPosition ? {
      has_position: true,
      side: ctx.position.side,
      entry_price: round(ctx.position.entryPrice ?? 0, 2),
      unrealized_pnl_pct: ctx.position.unrealizedPnlPercent != null
        ? round(ctx.position.unrealizedPnlPercent, 4)
        : null,
      holding_time_sec: ctx.position.holdingTimeSec,
    } : { has_position: false },
    account: {
      available_balance: round(ctx.account.availableBalance, 2),
      daily_pnl: round(ctx.account.dailyPnl, 2),
      daily_trades: ctx.account.dailyTradeCount,
      consecutive_losses: ctx.account.consecutiveLosses,
    },
    strategy_hints: {
      take_profit_bps: ctx.strategyHints.takeProfitBps,
      stop_loss_bps: ctx.strategyHints.stopLossBps,
      timeout_sec: ctx.strategyHints.timeoutSec,
      rsi_oversold: ctx.strategyHints.rsiOversold,
      rsi_overbought: ctx.strategyHints.rsiOverbought,
      min_volume_ratio: ctx.strategyHints.minVolumeRatio,
      min_book_imbalance: ctx.strategyHints.minBookImbalance,
    },
    phase_a: ctx.phaseA ? {
      market_intelligence: {
        sentiment: ctx.phaseA.marketIntelligence.sentiment,
        volatility_classification: ctx.phaseA.marketIntelligence.volatilityClassification,
        liquidity_state: ctx.phaseA.marketIntelligence.liquidityState,
        macro_bias: ctx.phaseA.marketIntelligence.macroBias,
        summary: ctx.phaseA.marketIntelligence.summary,
      },
      technical_analysis: {
        trend_direction: ctx.phaseA.technicalAnalysis.trendDirection,
        momentum_state: ctx.phaseA.technicalAnalysis.momentumState,
        setup_quality: ctx.phaseA.technicalAnalysis.setupQuality,
        key_levels: {
          support: round(ctx.phaseA.technicalAnalysis.keyLevels.support, 2),
          resistance: round(ctx.phaseA.technicalAnalysis.keyLevels.resistance, 2),
        },
        summary: ctx.phaseA.technicalAnalysis.summary,
      },
    } : undefined,
  });
}

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
