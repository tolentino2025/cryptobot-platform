// ═══════════════════════════════════════════════════════════════
// BinanceAdapter — IExchangeAdapter implementation for Binance
// Wraps BinanceClient into the standard adapter interface
// Implementation: ETAPA 3
// ═══════════════════════════════════════════════════════════════

import { createLogger } from '@cryptobot/core';
import {
  type ExchangeOrderResponse,
  type ExchangeBalanceResponse,
  type ExchangeOpenOrder,
} from '@cryptobot/shared-types';
import type { IExchangeAdapter, PlaceOrderParams } from '../interface.js';
import { BinanceClient, type BinanceClientConfig } from './client.js';

const logger = createLogger('binance-adapter');

export class BinanceAdapter implements IExchangeAdapter {
  readonly name: string;
  readonly isSimulated = false;

  private client: BinanceClient;

  constructor(config: BinanceClientConfig) {
    this.client = new BinanceClient(config);
    this.name = config.testnet ? 'BINANCE_TESTNET' : 'BINANCE_LIVE';
  }

  async connect(): Promise<void> {
    logger.info({ adapter: this.name }, 'Connecting to Binance...');
    // TODO: Etapa 3 — verify connectivity, sync time, load exchange info
  }

  async disconnect(): Promise<void> {
    logger.info({ adapter: this.name }, 'Disconnecting from Binance');
  }

  async placeOrder(_params: PlaceOrderParams): Promise<ExchangeOrderResponse> {
    // TODO: Etapa 3 — implement with BinanceClient
    throw new Error('BinanceAdapter.placeOrder not implemented — Etapa 3');
  }

  async cancelOrder(_symbol: string, _exchangeOrderId: string): Promise<ExchangeOrderResponse> {
    throw new Error('BinanceAdapter.cancelOrder not implemented — Etapa 3');
  }

  async getOrderStatus(_symbol: string, _exchangeOrderId: string): Promise<ExchangeOrderResponse> {
    throw new Error('BinanceAdapter.getOrderStatus not implemented — Etapa 3');
  }

  async getOpenOrders(_symbol: string): Promise<ExchangeOpenOrder[]> {
    throw new Error('BinanceAdapter.getOpenOrders not implemented — Etapa 3');
  }

  async getBalances(): Promise<ExchangeBalanceResponse[]> {
    throw new Error('BinanceAdapter.getBalances not implemented — Etapa 3');
  }

  async isHealthy(): Promise<boolean> {
    return this.client.ping();
  }

  async getServerTime(): Promise<number> {
    return Date.now(); // TODO: Etapa 3
  }
}
