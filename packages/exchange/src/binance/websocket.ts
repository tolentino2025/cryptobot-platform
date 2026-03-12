// ═══════════════════════════════════════════════════════════════
// BinanceWsManager — WebSocket user data stream manager
//
// Responsibilities:
//   - Connect to /ws/<listenKey> user data stream
//   - Auto-reconnect with exponential backoff (max 10 attempts)
//   - Re-acquire listen key on reconnect (old key may have expired)
//   - Heartbeat: send WebSocket ping every 3 minutes
//   - Measure round-trip latency from ping→pong
//   - Keepalive: PUT /api/v3/userDataStream every 30 minutes
//   - Dispatch parsed events to registered handlers
//   - Emit `incident:created` if reconnects are exhausted
//
// Events dispatched:
//   - executionReport  — order state changes (new, fill, cancel, reject)
//   - outboundAccountPosition — balance updates after fills
//   - listenKeyExpired — key expired; reconnect required
// ═══════════════════════════════════════════════════════════════

import WebSocket from 'ws';
import { createLogger, eventBus } from '@cryptobot/core';
import { IncidentType, IncidentSeverity } from '@cryptobot/shared-types';
import type { BinanceClient } from './client.js';
import type { BinanceWsMessage, BinanceExecutionReport } from './types.js';

const logger = createLogger('binance-ws');

const WS_BASE_TESTNET = 'wss://testnet.binance.vision/ws';
const WS_BASE_LIVE    = 'wss://stream.binance.com:9443/ws';

/** How often to send WebSocket ping frames (ms) */
const PING_INTERVAL_MS = 3 * 60 * 1000;        // 3 minutes

/** How often to renew the listen key via REST (ms) */
const KEEPALIVE_INTERVAL_MS = 30 * 60 * 1000;  // 30 minutes

/** Initial reconnect delay (ms); doubles each attempt up to MAX */
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS  = 30_000;
const RECONNECT_MAX_ATTEMPTS = 10;

export type WsMessageHandler = (msg: BinanceWsMessage) => void;

export class BinanceWsManager {
  private ws: WebSocket | null = null;
  private listenKey: string | null = null;

  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private keepaliveInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  private reconnectAttempts = 0;
  private stopped = false;

  /** Timestamp of the last sent ping (for latency measurement) */
  private lastPingSentAt = 0;
  private _latencyMs = 0;

  private readonly handlers = new Set<WsMessageHandler>();
  private readonly wsBase: string;

  constructor(
    private readonly client: BinanceClient,
    testnet: boolean,
  ) {
    this.wsBase = testnet ? WS_BASE_TESTNET : WS_BASE_LIVE;
  }

  // ──────────────────────────────────────────
  // LIFECYCLE
  // ──────────────────────────────────────────

  async start(): Promise<void> {
    this.stopped = false;
    this.listenKey = await this.client.createListenKey();
    logger.info({ listenKey: this.redactKey(this.listenKey) }, 'Listen key acquired');
    await this.connect();
    this.startKeepalive();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.clearTimers();

    if (this.listenKey) {
      await this.client.deleteListenKey(this.listenKey).catch((e: unknown) => {
        logger.warn({ error: e }, 'Failed to delete listen key on stop');
      });
      this.listenKey = null;
    }

    if (this.ws) {
      this.ws.terminate();
      this.ws = null;
    }

    logger.info('BinanceWsManager stopped');
  }

  // ──────────────────────────────────────────
  // HANDLERS
  // ──────────────────────────────────────────

  on(handler: WsMessageHandler): void {
    this.handlers.add(handler);
  }

  off(handler: WsMessageHandler): void {
    this.handlers.delete(handler);
  }

  /** Last measured WS round-trip latency in ms */
  get latencyMs(): number {
    return this._latencyMs;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // ──────────────────────────────────────────
  // CONNECTION
  // ──────────────────────────────────────────

  private async connect(): Promise<void> {
    if (!this.listenKey) return;

    const url = `${this.wsBase}/${this.listenKey}`;
    logger.info({ url: `${this.wsBase}/${this.redactKey(this.listenKey)}` }, 'WS connecting');

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      logger.info({ reconnectAttempts: this.reconnectAttempts }, 'WS connected');
      this.reconnectAttempts = 0;
      this.startPing();
    });

    this.ws.on('message', (data: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(data.toString()) as BinanceWsMessage;
        this.dispatch(msg);
      } catch (e) {
        logger.warn({ error: e, raw: data.toString().slice(0, 200) }, 'WS message parse error');
      }
    });

    this.ws.on('pong', () => {
      this._latencyMs = Date.now() - this.lastPingSentAt;
      logger.debug({ latencyMs: this._latencyMs }, 'WS pong received');
    });

    this.ws.on('ping', (data) => {
      // Respond to server-initiated pings (Binance sends these too)
      this.ws?.pong(data);
    });

    this.ws.on('error', (err) => {
      logger.error({ err: err.message }, 'WS error');
    });

    this.ws.on('close', (code, reason) => {
      this.stopPing();
      const reasonStr = reason.toString() || '(no reason)';
      logger.warn({ code, reason: reasonStr }, 'WS closed');

      if (!this.stopped) {
        this.scheduleReconnect();
      }
    });
  }

  // ──────────────────────────────────────────
  // RECONNECT
  // ──────────────────────────────────────────

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
      logger.error(
        { attempts: this.reconnectAttempts },
        'WS max reconnect attempts reached — raising critical incident',
      );
      eventBus.emit('incident:created', {
        incidentId: `ws-reconnect-exhausted-${Date.now()}`,
        type: IncidentType.WEBSOCKET_DISCONNECT as string,
        severity: IncidentSeverity.CRITICAL as string,
      });
      return;
    }

    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempts++;

    logger.info(
      { attempt: this.reconnectAttempts, delayMs: delay },
      'Scheduling WS reconnect',
    );

    this.reconnectTimeout = setTimeout(async () => {
      if (this.stopped) return;

      try {
        // Always obtain a fresh listen key — old one may have expired during downtime
        this.listenKey = await this.client.createListenKey();
        logger.info(
          { listenKey: this.redactKey(this.listenKey) },
          'New listen key acquired for reconnect',
        );
        await this.connect();
      } catch (err) {
        logger.error({ err }, 'WS reconnect failed — retrying');
        this.scheduleReconnect();
      }
    }, delay);
  }

  // ──────────────────────────────────────────
  // HEARTBEAT (PING / PONG)
  // ──────────────────────────────────────────

  private startPing(): void {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.lastPingSentAt = Date.now();
        this.ws.ping();
        logger.debug({ sentAt: this.lastPingSentAt }, 'WS ping sent');
      }
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // ──────────────────────────────────────────
  // KEEPALIVE
  // ──────────────────────────────────────────

  private startKeepalive(): void {
    this.keepaliveInterval = setInterval(async () => {
      if (!this.listenKey || this.stopped) return;
      try {
        await this.client.keepaliveListenKey(this.listenKey);
        logger.debug('Listen key keepalive sent');
      } catch (err) {
        logger.error({ err }, 'Listen key keepalive failed — reconnect will refresh key');
      }
    }, KEEPALIVE_INTERVAL_MS);
  }

  // ──────────────────────────────────────────
  // DISPATCH
  // ──────────────────────────────────────────

  private dispatch(msg: BinanceWsMessage): void {
    // Log execution reports at debug level for visibility
    if (msg.e === 'executionReport') {
      const r = msg as BinanceExecutionReport;
      logger.debug(
        {
          symbol: r.s,
          clientOrderId: r.c,
          execType: r.x,
          status: r.X,
          filledQty: r.z,
          price: r.L,
        },
        `WS executionReport: ${r.x} → ${r.X}`,
      );
    }

    if (msg.e === 'listenKeyExpired') {
      logger.warn('Listen key expired — reconnecting');
      this.ws?.close(1000, 'listenKeyExpired');
      // Close will trigger scheduleReconnect via the 'close' handler
      return;
    }

    for (const handler of this.handlers) {
      try {
        handler(msg);
      } catch (e) {
        logger.error({ error: e }, 'WS handler threw an error');
      }
    }
  }

  // ──────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────

  private clearTimers(): void {
    this.stopPing();

    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private redactKey(key: string): string {
    return key.length > 8 ? `${key.slice(0, 8)}...` : '***';
  }
}
