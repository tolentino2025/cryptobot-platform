// ═══════════════════════════════════════════════════════════════
// Feature Engine Tests — Indicator calculations
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { ema, rsi, atr, volumeRatio, bookImbalance, tradeFlowImbalance } from '../indicators.js';

describe('EMA', () => {
  it('should return same values for period=1', () => {
    expect(ema([1, 2, 3], 1)).toEqual([1, 2, 3]);
  });

  it('should smooth values', () => {
    const result = ema([10, 20, 30, 40, 50], 3);
    expect(result).toHaveLength(5);
    expect(result[0]).toBe(10);
    expect(result[4]).toBeGreaterThan(result[3]!);
  });

  it('should return empty for empty input', () => {
    expect(ema([], 5)).toEqual([]);
  });
});

describe('RSI', () => {
  it('should return 50 for insufficient data', () => {
    expect(rsi([100, 101], 14)).toBe(50);
  });

  it('should return 100 for only gains', () => {
    const values = Array.from({ length: 20 }, (_, i) => 100 + i);
    expect(rsi(values, 14)).toBe(100);
  });

  it('should return value between 0 and 100', () => {
    const values = [100, 102, 99, 103, 98, 104, 97, 105, 96, 106, 95, 107, 94, 108, 93, 109];
    const result = rsi(values, 7);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(100);
  });
});

describe('ATR', () => {
  it('should return 0 for insufficient data', () => {
    expect(atr([100], [90], [95], 14)).toBe(0);
  });

  it('should return positive value for volatile data', () => {
    const highs = [105, 110, 108, 112, 107, 115];
    const lows = [95, 90, 92, 88, 93, 85];
    const closes = [100, 95, 105, 90, 100, 90];
    const result = atr(highs, lows, closes, 3);
    expect(result).toBeGreaterThan(0);
  });
});

describe('volumeRatio', () => {
  it('should return 1 for insufficient data', () => {
    expect(volumeRatio([100], 10)).toBe(1);
  });

  it('should return >1 when current volume is above average', () => {
    const volumes = [10, 10, 10, 10, 50];
    expect(volumeRatio(volumes, 4)).toBeGreaterThan(1);
  });

  it('should return <1 when current volume is below average', () => {
    const volumes = [50, 50, 50, 50, 10];
    expect(volumeRatio(volumes, 4)).toBeLessThan(1);
  });
});

describe('bookImbalance', () => {
  it('should return 1 for equal bid/ask volume', () => {
    const bids = [{ quantity: 10 }, { quantity: 10 }];
    const asks = [{ quantity: 10 }, { quantity: 10 }];
    expect(bookImbalance(bids, asks, 2)).toBe(1);
  });

  it('should return >1 when bids dominate', () => {
    const bids = [{ quantity: 100 }, { quantity: 100 }];
    const asks = [{ quantity: 10 }, { quantity: 10 }];
    expect(bookImbalance(bids, asks, 2)).toBe(10);
  });

  it('should return <1 when asks dominate', () => {
    const bids = [{ quantity: 10 }];
    const asks = [{ quantity: 100 }];
    expect(bookImbalance(bids, asks, 1)).toBe(0.1);
  });
});

describe('tradeFlowImbalance', () => {
  it('should return 0.5 for no trades', () => {
    expect(tradeFlowImbalance([])).toBe(0.5);
  });

  it('should return 1 for all buyer-initiated trades', () => {
    const trades = [
      { quantity: 1, isBuyerMaker: false },
      { quantity: 1, isBuyerMaker: false },
    ];
    expect(tradeFlowImbalance(trades)).toBe(1);
  });

  it('should return 0 for all seller-initiated trades', () => {
    const trades = [
      { quantity: 1, isBuyerMaker: true },
      { quantity: 1, isBuyerMaker: true },
    ];
    expect(tradeFlowImbalance(trades)).toBe(0);
  });
});
