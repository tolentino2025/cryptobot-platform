// ═══════════════════════════════════════════════════════════════
// BinanceClient — Low-level Binance API client
// Handles REST calls, signature, rate limiting
// Implementation: ETAPA 3
// ═══════════════════════════════════════════════════════════════

import { createLogger } from '@cryptobot/core';

const logger = createLogger('binance-client');

export interface BinanceClientConfig {
  apiKey: string;
  apiSecret: string;
  testnet: boolean;
}

export class BinanceClient {
  // TODO: Etapa 3 — add private config and baseUrl fields when implementing methods

  constructor(config: BinanceClientConfig) {
    logger.info({ testnet: config.testnet }, 'BinanceClient initialized');
  }

  // TODO: Implement in Etapa 3
  // - signRequest(params): signed request with HMAC-SHA256
  // - get(endpoint, params): GET request
  // - post(endpoint, params): POST request
  // - delete(endpoint, params): DELETE request
  // - getServerTime(): server time for sync
  // - getExchangeInfo(): trading rules and symbol info
  // - getAccountInfo(): account balances
  // - newOrder(params): place a new order
  // - cancelOrder(params): cancel order
  // - getOrder(params): query order status
  // - getOpenOrders(symbol): get all open orders

  async ping(): Promise<boolean> {
    logger.info('BinanceClient.ping() — stub');
    return true;
  }
}
