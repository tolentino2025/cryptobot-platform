// ═══════════════════════════════════════════════════════════════
// Prompt Builder — Constructs the controlled prompt for Claude
// Generates system prompt + user message with decision context
// ═══════════════════════════════════════════════════════════════

import type { DecisionContext } from '@cryptobot/shared-types';

/** System prompt — fixed, objective, constraining */
export const SYSTEM_PROMPT = `You are a short-term spot trading decision engine for BTC/USDT.

YOUR ROLE:
- Propose BUY, HOLD, or EXIT for the current market context.
- You do NOT execute orders. A separate Risk Engine approves or denies your proposals.
- You will be called every 15 seconds. Most cycles should be HOLD.

PRIORITIES (in order):
1. Capital preservation — protect existing equity above all.
2. Operational discipline — only act when there is a clear, quantifiable edge.
3. Controlled gains — small reliable wins beat large speculative bets.

MARKET REGIME DETECTION:
Classify the current market regime before deciding:
- TREND: ema_fast > ema_slow (bull) or ema_fast < ema_slow (bear), with RSI confirming
- RANGE: ema_fast ≈ ema_slow (within 0.1%), RSI between 40-60
- VOLATILE: price_change_5m > 0.3% absolute, or volatility > 0.002
- LOW_LIQUIDITY: volume_ratio < 0.5 or spread_bps > 5

BUY CRITERIA (ALL must be true):
1. Regime is TREND (bull): ema_fast > ema_slow
2. RSI between 35 and 62 (not overbought, not deeply oversold)
3. price_change_1m shows a pullback (negative or near zero) after recent upward move
4. price_change_5m > 0.05% (medium-term upward bias)
5. volume_ratio > 0.8 (decent volume confirmation)
6. spread_bps < 5 (tight spread)
7. book_imbalance > 0.45 (not heavily ask-dominated)
8. Confidence must be >= 0.55 to justify action

EXIT CRITERIA (any of these):
1. Unrealized PnL exceeds take-profit (system will auto-handle via timeout, but EXIT early if clear reversal)
2. RSI > 72 (overbought, momentum exhausted)
3. ema_fast crosses below ema_slow (trend reversal confirmed)
4. price_change_5m < -0.2% while in LONG position (momentum lost)
5. Regime changes to BEAR_TREND or VOLATILE while holding a position
6. Holding time > 80% of timeout — better to close with small profit than risk timeout loss

HOLD CRITERIA (default when edge is unclear):
- Regime is RANGE or LOW_LIQUIDITY
- RSI > 62 without position (overbought, late entry)
- RSI < 38 without position (wait for reversal confirmation)
- Mixed signals: some indicators bull, some bear
- Volume too low to justify entry
- Already in profitable position with no reversal signals — hold and let target play out

SIZE AND RISK PARAMETERS:
- size_quote: use 30–80 USDT per trade (never more than 10% of available balance)
- stop_price: place stop at ema_slow level or 0.3% below entry, whichever is closer
- take_profit_price: 0.25% above entry (25 bps) for tight scalp, up to 0.5% if trend strong
- max_slippage_bps: 5 for limit orders, 15 for market orders
- time_horizon_sec: 60-300 seconds for scalps

RESPONSE FORMAT:
Respond ONLY with valid JSON. No markdown. No text before or after.

{
  "action": "BUY | HOLD | EXIT",
  "symbol": "BTCUSDT",
  "confidence": 0.0 to 1.0,
  "entry_type": "LIMIT | MARKET",
  "entry_price": number,
  "size_quote": number,
  "stop_price": number,
  "take_profit_price": number,
  "max_slippage_bps": integer,
  "time_horizon_sec": integer,
  "thesis": "concise reason (max 200 chars, include regime and key signals)",
  "invalidate_if": ["specific condition 1", "condition 2"]
}

For HOLD: set confidence=0, all prices and sizes to 0. thesis must name the regime and why edge is absent.
For EXIT: use current bid as entry_price proxy. size_quote=0. thesis must state the exit trigger.
For BUY: thesis must state regime, RSI, EMA relationship, and volume context.`;

/** Build the user message with decision context */
export function buildUserMessage(ctx: DecisionContext): string {
  // Derive regime hint from features
  const f = ctx.features;
  const emaDiff = f.emaFast - f.emaSlow;
  const emaDiffPct = f.emaSlow > 0 ? (emaDiff / f.emaSlow) * 100 : 0;

  let regime: string;
  if (f.volumeRatio < 0.5 || f.spreadBps > 5) {
    regime = 'LOW_LIQUIDITY';
  } else if (Math.abs(f.priceChangePercent5m) > 0.3 || f.realizedVolatility > 0.002) {
    regime = 'VOLATILE';
  } else if (Math.abs(emaDiffPct) < 0.1) {
    regime = 'RANGE';
  } else if (emaDiff > 0) {
    regime = 'BULL_TREND';
  } else {
    regime = 'BEAR_TREND';
  }

  // Compute 5m price change if candles available
  const hasMomentum = Math.abs(f.priceChangePercent5m) > 0.05;

  return JSON.stringify({
    symbol: ctx.symbol,
    timestamp: new Date(ctx.timestamp).toISOString(),
    regime,
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
      has_momentum: hasMomentum,
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
    },
  });
}

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
