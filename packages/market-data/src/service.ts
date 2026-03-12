// ═══════════════════════════════════════════════════════════════
// MarketDataService — Consumes exchange data via WebSocket/REST
// Maintains fresh snapshots, detects data gaps
// ═══════════════════════════════════════════════════════════════

import { createLogger, eventBus, setWithTTL } from '@cryptobot/core';
import type {
  MarketSnapshot,
  MarketDataHealth,
  Ticker,
  Candle,
  OrderBookSnapshot,
  RecentTrade,
} from '@cryptobot/shared-types';

const logger = createLogger('market-data');

const SNAPSHOT_TTL = 60; // Redis TTL in seconds

// ── Regime types for simulated data ──────────────────────────
type Regime = 'BULL_TREND' | 'BEAR_TREND' | 'RANGE' | 'VOLATILE';

interface SimState {
  price: number;
  regime: Regime;
  regimeTick: number;           // ticks remaining in current regime
  trendVelocity: number;        // price change per tick (momentum)
  candles1m: Candle[];          // rolling buffer of 1-minute candles
  currentCandleOpen: number;
  currentCandleHigh: number;
  currentCandleLow: number;
  currentCandleTick: number;    // seconds elapsed in current 1m candle
  volumeBase: number;           // baseline volume level
}

export class MarketDataService {
  private snapshots: Map<string, MarketSnapshot> = new Map();
  private health: Map<string, MarketDataHealth> = new Map();
  private running = false;
  private stalenessTimers: Map<string, ReturnType<typeof setInterval>> = new Map();

  private simState: SimState | null = null;
  private simInterval: ReturnType<typeof setInterval> | null = null;

  /** Start consuming market data for configured symbols */
  async start(symbols: string[], simMode = false): Promise<void> {
    this.running = true;

    for (const symbol of symbols) {
      this.health.set(symbol, {
        symbol,
        wsConnected: false,
        lastTickerUpdate: 0,
        lastBookUpdate: 0,
        lastTradeUpdate: 0,
        lastCandleUpdate: 0,
        dataGapDetected: false,
        maxStalenessMs: 0,
      });

      if (simMode) {
        this.startSimulatedData(symbol);
      } else {
        // TODO: Real WebSocket connections to Binance
        // For now, start simulated data as fallback
        this.startSimulatedData(symbol);
        logger.info({ symbol }, 'Started simulated market data (no real WS yet)');
      }

      // Staleness monitor
      const timer = setInterval(() => this.checkStaleness(symbol), 2000);
      this.stalenessTimers.set(symbol, timer);
    }

    logger.info({ symbols, simMode }, 'Market Data Service started');
  }

  /** Stop all data streams */
  async stop(): Promise<void> {
    this.running = false;
    if (this.simInterval) {
      clearInterval(this.simInterval);
      this.simInterval = null;
    }
    for (const [, timer] of this.stalenessTimers) {
      clearInterval(timer);
    }
    this.stalenessTimers.clear();
    logger.info('Market Data Service stopped');
  }

  /** Get current snapshot for a symbol */
  getSnapshot(symbol: string): MarketSnapshot | null {
    return this.snapshots.get(symbol) ?? null;
  }

  /** Get health status for a symbol */
  getHealth(symbol: string): MarketDataHealth | null {
    return this.health.get(symbol) ?? null;
  }

  /** Check if data is fresh for a symbol */
  isDataFresh(symbol: string, maxAgeMs: number): boolean {
    const snapshot = this.snapshots.get(symbol);
    if (!snapshot) return false;
    return snapshot.dataAgeMs <= maxAgeMs;
  }

  /** Get data age in milliseconds */
  getDataAgeMs(symbol: string): number {
    const snapshot = this.snapshots.get(symbol);
    if (!snapshot) return Infinity;
    return Date.now() - snapshot.timestamp;
  }

  // ── Simulated data with realistic market regimes ─────────────

  private pickRegime(): Regime {
    const r = Math.random();
    if (r < 0.30) return 'BULL_TREND';
    if (r < 0.55) return 'BEAR_TREND';
    if (r < 0.80) return 'RANGE';
    return 'VOLATILE';
  }

  private initSimState(startPrice = 50000): SimState {
    const regime = this.pickRegime();
    // Pre-warm 60 candles so indicators are immediately computable
    const candles1m = this.generateWarmupCandles(startPrice, 60);
    const lastCandle = candles1m[candles1m.length - 1];
    const lastClose = lastCandle ? lastCandle.close : startPrice;
    return {
      price: lastClose,
      regime,
      regimeTick: 60 + Math.floor(Math.random() * 120),
      trendVelocity: this.regimeVelocity(regime),
      candles1m,
      currentCandleOpen: lastClose,
      currentCandleHigh: lastClose,
      currentCandleLow: lastClose,
      currentCandleTick: 0,
      volumeBase: 0.8 + Math.random() * 0.4,
    };
  }

  /** Generate historical candles for warm-up */
  private generateWarmupCandles(basePrice: number, count: number): Candle[] {
    const candles: Candle[] = [];
    let price = basePrice;
    const now = Date.now();
    // Create a gentle trend history (slight bull bias)
    for (let i = count; i >= 1; i--) {
      const drift = (Math.random() - 0.45) * 15; // slight bull bias
      const open = price;
      price = Math.max(price + drift, 10000);
      const range = Math.abs(drift) + Math.random() * 20;
      const high = Math.max(open, price) + Math.random() * range * 0.5;
      const low = Math.min(open, price) - Math.random() * range * 0.5;
      candles.push({
        openTime: now - i * 60000,
        open,
        high,
        low,
        close: price,
        volume: 0.5 + Math.random() * 1.5,
        closeTime: now - i * 60000 + 59999,
        quoteVolume: price * (0.5 + Math.random() * 1.5),
        trades: Math.floor(50 + Math.random() * 150),
      });
    }
    return candles;
  }

  private regimeVelocity(regime: Regime): number {
    switch (regime) {
      case 'BULL_TREND': return +(2 + Math.random() * 8);   // +$2 to +$10 per tick
      case 'BEAR_TREND': return -(2 + Math.random() * 8);
      case 'RANGE':      return 0;
      case 'VOLATILE':   return (Math.random() - 0.5) * 30;
    }
  }

  /** Start simulated data generation with realistic regime behavior */
  private startSimulatedData(symbol: string): void {
    this.simState = this.initSimState(50000);

    const update = () => {
      if (!this.running || !this.simState) return;
      const s = this.simState;

      // ── Regime progression ──
      s.regimeTick--;
      if (s.regimeTick <= 0) {
        const prevRegime = s.regime;
        s.regime = this.pickRegime();
        s.regimeTick = 60 + Math.floor(Math.random() * 120);
        s.trendVelocity = this.regimeVelocity(s.regime);
        s.volumeBase = s.regime === 'VOLATILE' ? 1.5 + Math.random() : 0.6 + Math.random() * 0.8;
        logger.debug({ symbol, from: prevRegime, to: s.regime }, 'Market regime change');
      }

      // ── Price movement ──
      const noise = (Math.random() - 0.5) * 10; // ±$5 random noise
      const drift = s.trendVelocity + noise;
      // Reversion pull toward 50000 in range mode
      const reversion = s.regime === 'RANGE' ? (50000 - s.price) * 0.02 : 0;
      s.price = Math.max(s.price + drift + reversion, s.price * 0.95); // floor at 5% drop per tick
      s.price = Math.max(s.price, 10000); // absolute floor

      const now = Date.now();
      const spreadBps = s.regime === 'VOLATILE' ? 3 + Math.random() * 4 : 1 + Math.random() * 2;
      const halfSpread = s.price * (spreadBps / 10000) / 2;

      const ticker: Ticker = {
        symbol,
        bid: s.price - halfSpread,
        ask: s.price + halfSpread,
        last: s.price,
        volume24h: 500 + Math.random() * 500,
        quoteVolume24h: s.price * (500 + Math.random() * 500),
        high24h: s.price * 1.02,
        low24h: s.price * 0.98,
        timestamp: now,
      };

      // ── 1m candle construction ──
      s.currentCandleTick++;
      s.currentCandleHigh = Math.max(s.currentCandleHigh, s.price);
      s.currentCandleLow = Math.min(s.currentCandleLow, s.price);

      // Close current candle every 60 ticks (1 minute at 1Hz)
      if (s.currentCandleTick >= 60) {
        const volMultiplier = s.volumeBase + (Math.random() - 0.5) * 0.3;
        const completedCandle: Candle = {
          openTime: now - 60000,
          open: s.currentCandleOpen,
          high: s.currentCandleHigh,
          low: s.currentCandleLow,
          close: s.price,
          volume: Math.max(0.01, volMultiplier * (0.5 + Math.random() * 1.5)),
          closeTime: now - 1,
          quoteVolume: s.price * volMultiplier,
          trades: Math.floor(50 + Math.random() * 150),
        };
        s.candles1m.push(completedCandle);
        if (s.candles1m.length > 60) s.candles1m.shift(); // keep 60 candles

        // Reset current candle
        s.currentCandleOpen = s.price;
        s.currentCandleHigh = s.price;
        s.currentCandleLow = s.price;
        s.currentCandleTick = 0;
      }

      // Build live candles1m (historical + current partial candle)
      const currentPartial: Candle = {
        openTime: now - s.currentCandleTick * 1000,
        open: s.currentCandleOpen,
        high: s.currentCandleHigh,
        low: s.currentCandleLow,
        close: s.price,
        volume: s.volumeBase * (s.currentCandleTick / 60),
        closeTime: now + (60 - s.currentCandleTick) * 1000,
        quoteVolume: s.price * s.volumeBase * (s.currentCandleTick / 60),
        trades: Math.floor(s.currentCandleTick * 2),
      };

      const candles1m: Candle[] = [...s.candles1m, currentPartial];

      // ── 5m candles aggregated from 1m ──
      const candles5m: Candle[] = this.aggregate5m(s.candles1m);

      // ── Order book ──
      const bookDepth = s.regime === 'RANGE' ? 2.0 : 0.8 + Math.random() * 1.5;
      const askBias = s.regime === 'BULL_TREND' ? 0.6 : s.regime === 'BEAR_TREND' ? 0.4 : 0.5;
      const book: OrderBookSnapshot = {
        symbol,
        bids: Array.from({ length: 10 }, (_, i) => ({
          price: ticker.bid - i * (s.price * 0.0002),
          quantity: Math.max(0.01, (1 - askBias) * bookDepth * (0.5 + Math.random())),
        })),
        asks: Array.from({ length: 10 }, (_, i) => ({
          price: ticker.ask + i * (s.price * 0.0002),
          quantity: Math.max(0.01, askBias * bookDepth * (0.5 + Math.random())),
        })),
        timestamp: now,
      };

      // ── Recent trades ──
      const buyBias = s.regime === 'BULL_TREND' ? 0.65 : s.regime === 'BEAR_TREND' ? 0.35 : 0.5;
      const recentTrades: RecentTrade[] = Array.from({ length: 20 }, (_, i) => ({
        id: `sim_${now}_${i}`,
        symbol,
        price: s.price + (Math.random() - 0.5) * halfSpread * 4,
        quantity: 0.001 + Math.random() * 0.02,
        isBuyerMaker: Math.random() > buyBias,
        timestamp: now - i * 500,
      }));

      const snapshot: MarketSnapshot = {
        symbol,
        ticker,
        candles1m,
        candles5m,
        book,
        recentTrades,
        timestamp: now,
        dataAgeMs: 0,
        isFresh: true,
      };

      this.snapshots.set(symbol, snapshot);

      // Update health
      const h = this.health.get(symbol)!;
      h.wsConnected = true;
      h.lastTickerUpdate = now;
      h.lastBookUpdate = now;
      h.lastTradeUpdate = now;
      h.lastCandleUpdate = now;
      h.dataGapDetected = false;
      h.maxStalenessMs = 0;

      // Cache in Redis
      setWithTTL(`market:${symbol}`, JSON.stringify({ price: ticker.last, bid: ticker.bid, ask: ticker.ask }), SNAPSHOT_TTL).catch(() => {});

      eventBus.emit('market:snapshot', { symbol, timestamp: now });
    };

    // Update every second
    update();
    this.simInterval = setInterval(update, 1000);
  }

  /** Aggregate 1m candles into 5m candles */
  private aggregate5m(candles1m: Candle[]): Candle[] {
    if (candles1m.length < 5) return [];
    const result: Candle[] = [];
    // Group in chunks of 5
    for (let i = 0; i + 4 < candles1m.length; i += 5) {
      const chunk = candles1m.slice(i, i + 5);
      result.push({
        openTime: chunk[0]!.openTime,
        open: chunk[0]!.open,
        high: Math.max(...chunk.map((c) => c.high)),
        low: Math.min(...chunk.map((c) => c.low)),
        close: chunk[chunk.length - 1]!.close,
        volume: chunk.reduce((s, c) => s + c.volume, 0),
        closeTime: chunk[chunk.length - 1]!.closeTime,
        quoteVolume: chunk.reduce((s, c) => s + c.quoteVolume, 0),
        trades: chunk.reduce((s, c) => s + c.trades, 0),
      });
    }
    return result.slice(-12); // Keep last 12 5m candles (1 hour)
  }

  /** Check data staleness */
  private checkStaleness(symbol: string): void {
    const snapshot = this.snapshots.get(symbol);
    if (!snapshot) return;

    const age = Date.now() - snapshot.timestamp;
    snapshot.dataAgeMs = age;
    snapshot.isFresh = age < 5000;

    const h = this.health.get(symbol);
    if (h) {
      h.maxStalenessMs = age;
      if (age > 10000 && !h.dataGapDetected) {
        h.dataGapDetected = true;
        eventBus.emit('market:gap', { symbol, gapMs: age });
        logger.warn({ symbol, gapMs: age }, 'Market data gap detected');
      } else if (age < 5000 && h.dataGapDetected) {
        h.dataGapDetected = false;
      }
    }
  }
}

export { MarketDataService as default };
