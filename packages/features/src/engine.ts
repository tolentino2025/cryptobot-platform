// ═══════════════════════════════════════════════════════════════
// FeatureEngine — Computes indicators and decision context
// Transforms raw MarketSnapshot into compact DecisionContext
// ═══════════════════════════════════════════════════════════════

import { createLogger } from '@cryptobot/core';
import type {
  MarketSnapshot,
  DecisionContext,
  ComputedFeatures,
  CurrentPositionContext,
  AccountContext,
  StrategyConfig,
} from '@cryptobot/shared-types';
import { ema, rsi, atr, volumeRatio, bookImbalance, tradeFlowImbalance } from './indicators.js';

const logger = createLogger('feature-engine');

export class FeatureEngine {
  /**
   * Compute full decision context from market data + state
   */
  computeContext(
    snapshot: MarketSnapshot,
    position: CurrentPositionContext,
    account: AccountContext,
    strategy: StrategyConfig,
  ): DecisionContext {
    const features = this.computeFeatures(snapshot, strategy);
    const mid = (snapshot.ticker.bid + snapshot.ticker.ask) / 2;

    return {
      symbol: snapshot.symbol,
      timestamp: snapshot.timestamp,
      ticker: {
        bid: snapshot.ticker.bid,
        ask: snapshot.ticker.ask,
        last: snapshot.ticker.last,
        mid,
      },
      features,
      position,
      account,
      strategyHints: {
        takeProfitBps: strategy.takeProfitBps,
        stopLossBps: strategy.stopLossBps,
        timeoutSec: strategy.timeoutSeconds,
        rsiOversold: strategy.rsiOversold,
        rsiOverbought: strategy.rsiOverbought,
        minVolumeRatio: strategy.minVolumeRatio,
        minBookImbalance: strategy.minBookImbalance,
      },
    };
  }

  /**
   * Compute technical features/indicators from market data
   */
  computeFeatures(snapshot: MarketSnapshot, strategy: StrategyConfig): ComputedFeatures {
    const candles = snapshot.candles1m;
    if (candles.length < 2) {
      logger.warn({ symbol: snapshot.symbol }, 'Insufficient candle data for features');
      return this.emptyFeatures(snapshot);
    }

    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const volumes = candles.map((c) => c.volume);

    // EMA calculations
    const emaFastValues = ema(closes, strategy.emaFastPeriod);
    const emaSlowValues = ema(closes, strategy.emaSlowPeriod);
    const emaFast = emaFastValues[emaFastValues.length - 1] ?? closes[closes.length - 1] ?? 0;
    const emaSlow = emaSlowValues[emaSlowValues.length - 1] ?? closes[closes.length - 1] ?? 0;

    // RSI
    const rsiValue = rsi(closes, strategy.rsiPeriod);

    // ATR
    const atrValue = atr(highs, lows, closes, strategy.atrPeriod);

    // Volume ratio: use last complete candle vs average of prior candles
    // The last element of candles may be a partial (current) candle — use index [-2] as "current"
    const completeVolumes = volumes.length >= 2 ? volumes.slice(0, -1) : volumes;
    const volRatio = volumeRatio(completeVolumes, 60);

    // Spread in basis points
    const spread = snapshot.ticker.ask - snapshot.ticker.bid;
    const spreadBps = snapshot.ticker.bid > 0
      ? (spread / snapshot.ticker.bid) * 10000
      : 0;

    // Book imbalance (top 5 levels)
    const bookImb = bookImbalance(snapshot.book.bids, snapshot.book.asks, 5);

    // Trade flow imbalance
    const tradeFlow = tradeFlowImbalance(snapshot.recentTrades);

    // Realized volatility (stddev of last 20 1-min returns)
    const returns: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      if (closes[i - 1]! > 0) {
        returns.push((closes[i]! - closes[i - 1]!) / closes[i - 1]!);
      }
    }
    const recentReturns = returns.slice(-20);
    const mean = recentReturns.length > 0
      ? recentReturns.reduce((a, b) => a + b, 0) / recentReturns.length
      : 0;
    const variance = recentReturns.length > 1
      ? recentReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (recentReturns.length - 1)
      : 0;
    const realizedVol = Math.sqrt(variance);

    // Price change percentages
    const currentClose = closes[closes.length - 1] ?? 0;
    const close1mAgo = closes.length >= 2 ? closes[closes.length - 2]! : currentClose;
    const close5mAgo = closes.length >= 6 ? closes[closes.length - 6]! : currentClose;
    const priceChange1m = close1mAgo > 0 ? ((currentClose - close1mAgo) / close1mAgo) * 100 : 0;
    const priceChange5m = close5mAgo > 0 ? ((currentClose - close5mAgo) / close5mAgo) * 100 : 0;

    return {
      emaFast,
      emaSlow,
      rsi: rsiValue,
      atr: atrValue,
      volumeRatio: volRatio,
      spreadBps,
      bookImbalance: bookImb,
      tradeFlowImbalance: tradeFlow,
      realizedVolatility: realizedVol,
      priceChangePercent1m: priceChange1m,
      priceChangePercent5m: priceChange5m,
    };
  }

  private emptyFeatures(snapshot: MarketSnapshot): ComputedFeatures {
    const spread = snapshot.ticker.ask - snapshot.ticker.bid;
    const spreadBps = snapshot.ticker.bid > 0 ? (spread / snapshot.ticker.bid) * 10000 : 0;
    return {
      emaFast: snapshot.ticker.last,
      emaSlow: snapshot.ticker.last,
      rsi: 50,
      atr: 0,
      volumeRatio: 1.0,
      spreadBps,
      bookImbalance: 1.0,
      tradeFlowImbalance: 0.5,
      realizedVolatility: 0,
      priceChangePercent1m: 0,
      priceChangePercent5m: 0,
    };
  }
}
