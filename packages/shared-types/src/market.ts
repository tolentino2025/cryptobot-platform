// ═══════════════════════════════════════════════════════════════
// Market Data Types
// Types for market data consumed from exchanges
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

/** OHLCV candle */
export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  quoteVolume: number;
  trades: number;
}

/** Ticker snapshot */
export interface Ticker {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  volume24h: number;
  quoteVolume24h: number;
  high24h: number;
  low24h: number;
  timestamp: number;
}

/** Order book level */
export interface BookLevel {
  price: number;
  quantity: number;
}

/** Order book snapshot (top N levels) */
export interface OrderBookSnapshot {
  symbol: string;
  bids: BookLevel[];  // Sorted desc by price
  asks: BookLevel[];  // Sorted asc by price
  timestamp: number;
}

/** Recent trade */
export interface RecentTrade {
  id: string;
  symbol: string;
  price: number;
  quantity: number;
  isBuyerMaker: boolean;
  timestamp: number;
}

/** Complete market snapshot for a symbol — input to Feature Engine */
export interface MarketSnapshot {
  symbol: string;
  ticker: Ticker;
  candles1m: Candle[];       // Last N 1-minute candles
  candles5m: Candle[];       // Last N 5-minute candles
  book: OrderBookSnapshot;
  recentTrades: RecentTrade[];
  timestamp: number;
  /** Milliseconds since last update from exchange */
  dataAgeMs: number;
  /** Whether this snapshot is considered fresh */
  isFresh: boolean;
}

/** Market data health status */
export interface MarketDataHealth {
  symbol: string;
  wsConnected: boolean;
  lastTickerUpdate: number;
  lastBookUpdate: number;
  lastTradeUpdate: number;
  lastCandleUpdate: number;
  dataGapDetected: boolean;
  /** Maximum staleness across all data types */
  maxStalenessMs: number;
}

/** Zod schema for MarketSnapshot validation (used in tests/auditing) */
export const MarketSnapshotSchema = z.object({
  symbol: z.string().min(1),
  ticker: z.object({
    symbol: z.string(),
    bid: z.number().positive(),
    ask: z.number().positive(),
    last: z.number().positive(),
    volume24h: z.number().nonnegative(),
    quoteVolume24h: z.number().nonnegative(),
    high24h: z.number().positive(),
    low24h: z.number().positive(),
    timestamp: z.number().int().positive(),
  }),
  candles1m: z.array(z.object({
    openTime: z.number(),
    open: z.number(),
    high: z.number(),
    low: z.number(),
    close: z.number(),
    volume: z.number(),
    closeTime: z.number(),
    quoteVolume: z.number(),
    trades: z.number(),
  })),
  candles5m: z.array(z.any()),
  book: z.object({
    symbol: z.string(),
    bids: z.array(z.object({ price: z.number(), quantity: z.number() })),
    asks: z.array(z.object({ price: z.number(), quantity: z.number() })),
    timestamp: z.number(),
  }),
  recentTrades: z.array(z.any()),
  timestamp: z.number().int().positive(),
  dataAgeMs: z.number().nonnegative(),
  isFresh: z.boolean(),
});
