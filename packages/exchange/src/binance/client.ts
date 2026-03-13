// ═══════════════════════════════════════════════════════════════
// BinanceClient — Low-level Binance REST API client
//
// Responsibilities:
//   - HMAC-SHA256 request signing
//   - Server time synchronization (timeOffset)
//   - Signed GET / POST / DELETE requests
//   - All Binance REST endpoints used by the adapter
//
// Usage notes:
//   - Call syncTime() once before placing any orders
//   - createListenKey() / keepaliveListenKey() / deleteListenKey()
//     are used by BinanceWsManager for the user data stream
// ═══════════════════════════════════════════════════════════════

import { createHmac } from 'node:crypto';
import { createLogger } from '@cryptobot/core';
import type {
  BinanceServerTime,
  BinanceExchangeInfo,
  BinanceAccountInfo,
  BinanceOrderResponse,
  BinanceCancelResponse,
  BinanceQueryOrderResponse,
  BinanceOpenOrder,
  BinanceListenKeyResponse,
  BinanceApiError,
} from './types.js';

const logger = createLogger('binance-client');

const REST_BASE_TESTNET = 'https://testnet.binance.vision';
const REST_BASE_LIVE    = 'https://api.binance.com';

// ── Config ───────────────────────────────────────────────────────

export interface BinanceClientConfig {
  apiKey: string;
  apiSecret: string;
  testnet: boolean;
  /** Max age of a request (ms) — Binance rejects if > this. Default 5000. */
  recvWindow?: number;
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

// ── Exception ────────────────────────────────────────────────────

export class BinanceApiException extends Error {
  constructor(
    public readonly code: number,
    public readonly binanceMessage: string,
    public readonly httpStatus: number,
  ) {
    super(`Binance API error ${code}: ${binanceMessage} (HTTP ${httpStatus})`);
    this.name = 'BinanceApiException';
  }
}

// ── Client ───────────────────────────────────────────────────────

export class BinanceClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly recvWindow: number;
  /** Offset in ms: exchange_time - local_time. Added to every timestamp. */
  private timeOffset = 0;

  constructor(config: BinanceClientConfig) {
    this.baseUrl = config.testnet ? REST_BASE_TESTNET : REST_BASE_LIVE;
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.recvWindow = config.recvWindow ?? 5_000;
    logger.info(
      { testnet: config.testnet, base: this.baseUrl },
      'BinanceClient initialized',
    );
  }

  // ─────────────────────────────────────────────────────────────
  // TIME SYNC
  // ─────────────────────────────────────────────────────────────

  /**
   * Sync local clock with exchange time.
   * Must be called once before any signed requests to avoid
   * TIMESTAMP_OUTSIDE_RECVWINDOW rejections.
   */
  async syncTime(): Promise<void> {
    const localBefore = Date.now();
    const { serverTime } = await this.publicGet<BinanceServerTime>('/api/v3/time');
    const localAfter = Date.now();
    const localMid = Math.round((localBefore + localAfter) / 2);
    this.timeOffset = serverTime - localMid;
    logger.info({ timeOffsetMs: this.timeOffset, serverTime }, 'Time synced with exchange');
  }

  /** Current exchange-adjusted timestamp */
  timestamp(): number {
    return Date.now() + this.timeOffset;
  }

  get currentTimeOffset(): number {
    return this.timeOffset;
  }

  // ─────────────────────────────────────────────────────────────
  // SIGNING
  // ─────────────────────────────────────────────────────────────

  private sign(payload: string): string {
    return createHmac('sha256', this.apiSecret).update(payload).digest('hex');
  }

  private buildSignedQs(params: Record<string, string | number | boolean>): string {
    const entries: [string, string][] = Object.entries(params).map(([k, v]) => [k, String(v)]);
    const base = new URLSearchParams(entries).toString();
    const withTimestamp = `${base}&timestamp=${this.timestamp()}&recvWindow=${this.recvWindow}`;
    const signature = this.sign(withTimestamp);
    return `${withTimestamp}&signature=${signature}`;
  }

  // ─────────────────────────────────────────────────────────────
  // HTTP METHODS
  // ─────────────────────────────────────────────────────────────

  private async rawRequest<T>(
    method: HttpMethod,
    path: string,
    queryString: string,
    _isPublic: boolean,
  ): Promise<T> {
    const headers: Record<string, string> = {
      'X-MBX-APIKEY': this.apiKey,
    };

    let url: string;
    let body: string | undefined;

    if (method === 'GET' || method === 'DELETE') {
      // Params go in the query string
      url = queryString
        ? `${this.baseUrl}${path}?${queryString}`
        : `${this.baseUrl}${path}`;
    } else {
      // POST / PUT: Binance expects signed params in the request body
      url = `${this.baseUrl}${path}`;
      body = queryString;
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    const res = await fetch(url, { method, headers, body });
    const text = await res.text();

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`Binance non-JSON response (HTTP ${res.status}): ${text}`);
    }

    if (!res.ok) {
      const err = parsed as BinanceApiError;
      throw new BinanceApiException(err.code ?? -1, err.msg ?? text, res.status);
    }

    return parsed as T;
  }

  // Convenience wrappers

  private async publicGet<T>(
    path: string,
    params: Record<string, string | number> = {},
  ): Promise<T> {
    const qs = Object.keys(params).length
      ? new URLSearchParams(
          Object.entries(params).map(([k, v]) => [k, String(v)]) as [string, string][],
        ).toString()
      : '';
    return this.rawRequest<T>('GET', path, qs, true);
  }

  private async signedGet<T>(
    path: string,
    params: Record<string, string | number | boolean> = {},
  ): Promise<T> {
    return this.signedRequest<T>('GET', path, params);
  }

  private async signedPost<T>(
    path: string,
    params: Record<string, string | number | boolean> = {},
  ): Promise<T> {
    return this.signedRequest<T>('POST', path, params);
  }

  private async signedDelete<T>(
    path: string,
    params: Record<string, string | number | boolean> = {},
  ): Promise<T> {
    return this.signedRequest<T>('DELETE', path, params);
  }

  private async signedRequest<T>(
    method: HttpMethod,
    path: string,
    params: Record<string, string | number | boolean>,
  ): Promise<T> {
    try {
      return await this.rawRequest<T>(method, path, this.buildSignedQs(params), false);
    } catch (error) {
      if (error instanceof BinanceApiException && error.code === -1021) {
        logger.warn({ path, method }, 'Timestamp out of sync — re-syncing exchange time and retrying once');
        await this.syncTime();
        return this.rawRequest<T>(method, path, this.buildSignedQs(params), false);
      }
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // PUBLIC ENDPOINTS
  // ─────────────────────────────────────────────────────────────

  async ping(): Promise<boolean> {
    try {
      await this.publicGet<Record<string, never>>('/api/v3/ping');
      return true;
    } catch {
      return false;
    }
  }

  async getServerTime(): Promise<number> {
    const { serverTime } = await this.publicGet<BinanceServerTime>('/api/v3/time');
    return serverTime;
  }

  /**
   * Load exchange trading rules for one symbol or all symbols.
   * Use symbol filter to reduce payload on testnet.
   */
  async getExchangeInfo(symbol?: string): Promise<BinanceExchangeInfo> {
    const params: Record<string, string> = symbol ? { symbol } : {};
    return this.publicGet<BinanceExchangeInfo>('/api/v3/exchangeInfo', params);
  }

  // ─────────────────────────────────────────────────────────────
  // PRIVATE / SIGNED ENDPOINTS
  // ─────────────────────────────────────────────────────────────

  async getAccountInfo(): Promise<BinanceAccountInfo> {
    return this.signedGet<BinanceAccountInfo>('/api/v3/account');
  }

  /**
   * Place a new order.
   * newOrderRespType=FULL ensures fill details are included in the response
   * (critical for MARKET orders that fill immediately).
   */
  async newOrder(params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    type: 'LIMIT' | 'MARKET';
    quantity: string;
    price?: string;
    newClientOrderId: string;
    timeInForce?: 'GTC' | 'IOC' | 'FOK';
    newOrderRespType?: 'ACK' | 'RESULT' | 'FULL';
  }): Promise<BinanceOrderResponse> {
    const p: Record<string, string | number | boolean> = {
      symbol:             params.symbol,
      side:               params.side,
      type:               params.type,
      quantity:           params.quantity,
      newClientOrderId:   params.newClientOrderId,
      newOrderRespType:   params.newOrderRespType ?? 'FULL',
    };

    if (params.type === 'LIMIT') {
      p['timeInForce'] = params.timeInForce ?? 'GTC';
      if (params.price) p['price'] = params.price;
    }

    return this.signedPost<BinanceOrderResponse>('/api/v3/order', p);
  }

  /**
   * Cancel an order by its original client order ID.
   * Using origClientOrderId (not orderId) ensures idempotency after crash/restart.
   */
  async cancelOrder(params: {
    symbol: string;
    origClientOrderId: string;
  }): Promise<BinanceCancelResponse> {
    return this.signedDelete<BinanceCancelResponse>('/api/v3/order', {
      symbol:              params.symbol,
      origClientOrderId:   params.origClientOrderId,
    });
  }

  /**
   * Query order status by client order ID.
   * Works even after restart (no in-memory state needed).
   */
  async getOrder(params: {
    symbol: string;
    origClientOrderId: string;
  }): Promise<BinanceQueryOrderResponse> {
    return this.signedGet<BinanceQueryOrderResponse>('/api/v3/order', {
      symbol:              params.symbol,
      origClientOrderId:   params.origClientOrderId,
    });
  }

  /** Get all open orders for a symbol (or all symbols if symbol omitted). */
  async getOpenOrders(symbol?: string): Promise<BinanceOpenOrder[]> {
    const params: Record<string, string> = symbol ? { symbol } : {};
    return this.signedGet<BinanceOpenOrder[]>('/api/v3/openOrders', params);
  }

  // ─────────────────────────────────────────────────────────────
  // USER DATA STREAM (used by BinanceWsManager)
  // ─────────────────────────────────────────────────────────────

  /** Create a new listen key for the user data stream. Valid for 60 minutes. */
  async createListenKey(): Promise<string> {
    // Note: this endpoint is NOT signed (no timestamp/signature needed)
    const res = await this.rawRequest<BinanceListenKeyResponse>(
      'POST', '/api/v3/userDataStream', '', true,
    );
    return res.listenKey;
  }

  /**
   * Extend listen key validity by 60 minutes.
   * Must be called every ~30 minutes to keep the stream alive.
   */
  async keepaliveListenKey(listenKey: string): Promise<void> {
    const qs = new URLSearchParams({ listenKey }).toString();
    await this.rawRequest<Record<string, never>>(
      'PUT', '/api/v3/userDataStream', qs, true,
    );
  }

  /** Close the user data stream. */
  async deleteListenKey(listenKey: string): Promise<void> {
    const qs = new URLSearchParams({ listenKey }).toString();
    await this.rawRequest<Record<string, never>>(
      'DELETE', '/api/v3/userDataStream', qs, true,
    );
  }
}
