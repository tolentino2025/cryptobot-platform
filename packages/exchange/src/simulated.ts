// ═══════════════════════════════════════════════════════════════
// SimulatedAdapter — Exchange adapter for SIM mode
// Simulates order fills locally without any exchange connection
// ═══════════════════════════════════════════════════════════════

import { createLogger, generateRequestId } from '@cryptobot/core';
import {
  OrderStatus,
  type ExchangeOrderResponse,
  type ExchangeBalanceResponse,
  type ExchangeOpenOrder,
} from '@cryptobot/shared-types';
import type { IExchangeAdapter, PlaceOrderParams } from './interface.js';

const logger = createLogger('sim-adapter');

interface SimBalance {
  asset: string;
  free: number;
  locked: number;
}

interface SimOrder {
  clientOrderId: string;
  symbol: string;
  side: string;
  type: string;
  quantity: number;
  price: number | null;
  status: OrderStatus;
  filledQuantity: number;
  filledQuoteAmount: number;
  averagePrice: number | null;
  createdAt: number;
}

export class SimulatedAdapter implements IExchangeAdapter {
  readonly name = 'SIMULATED';
  readonly isSimulated = true;

  private balances: Map<string, SimBalance> = new Map();
  private orders: Map<string, SimOrder> = new Map();
  private connected = false;

  /** Set initial simulated balances */
  setBalances(balances: Array<{ asset: string; amount: number }>) {
    for (const b of balances) {
      this.balances.set(b.asset, { asset: b.asset, free: b.amount, locked: 0 });
    }
  }

  async connect(): Promise<void> {
    this.connected = true;
    // Default SIM balances if none set
    if (this.balances.size === 0) {
      this.balances.set('USDT', { asset: 'USDT', free: 10000, locked: 0 });
      this.balances.set('BTC', { asset: 'BTC', free: 0, locked: 0 });
    }
    logger.info('Simulated adapter connected');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    logger.info('Simulated adapter disconnected');
  }

  async placeOrder(params: PlaceOrderParams): Promise<ExchangeOrderResponse> {
    const orderId = `sim_${generateRequestId()}`;
    const fillPrice = params.price ?? 0; // In SIM, we'd use last known price

    // Simulate instant fill for market orders, or fill at limit price
    const simOrder: SimOrder = {
      clientOrderId: params.clientOrderId,
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      quantity: params.quantity,
      price: params.price,
      status: OrderStatus.FILLED,
      filledQuantity: params.quantity,
      filledQuoteAmount: params.quantity * fillPrice,
      averagePrice: fillPrice,
      createdAt: Date.now(),
    };

    this.orders.set(orderId, simOrder);

    // Update simulated balances
    this.updateBalancesForFill(params, fillPrice);

    logger.info(
      { orderId, symbol: params.symbol, side: params.side, qty: params.quantity, price: fillPrice },
      'SIM order filled',
    );

    return {
      success: true,
      exchangeOrderId: orderId,
      status: OrderStatus.FILLED,
      filledQuantity: params.quantity,
      filledQuoteAmount: params.quantity * fillPrice,
      averagePrice: fillPrice,
      errorCode: null,
      errorMessage: null,
      timestamp: Date.now(),
      raw: { simulated: true },
    };
  }

  private updateBalancesForFill(params: PlaceOrderParams, price: number) {
    const quoteBalance = this.balances.get('USDT') ?? { asset: 'USDT', free: 0, locked: 0 };
    const baseAsset = params.symbol.replace('USDT', '');
    const baseBalance = this.balances.get(baseAsset) ?? { asset: baseAsset, free: 0, locked: 0 };

    if (params.side === 'BUY') {
      quoteBalance.free -= params.quantity * price;
      baseBalance.free += params.quantity;
    } else {
      quoteBalance.free += params.quantity * price;
      baseBalance.free -= params.quantity;
    }

    this.balances.set('USDT', quoteBalance);
    this.balances.set(baseAsset, baseBalance);
  }

  async cancelOrder(_symbol: string, exchangeOrderId: string): Promise<ExchangeOrderResponse> {
    const order = this.orders.get(exchangeOrderId);
    if (order) {
      order.status = OrderStatus.CANCELLED;
    }
    return {
      success: true,
      exchangeOrderId,
      status: OrderStatus.CANCELLED,
      filledQuantity: 0,
      filledQuoteAmount: 0,
      averagePrice: null,
      errorCode: null,
      errorMessage: null,
      timestamp: Date.now(),
      raw: { simulated: true },
    };
  }

  async getOrderStatus(_symbol: string, exchangeOrderId: string): Promise<ExchangeOrderResponse> {
    const order = this.orders.get(exchangeOrderId);
    return {
      success: !!order,
      exchangeOrderId,
      status: order?.status ?? OrderStatus.FAILED,
      filledQuantity: order?.filledQuantity ?? 0,
      filledQuoteAmount: order?.filledQuoteAmount ?? 0,
      averagePrice: order?.averagePrice ?? null,
      errorCode: order ? null : 'NOT_FOUND',
      errorMessage: order ? null : 'Order not found in simulator',
      timestamp: Date.now(),
      raw: { simulated: true },
    };
  }

  async getOpenOrders(_symbol: string): Promise<ExchangeOpenOrder[]> {
    return [];
  }

  async getBalances(): Promise<ExchangeBalanceResponse[]> {
    return Array.from(this.balances.values()).map((b) => ({
      asset: b.asset,
      free: b.free,
      locked: b.locked,
      total: b.free + b.locked,
    }));
  }

  async isHealthy(): Promise<boolean> {
    return this.connected;
  }

  async getServerTime(): Promise<number> {
    return Date.now();
  }
}
