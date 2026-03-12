// ═══════════════════════════════════════════════════════════════
// BinanceAdapter — Full IExchangeAdapter for Binance Spot
//
// Architecture:
//   BinanceAdapter
//     ├── BinanceClient        REST: orders, account, stream keys
//     ├── BinanceWsManager     WS:   executionReport, balance updates
//     └── ExchangeFilterCache  Per-symbol LOT_SIZE, PRICE_FILTER, minNotional
//
// Order lifecycle:
//   placeOrder()
//     1. Validate filters (qty stepSize, price tickSize, minNotional)
//     2. POST /api/v3/order  → ACK response (orderId)
//     3. WS executionReport (x=NEW)    → order acknowledged
//     4. WS executionReport (x=TRADE)  → partial or full fill
//        - Emit eventBus 'exchange:fill' per fill
//     5. WS executionReport (x=FILLED) → fully filled
//     6. WS executionReport (x=CANCELED / REJECTED / EXPIRED)
//        - Emit eventBus 'exchange:order-terminal'
//
// Idempotency:
//   - Every order uses clientOrderId as the unique idempotency key
//   - cancelOrder() and getOrderStatus() query by origClientOrderId
//   - Safe to retry after crash: REST query recovers state from exchange
//
// Fill events emitted on eventBus:
//   'exchange:fill'  — { clientOrderId, exchangeOrderId, symbol, side,
//                        filledQty, price, commission, commissionAsset,
//                        cumFilledQty, isMaker, isFinalFill, tradeId }
//   'exchange:order-terminal' — { clientOrderId, status, reason }
// ═══════════════════════════════════════════════════════════════

import { createLogger, eventBus } from '@cryptobot/core';
import {
  OrderStatus,
  type ExchangeOrderResponse,
  type ExchangeBalanceResponse,
  type ExchangeOpenOrder,
  OrderSide,
  EntryType,
} from '@cryptobot/shared-types';
import type { IExchangeAdapter, PlaceOrderParams } from '../interface.js';
import { BinanceClient, BinanceApiException } from './client.js';
import type { BinanceClientConfig } from './client.js';
import { BinanceWsManager } from './websocket.js';
import {
  ExchangeFilterCache,
  parseFilters,
  validateOrder,
} from './filters.js';
import type {
  BinanceExecutionReport,
  BinanceOrderResponse,
  BinanceQueryOrderResponse,
} from './types.js';

const logger = createLogger('binance-adapter');

// ── Status mapping ────────────────────────────────────────────────

const BINANCE_STATUS_MAP: Record<string, OrderStatus> = {
  NEW:              OrderStatus.OPEN,
  PARTIALLY_FILLED: OrderStatus.PARTIALLY_FILLED,
  FILLED:           OrderStatus.FILLED,
  CANCELED:         OrderStatus.CANCELLED,
  PENDING_CANCEL:   OrderStatus.OPEN,  // transitional — still on book
  REJECTED:         OrderStatus.REJECTED,
  EXPIRED:          OrderStatus.EXPIRED,
};

function mapStatus(binanceStatus: string): OrderStatus {
  return BINANCE_STATUS_MAP[binanceStatus] ?? OrderStatus.FAILED;
}

// ── Adapter ───────────────────────────────────────────────────────

export class BinanceAdapter implements IExchangeAdapter {
  readonly name: string;
  readonly isSimulated = false;

  private readonly client: BinanceClient;
  private readonly ws: BinanceWsManager;
  private readonly filterCache = new ExchangeFilterCache();
  /** False when WS user data stream is unavailable (e.g. Binance testnet HTTP 410) */
  private wsAvailable = false;

  constructor(config: BinanceClientConfig) {
    this.client = new BinanceClient(config);
    this.ws = new BinanceWsManager(this.client, config.testnet);
    this.name = config.testnet ? 'BINANCE_TESTNET' : 'BINANCE_LIVE';
  }

  // ──────────────────────────────────────────
  // LIFECYCLE
  // ──────────────────────────────────────────

  async connect(): Promise<void> {
    logger.info({ adapter: this.name }, 'Connecting to Binance...');

    // 1. Verify connectivity
    const reachable = await this.client.ping();
    if (!reachable) {
      throw new Error(`${this.name}: exchange not reachable`);
    }

    // 2. Sync clock (prevents TIMESTAMP_OUTSIDE_RECVWINDOW rejections)
    await this.client.syncTime();

    // 3. Load exchange info and cache filters for all tradeable symbols
    await this.loadExchangeInfo();

    // 4. Start WebSocket user data stream (best-effort — testnet returns HTTP 410)
    try {
      await this.ws.start();
      this.ws.on((msg) => this.handleWsMessage(msg));
      this.wsAvailable = true;
      logger.info({ adapter: this.name }, 'WS user data stream connected');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('410') || msg.includes('Gone')) {
        logger.warn(
          { adapter: this.name },
          'WS user data stream unavailable (HTTP 410 — testnet limitation). Running REST-only.',
        );
      } else {
        throw err; // Re-throw unexpected WS errors
      }
    }

    logger.info(
      { adapter: this.name, filtersCached: this.filterCache.size(), wsAvailable: this.wsAvailable },
      'Binance connected',
    );
  }

  async disconnect(): Promise<void> {
    await this.ws.stop();
    logger.info({ adapter: this.name }, 'Binance disconnected');
  }

  // ──────────────────────────────────────────
  // FILTERS
  // ──────────────────────────────────────────

  private async loadExchangeInfo(symbol?: string): Promise<void> {
    const info = await this.client.getExchangeInfo(symbol);
    for (const sym of info.symbols) {
      if (sym.status !== 'TRADING') continue;
      const parsed = parseFilters(
        sym.symbol,
        sym.filters,
        sym.baseAssetPrecision,
        sym.quotePrecision,
      );
      this.filterCache.set(sym.symbol, parsed);
    }
    logger.debug(
      { count: this.filterCache.size(), symbol: symbol ?? 'all' },
      'Exchange filters loaded',
    );
  }

  /** Ensure filters are available for a symbol (lazy-loads if missing). */
  private async ensureFilters(symbol: string): Promise<void> {
    if (!this.filterCache.has(symbol)) {
      logger.info({ symbol }, 'Filters not cached — loading from exchangeInfo');
      await this.loadExchangeInfo(symbol);
    }
  }

  // ──────────────────────────────────────────
  // PLACE ORDER
  // ──────────────────────────────────────────

  async placeOrder(params: PlaceOrderParams): Promise<ExchangeOrderResponse> {
    await this.ensureFilters(params.symbol);
    const filters = this.filterCache.get(params.symbol);

    if (!filters) {
      return this.errorResponse(
        null,
        'FILTERS_NOT_FOUND',
        `No exchange filters found for ${params.symbol}`,
      );
    }

    const side = params.side === OrderSide.BUY ? 'BUY' : 'SELL';
    const type = params.type === EntryType.LIMIT ? 'LIMIT' : 'MARKET';

    // ── Filter validation ──
    const validation = validateOrder(filters, params.quantity, params.price, side);
    if (!validation.valid) {
      return this.errorResponse(
        null,
        'FILTER_VIOLATION',
        `Order rejected by exchange filters: ${validation.errors.join('; ')}`,
      );
    }

    const adjustedQty = validation.adjustedQty;
    const adjustedPrice = validation.adjustedPrice;

    logger.info(
      {
        symbol: params.symbol,
        side,
        type,
        qty: adjustedQty,
        price: adjustedPrice,
        clientOrderId: params.clientOrderId,
      },
      'Placing order',
    );

    try {
      const orderParams: Parameters<BinanceClient['newOrder']>[0] = {
        symbol:           params.symbol,
        side,
        type,
        quantity:         adjustedQty.toString(),
        newClientOrderId: params.clientOrderId,
        newOrderRespType: 'FULL',
      };

      if (type === 'LIMIT' && adjustedPrice !== null) {
        orderParams.price = adjustedPrice.toString();
        orderParams.timeInForce = 'GTC';
      }

      const res = await this.client.newOrder(orderParams);
      return this.mapOrderResponse(res);
    } catch (err) {
      return this.mapError(err);
    }
  }

  // ──────────────────────────────────────────
  // CANCEL ORDER
  // ──────────────────────────────────────────

  async cancelOrder(symbol: string, clientOrderId: string): Promise<ExchangeOrderResponse> {
    logger.info({ symbol, clientOrderId }, 'Cancelling order');

    try {
      const res = await this.client.cancelOrder({
        symbol,
        origClientOrderId: clientOrderId,
      });
      return {
        success: true,
        exchangeOrderId: String(res.orderId),
        status: mapStatus(res.status),
        filledQuantity: parseFloat(res.executedQty),
        filledQuoteAmount: parseFloat(res.cummulativeQuoteQty),
        averagePrice: parseFloat(res.executedQty) > 0
          ? parseFloat(res.cummulativeQuoteQty) / parseFloat(res.executedQty)
          : null,
        commission: 0,
        commissionAsset: 'BNB',
        errorCode: null,
        errorMessage: null,
        timestamp: Date.now(),
        raw: res as unknown as Record<string, unknown>,
      };
    } catch (err) {
      return this.mapError(err);
    }
  }

  // ──────────────────────────────────────────
  // GET ORDER STATUS
  // ──────────────────────────────────────────

  async getOrderStatus(symbol: string, clientOrderId: string): Promise<ExchangeOrderResponse> {
    try {
      const res = await this.client.getOrder({
        symbol,
        origClientOrderId: clientOrderId,
      });
      return this.mapQueryOrderResponse(res);
    } catch (err) {
      return this.mapError(err);
    }
  }

  // ──────────────────────────────────────────
  // GET OPEN ORDERS
  // ──────────────────────────────────────────

  async getOpenOrders(symbol: string): Promise<ExchangeOpenOrder[]> {
    try {
      const orders = await this.client.getOpenOrders(symbol || undefined);
      return orders.map((o) => ({
        exchangeOrderId: String(o.orderId),
        symbol: o.symbol,
        side: o.side === 'BUY' ? OrderSide.BUY : OrderSide.SELL,
        type: o.type === 'LIMIT' ? EntryType.LIMIT : EntryType.MARKET,
        price: parseFloat(o.price),
        quantity: parseFloat(o.origQty),
        filledQuantity: parseFloat(o.executedQty),
        status: o.status,
        timestamp: o.time,
      }));
    } catch (err) {
      logger.error({ err, symbol }, 'getOpenOrders failed');
      return [];
    }
  }

  // ──────────────────────────────────────────
  // GET BALANCES
  // ──────────────────────────────────────────

  async getBalances(): Promise<ExchangeBalanceResponse[]> {
    const account = await this.client.getAccountInfo();
    return account.balances
      .map((b) => ({
        asset: b.asset,
        free: parseFloat(b.free),
        locked: parseFloat(b.locked),
        total: parseFloat(b.free) + parseFloat(b.locked),
      }))
      .filter((b) => b.total > 0);
  }

  // ──────────────────────────────────────────
  // HEALTH / SERVER TIME
  // ──────────────────────────────────────────

  async isHealthy(): Promise<boolean> {
    return this.client.ping();
  }

  async getServerTime(): Promise<number> {
    return this.client.getServerTime();
  }

  // ──────────────────────────────────────────
  // WS EVENT HANDLER
  // ──────────────────────────────────────────

  private handleWsMessage(msg: { e: string }): void {
    if (msg.e === 'executionReport') {
      this.handleExecutionReport(msg as BinanceExecutionReport);
    }
    // outboundAccountPosition updates are logged but balance is read via REST
  }

  private handleExecutionReport(r: BinanceExecutionReport): void {
    const isFill = r.x === 'TRADE';
    const isTerminal = ['FILLED', 'CANCELED', 'REJECTED', 'EXPIRED'].includes(r.X);
    const isFinalFill = isFill && r.X === 'FILLED';

    if (isFill) {
      const filledQty = parseFloat(r.l);
      const price = parseFloat(r.L);
      const commission = parseFloat(r.n);

      if (filledQty > 0) {
        const fillEvent = {
          clientOrderId:  r.c,
          exchangeOrderId: String(r.i),
          symbol:          r.s,
          side:            r.S === 'BUY' ? OrderSide.BUY : OrderSide.SELL,
          filledQty,
          price,
          commission,
          commissionAsset: r.N ?? '',
          cumFilledQty:   parseFloat(r.z),
          cumQuoteQty:    parseFloat(r.Z),
          isMaker:         r.m,
          isFinalFill,
          tradeId:         r.t,
          transactTime:    r.T,
        };

        logger.info(
          {
            symbol: r.s,
            clientOrderId: r.c,
            filledQty,
            price,
            isFinalFill,
          },
          `WS fill: ${isFinalFill ? 'FINAL' : 'PARTIAL'} ${r.S} ${r.s}`,
        );

        eventBus.emit('exchange:fill', fillEvent);
      }
    }

    if (isTerminal && !isFill) {
      eventBus.emit('exchange:order-terminal', {
        clientOrderId:  r.c,
        exchangeOrderId: String(r.i),
        symbol:          r.s,
        status:          mapStatus(r.X),
        reason:          r.r !== 'NONE' ? r.r : null,
      });
    }
  }

  // ──────────────────────────────────────────
  // RESPONSE MAPPING
  // ──────────────────────────────────────────

  private mapOrderResponse(res: BinanceOrderResponse): ExchangeOrderResponse {
    const executedQty = parseFloat(res.executedQty);
    const cumQuoteQty = parseFloat(res.cummulativeQuoteQty);

    // For MARKET orders, fills[] contain individual fill prices.
    // For LIMIT/ACK, fills may be empty — average from totals.
    let avgPrice: number | null = null;
    if (executedQty > 0) {
      avgPrice = cumQuoteQty / executedQty;
    }

    // Sum commission across all fills (present only for FULL response type)
    const commission = res.fills?.reduce((s, f) => s + parseFloat(f.commission), 0) ?? 0;
    const commissionAsset = res.fills?.[0]?.commissionAsset ?? 'BNB';

    return {
      success: true,
      exchangeOrderId: String(res.orderId),
      status: mapStatus(res.status),
      filledQuantity: executedQty,
      filledQuoteAmount: cumQuoteQty,
      averagePrice: avgPrice,
      commission,
      commissionAsset,
      errorCode: null,
      errorMessage: null,
      timestamp: res.transactTime,
      raw: res as unknown as Record<string, unknown>,
    };
  }

  private mapQueryOrderResponse(res: BinanceQueryOrderResponse): ExchangeOrderResponse {
    const executedQty = parseFloat(res.executedQty);
    const cumQuoteQty = parseFloat(res.cummulativeQuoteQty);
    const avgPrice = executedQty > 0 ? cumQuoteQty / executedQty : null;

    return {
      success: true,
      exchangeOrderId: String(res.orderId),
      status: mapStatus(res.status),
      filledQuantity: executedQty,
      filledQuoteAmount: cumQuoteQty,
      averagePrice: avgPrice,
      commission: 0, // Query response doesn't include fill details — commission tracked via WS fills
      commissionAsset: 'BNB',
      errorCode: null,
      errorMessage: null,
      timestamp: res.updateTime,
      raw: res as unknown as Record<string, unknown>,
    };
  }

  private mapError(err: unknown): ExchangeOrderResponse {
    if (err instanceof BinanceApiException) {
      logger.error(
        { code: err.code, msg: err.binanceMessage, http: err.httpStatus },
        'Binance API error',
      );
      return this.errorResponse(
        null,
        String(err.code),
        err.binanceMessage,
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ error: msg }, 'Unexpected exchange error');
    return this.errorResponse(null, 'UNKNOWN_ERROR', msg);
  }

  private errorResponse(
    exchangeOrderId: string | null,
    errorCode: string,
    errorMessage: string,
  ): ExchangeOrderResponse {
    return {
      success: false,
      exchangeOrderId,
      status: OrderStatus.FAILED,
      filledQuantity: 0,
      filledQuoteAmount: 0,
      averagePrice: null,
      commission: 0,
      commissionAsset: 'BNB',
      errorCode,
      errorMessage,
      timestamp: Date.now(),
      raw: {},
    };
  }
}
