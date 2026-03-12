// ═══════════════════════════════════════════════════════════════
// Test Mocks — Mock implementations for testing
// ═══════════════════════════════════════════════════════════════

import type { IExchangeAdapter, PlaceOrderParams } from '@cryptobot/exchange';
import {
  OrderStatus,
  type ExchangeOrderResponse,
  type ExchangeBalanceResponse,
  type ExchangeOpenOrder,
} from '@cryptobot/shared-types';

/** Mock exchange adapter that records all calls */
export class MockExchangeAdapter implements IExchangeAdapter {
  readonly name = 'MOCK';
  readonly isSimulated = true;

  calls: Array<{ method: string; args: unknown[] }> = [];

  async connect() { this.calls.push({ method: 'connect', args: [] }); }
  async disconnect() { this.calls.push({ method: 'disconnect', args: [] }); }

  async placeOrder(params: PlaceOrderParams): Promise<ExchangeOrderResponse> {
    this.calls.push({ method: 'placeOrder', args: [params] });
    return {
      success: true,
      exchangeOrderId: `mock_${Date.now()}`,
      status: OrderStatus.FILLED,
      filledQuantity: params.quantity,
      filledQuoteAmount: params.quantity * (params.price ?? 50000),
      averagePrice: params.price ?? 50000,
      errorCode: null,
      errorMessage: null,
      timestamp: Date.now(),
      raw: { mock: true },
    };
  }

  async cancelOrder(symbol: string, id: string): Promise<ExchangeOrderResponse> {
    this.calls.push({ method: 'cancelOrder', args: [symbol, id] });
    return {
      success: true, exchangeOrderId: id, status: OrderStatus.CANCELLED,
      filledQuantity: 0, filledQuoteAmount: 0, averagePrice: null,
      errorCode: null, errorMessage: null, timestamp: Date.now(), raw: {},
    };
  }

  async getOrderStatus(symbol: string, id: string): Promise<ExchangeOrderResponse> {
    this.calls.push({ method: 'getOrderStatus', args: [symbol, id] });
    return {
      success: true, exchangeOrderId: id, status: OrderStatus.FILLED,
      filledQuantity: 0, filledQuoteAmount: 0, averagePrice: null,
      errorCode: null, errorMessage: null, timestamp: Date.now(), raw: {},
    };
  }

  async getOpenOrders(_symbol: string): Promise<ExchangeOpenOrder[]> { return []; }

  async getBalances(): Promise<ExchangeBalanceResponse[]> {
    return [{ asset: 'USDT', free: 10000, locked: 0, total: 10000 }];
  }

  async isHealthy(): Promise<boolean> { return true; }
  async getServerTime(): Promise<number> { return Date.now(); }

  /** Reset recorded calls */
  reset() { this.calls = []; }
}
