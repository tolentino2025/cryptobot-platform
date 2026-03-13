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

interface RestTicker24h {
  bidPrice: string;
  askPrice: string;
  lastPrice: string;
  volume?: string;
  quoteVolume?: string;
  highPrice?: string;
  lowPrice?: string;
}

interface RestBookDepth {
  bids: [string, string][];
  asks: [string, string][];
}

interface RestTrade {
  id: number;
  price: string;
  qty: string;
  isBuyerMaker: boolean;
  time: number;
}

/** Threshold (ms) after which the watchdog restarts a stale data stream */
const WATCHDOG_RESTART_MS = 5_000;

export class MarketDataService {
  private snapshots: Map<string, MarketSnapshot> = new Map();
  private health: Map<string, MarketDataHealth> = new Map();
  private running = false;
  private stalenessTimers: Map<string, ReturnType<typeof setInterval>> = new Map();

  private simState: SimState | null = null;
  // Per-symbol interval refs (fixes multi-symbol stop bug)
  private simIntervals:      Map<string, ReturnType<typeof setInterval>> = new Map();
  private restPollIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private watchdogIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();

  /** Base URL for REST price polling in DEMO/LIVE mode */
  private restBaseUrl = '';

  /**
   * Start consuming market data for configured symbols.
   * @param restBaseUrl  When provided, polls the exchange REST API every 2 s for real prices
   *                     (DEMO = testnet URL, LIVE = production URL).
   *                     When omitted the service runs in fully-simulated mode.
   */
  async start(symbols: string[], simMode = false, restBaseUrl?: string): Promise<void> {
    this.running = true;
    this.restBaseUrl = restBaseUrl ?? '';

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

      if (!simMode && this.restBaseUrl) {
        // DEMO/LIVE: build the full snapshot from real REST endpoints
        this.startRestSnapshotFeed(symbol);
        logger.info({ symbol, restBaseUrl: this.restBaseUrl }, 'REST snapshot feed started (DEMO/LIVE mode)');
      } else {
        // SIM: fully synthetic market stream
        this.startSimulatedData(symbol);
        logger.info({ symbol }, 'Simulated market data started (SIM mode)');
      }

      // Watchdog: restart data stream if no update for 5 s
      this.startWatchdog(symbol, simMode);

      // Staleness monitor (every 2 s)
      const timer = setInterval(() => this.checkStaleness(symbol), 2000);
      this.stalenessTimers.set(symbol, timer);
    }

    logger.info({ symbols, simMode, hasRealFeed: !!this.restBaseUrl }, 'Market Data Service started');
  }

  /** Stop all data streams */
  async stop(): Promise<void> {
    this.running = false;
    for (const [, t] of this.simIntervals)      clearInterval(t);
    for (const [, t] of this.restPollIntervals)  clearInterval(t);
    for (const [, t] of this.watchdogIntervals)  clearInterval(t);
    for (const [, t] of this.stalenessTimers)    clearInterval(t);
    this.simIntervals.clear();
    this.restPollIntervals.clear();
    this.watchdogIntervals.clear();
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

  /**
   * Returns true if all tracked symbols (or a specific one) have fresh data.
   * "Fresh" means last update was within 5 s.
   * Required by startup interface validation (Problem 4).
   */
  isHealthy(symbol?: string): boolean {
    if (symbol) {
      return this.isDataFresh(symbol, WATCHDOG_RESTART_MS);
    }
    if (this.health.size === 0) return false;
    for (const [sym] of this.health) {
      if (!this.isDataFresh(sym, WATCHDOG_RESTART_MS)) return false;
    }
    return true;
  }

  // ── REST snapshot feed (DEMO / LIVE mode) ────────────────────

  /**
   * Poll the exchange REST API every 2 s and rebuild the full market snapshot.
   * This avoids the DEMO/LIVE hybrid mode where ticker was real but candles/book/trades were simulated.
   */
  private startRestSnapshotFeed(symbol: string): void {
    const existing = this.restPollIntervals.get(symbol);
    if (existing) clearInterval(existing);

    const poll = async () => {
      if (!this.running) return;
      try {
        const [ticker24h, bookDepth, tradesRaw, candles1mRaw, candles5mRaw] = await Promise.all([
          fetch(`${this.restBaseUrl}/api/v3/ticker/24hr?symbol=${symbol}`).then((r) => r.ok ? r.json() as Promise<RestTicker24h> : null),
          fetch(`${this.restBaseUrl}/api/v3/depth?symbol=${symbol}&limit=10`).then((r) => r.ok ? r.json() as Promise<RestBookDepth> : null),
          fetch(`${this.restBaseUrl}/api/v3/trades?symbol=${symbol}&limit=20`).then((r) => r.ok ? r.json() as Promise<RestTrade[]> : null),
          fetch(`${this.restBaseUrl}/api/v3/klines?symbol=${symbol}&interval=1m&limit=60`).then((r) => r.ok ? r.json() as Promise<unknown[]> : null),
          fetch(`${this.restBaseUrl}/api/v3/klines?symbol=${symbol}&interval=5m&limit=12`).then((r) => r.ok ? r.json() as Promise<unknown[]> : null),
        ]);

        if (!ticker24h || !bookDepth || !tradesRaw || !candles1mRaw || !candles5mRaw) {
          return;
        }

        const now = Date.now();
        const bid = parseFloat(ticker24h.bidPrice);
        const ask = parseFloat(ticker24h.askPrice);
        const last = parseFloat(ticker24h.lastPrice);
        if ([bid, ask, last].some((value) => !isFinite(value) || value <= 0)) return;

        const ticker: Ticker = {
          symbol,
          bid,
          ask,
          last,
          volume24h: parseFloat(ticker24h.volume ?? '0'),
          quoteVolume24h: parseFloat(ticker24h.quoteVolume ?? '0'),
          high24h: parseFloat(ticker24h.highPrice ?? String(last)),
          low24h: parseFloat(ticker24h.lowPrice ?? String(last)),
          timestamp: now,
        };

        const candles1m: Candle[] = Array.isArray(candles1mRaw)
          ? candles1mRaw.map((c) => this.mapRestKline(c)).filter(Boolean) as Candle[]
          : [];
        const candles5m: Candle[] = Array.isArray(candles5mRaw)
          ? candles5mRaw.map((c) => this.mapRestKline(c)).filter(Boolean) as Candle[]
          : [];

        const book: OrderBookSnapshot = {
          symbol,
          bids: Array.isArray(bookDepth.bids)
            ? bookDepth.bids.map((level: [string, string]) => ({
              price: parseFloat(level[0]),
              quantity: parseFloat(level[1]),
            })).filter((level) => isFinite(level.price) && isFinite(level.quantity))
            : [],
          asks: Array.isArray(bookDepth.asks)
            ? bookDepth.asks.map((level: [string, string]) => ({
              price: parseFloat(level[0]),
              quantity: parseFloat(level[1]),
            })).filter((level) => isFinite(level.price) && isFinite(level.quantity))
            : [],
          timestamp: now,
        };

        const recentTrades: RecentTrade[] = Array.isArray(tradesRaw)
          ? tradesRaw.map((trade) => ({
            id: String(trade.id),
            symbol,
            price: parseFloat(trade.price),
            quantity: parseFloat(trade.qty),
            isBuyerMaker: trade.isBuyerMaker,
            timestamp: trade.time,
          })).filter((trade) => isFinite(trade.price) && isFinite(trade.quantity))
          : [];

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

        const h = this.health.get(symbol);
        if (h) {
          h.wsConnected = true;
          h.lastTickerUpdate = now;
          h.lastBookUpdate = now;
          h.lastTradeUpdate = now;
          h.lastCandleUpdate = now;
          h.dataGapDetected = false;
          h.maxStalenessMs = 0;
        }

        setWithTTL(`market:${symbol}`, JSON.stringify({ price: ticker.last, bid: ticker.bid, ask: ticker.ask }), SNAPSHOT_TTL).catch(() => {});
        eventBus.emit('market:snapshot', { symbol, timestamp: now });
      } catch (err) {
        logger.warn({ symbol, error: err }, 'REST snapshot feed poll failed');
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    this.restPollIntervals.set(symbol, interval);
  }

  // ── Watchdog ─────────────────────────────────────────────────

  /**
   * Restart the data stream for a symbol if no update has arrived within
   * WATCHDOG_RESTART_MS (5 s).  Fires an incident event on first trigger.
   */
  private startWatchdog(symbol: string, simMode: boolean): void {
    const existing = this.watchdogIntervals.get(symbol);
    if (existing) clearInterval(existing);

    const check = () => {
      if (!this.running) return;
      const snapshot = this.snapshots.get(symbol);
      if (!snapshot) return;

      const age = Date.now() - snapshot.timestamp;
      if (age > WATCHDOG_RESTART_MS) {
        logger.warn({ symbol, ageMs: age }, 'Market data watchdog: stale — restarting stream');
        eventBus.emit('market:gap', { symbol, gapMs: age });

        if (!simMode && this.restBaseUrl) {
          const ri = this.restPollIntervals.get(symbol);
          if (ri) { clearInterval(ri); this.restPollIntervals.delete(symbol); }
          this.startRestSnapshotFeed(symbol);
        } else {
          const si = this.simIntervals.get(symbol);
          if (si) { clearInterval(si); this.simIntervals.delete(symbol); }
          this.startSimulatedData(symbol);
        }
      }
    };

    const interval = setInterval(check, WATCHDOG_RESTART_MS);
    this.watchdogIntervals.set(symbol, interval);
  }

  private mapRestKline(raw: unknown): Candle | null {
    if (!Array.isArray(raw) || raw.length < 9) return null;

    const [
      openTime,
      open,
      high,
      low,
      close,
      volume,
      closeTime,
      quoteVolume,
      trades,
    ] = raw;

    const candle: Candle = {
      openTime: Number(openTime),
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume),
      closeTime: Number(closeTime),
      quoteVolume: Number(quoteVolume),
      trades: Number(trades),
    };

    return Object.values(candle).every((value) => typeof value === 'number' && isFinite(value))
      ? candle
      : null;
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
    // Clear any existing interval for this symbol before creating a new one
    const existing = this.simIntervals.get(symbol);
    if (existing) clearInterval(existing);

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

    // Update every second — store per-symbol so stop() can clear each one
    update();
    const interval = setInterval(update, 1000);
    this.simIntervals.set(symbol, interval);
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
