// ═══════════════════════════════════════════════════════════════
// DeterministicEntryEngine — Rule-based BUY signal generator
//
// Replaces Claude's BUY authority. All entry conditions are
// explicit, numeric, and auditable — no AI non-determinism.
//
// Conditions (ALL must pass for entry):
//   1. ema_fast > ema_slow                     (bull trend)
//   2. RSI in [35, 62]                          (not overbought, not oversold knife)
//   3. price_change_5m > 0.05%                 (medium-term upward bias)
//   4. volume_ratio > 0.8                       (volume confirmation)
//   5. spread_bps < 5                           (tight spread)
//   6. book_imbalance > 0.45                    (not ask-dominated)
// ═══════════════════════════════════════════════════════════════

import { createLogger } from '@cryptobot/core';
import type { ComputedFeatures } from '@cryptobot/shared-types';
import { EntryType } from '@cryptobot/shared-types';

const logger = createLogger('deterministic-entry');

// ── Thresholds ────────────────────────────────────────────────
const RSI_MIN = 35;
const RSI_MAX = 62;
const PRICE_CHANGE_5M_MIN_PCT = 0.05;
const VOLUME_RATIO_MIN = 0.8;
const SPREAD_BPS_MAX = 5;
const BOOK_IMBALANCE_MIN = 0.45;

// ── Default order parameters ──────────────────────────────────
const TAKE_PROFIT_BPS_DEFAULT = 25;    // 0.25% above entry
const STOP_LOSS_BPS_DEFAULT   = 30;    // 0.30% below entry
const SIZE_QUOTE_DEFAULT      = 50;    // USDT per trade
const TIME_HORIZON_SEC_DEFAULT = 300;  // 5 minutes
const MAX_SLIPPAGE_BPS        = 15;    // MARKET order tolerance

export interface EntryCandidate {
  shouldEnter: boolean;
  /** MARKET entry price (current ask) */
  entryPrice: number;
  stopPrice: number;
  takeProfitPrice: number;
  sizeQuote: number;
  entryType: EntryType;
  maxSlippageBps: number;
  timeHorizonSec: number;
  /** Human-readable pass summary */
  reason: string;
  /** Conditions that failed (empty if shouldEnter is true) */
  failedConditions: string[];
}

export interface EntryStrategyHints {
  takeProfitBps?: number;
  stopLossBps?: number;
  timeoutSec?: number;
  sizeQuote?: number;
}

export class DeterministicEntryEngine {
  /**
   * Evaluate all entry conditions and return an EntryCandidate.
   * If all conditions pass, shouldEnter is true with computed order params.
   */
  evaluate(
    features: ComputedFeatures,
    ticker: { ask: number; bid: number; last: number },
    hints: EntryStrategyHints = {},
  ): EntryCandidate {
    const failedConditions: string[] = [];

    // ── Condition 1: Bull trend (ema_fast must be above ema_slow) ──
    if (features.emaFast <= features.emaSlow) {
      failedConditions.push(
        `C1 ema_fast (${features.emaFast.toFixed(2)}) <= ema_slow (${features.emaSlow.toFixed(2)})`,
      );
    }

    // ── Condition 2: RSI within entry window [35, 62] ──
    if (features.rsi < RSI_MIN || features.rsi > RSI_MAX) {
      failedConditions.push(
        `C2 rsi (${features.rsi.toFixed(1)}) outside [${RSI_MIN}, ${RSI_MAX}]`,
      );
    }

    // ── Condition 3: Positive 5m price momentum ──
    if (features.priceChangePercent5m <= PRICE_CHANGE_5M_MIN_PCT) {
      failedConditions.push(
        `C3 price_change_5m (${features.priceChangePercent5m.toFixed(3)}%) <= ${PRICE_CHANGE_5M_MIN_PCT}%`,
      );
    }

    // ── Condition 4: Volume above threshold ──
    if (features.volumeRatio <= VOLUME_RATIO_MIN) {
      failedConditions.push(
        `C4 volume_ratio (${features.volumeRatio.toFixed(2)}) <= ${VOLUME_RATIO_MIN}`,
      );
    }

    // ── Condition 5: Spread not too wide ──
    if (features.spreadBps >= SPREAD_BPS_MAX) {
      failedConditions.push(
        `C5 spread_bps (${features.spreadBps.toFixed(2)}) >= ${SPREAD_BPS_MAX}`,
      );
    }

    // ── Condition 6: Order book not ask-dominated ──
    if (features.bookImbalance <= BOOK_IMBALANCE_MIN) {
      failedConditions.push(
        `C6 book_imbalance (${features.bookImbalance.toFixed(3)}) <= ${BOOK_IMBALANCE_MIN}`,
      );
    }

    if (failedConditions.length > 0) {
      logger.debug({ failedConditions }, 'Deterministic entry: conditions not met');
      return {
        shouldEnter: false,
        entryPrice: 0,
        stopPrice: 0,
        takeProfitPrice: 0,
        sizeQuote: 0,
        entryType: EntryType.MARKET,
        maxSlippageBps: 0,
        timeHorizonSec: 0,
        reason: `Entry blocked: ${failedConditions.join('; ')}`,
        failedConditions,
      };
    }

    // ── All conditions passed — compute order parameters ──
    const entryPrice = ticker.ask;
    const tpBps     = hints.takeProfitBps ?? TAKE_PROFIT_BPS_DEFAULT;
    const slBps     = hints.stopLossBps   ?? STOP_LOSS_BPS_DEFAULT;

    // Stop: max of ema_slow (dynamic support) vs fixed % floor — whichever is tighter (higher)
    const stopByBps  = entryPrice * (1 - slBps / 10_000);
    const stopPrice  = Math.max(features.emaSlow, stopByBps);

    const takeProfitPrice = entryPrice * (1 + tpBps / 10_000);
    const sizeQuote       = hints.sizeQuote   ?? SIZE_QUOTE_DEFAULT;
    const timeHorizonSec  = hints.timeoutSec  ?? TIME_HORIZON_SEC_DEFAULT;

    logger.info(
      {
        entryPrice,
        stopPrice,
        takeProfitPrice,
        sizeQuote,
        rsi: features.rsi.toFixed(1),
        emaFast: features.emaFast.toFixed(2),
        emaSlow: features.emaSlow.toFixed(2),
        volumeRatio: features.volumeRatio.toFixed(2),
        spreadBps: features.spreadBps.toFixed(2),
      },
      'Deterministic entry: all 6 conditions met',
    );

    return {
      shouldEnter: true,
      entryPrice,
      stopPrice,
      takeProfitPrice,
      sizeQuote,
      entryType: EntryType.MARKET,
      maxSlippageBps: MAX_SLIPPAGE_BPS,
      timeHorizonSec,
      reason: 'All 6 deterministic conditions met',
      failedConditions: [],
    };
  }
}
