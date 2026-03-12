// ═══════════════════════════════════════════════════════════════
// IExchangeAdapter — Standard interface for all exchange adapters
// Implementations: SimulatedAdapter, BinanceAdapter, (future) CoinbaseAdapter
// ═══════════════════════════════════════════════════════════════

import type {
  ExchangeOrderResponse,
  ExchangeBalanceResponse,
  ExchangeOpenOrder,
  OrderSide,
  EntryType,
} from '@cryptobot/shared-types';

/** Standardized order placement parameters */
export interface PlaceOrderParams {
  symbol: string;
  side: OrderSide;
  type: EntryType;
  quantity: number;
  price: number | null;
  clientOrderId: string;
}

/** Exchange adapter interface — all adapters must implement this */
export interface IExchangeAdapter {
  /** Unique adapter name */
  readonly name: string;

  /** Whether this is a simulated adapter */
  readonly isSimulated: boolean;

  /** Initialize connection */
  connect(): Promise<void>;

  /** Disconnect gracefully */
  disconnect(): Promise<void>;

  /** Place an order */
  placeOrder(params: PlaceOrderParams): Promise<ExchangeOrderResponse>;

  /** Cancel an order by exchange order ID */
  cancelOrder(symbol: string, exchangeOrderId: string): Promise<ExchangeOrderResponse>;

  /** Get current status of an order */
  getOrderStatus(symbol: string, exchangeOrderId: string): Promise<ExchangeOrderResponse>;

  /** Get all open orders for a symbol */
  getOpenOrders(symbol: string): Promise<ExchangeOpenOrder[]>;

  /** Get account balances */
  getBalances(): Promise<ExchangeBalanceResponse[]>;

  /** Check if the connection is healthy */
  isHealthy(): Promise<boolean>;

  /** Get server time (for sync check) */
  getServerTime(): Promise<number>;
}
