// ═══════════════════════════════════════════════════════════════
// Order Types
// Order lifecycle types, requests, events, and fills
// ═══════════════════════════════════════════════════════════════

import { OrderSide, OrderStatus, EntryType } from './enums.js';

/** Order request — created by Execution Orchestrator */
export interface OrderRequest {
  id: string;
  /** Idempotency key — prevents duplicate orders for same decision */
  idempotencyKey: string;
  /** Reference to the decision that triggered this order */
  decisionId: string;
  /** Reference to the risk review that approved it */
  riskReviewId: string;
  requestId: string;
  symbol: string;
  side: OrderSide;
  type: EntryType;
  /** Quantity in base asset */
  quantity: number;
  /** Limit price (for LIMIT orders) */
  price: number | null;
  /** Quote amount (for sizing reference) */
  quoteAmount: number;
  /** Stop loss price */
  stopPrice: number | null;
  /** Take profit price */
  takeProfitPrice: number | null;
  /** Maximum slippage allowed in bps */
  maxSlippageBps: number;
  /** Timeout for the order in seconds */
  timeoutSec: number;
  /** Purpose: ENTRY, EXIT_TP, EXIT_SL, EXIT_TIMEOUT, EXIT_INVALIDATION */
  purpose: OrderPurpose;
  status: OrderStatus;
  /** Exchange-assigned order ID (null until acknowledged) */
  exchangeOrderId: string | null;
  /** Number of retry attempts */
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type OrderPurpose =
  | 'ENTRY'
  | 'EXIT_TP'
  | 'EXIT_SL'
  | 'EXIT_TIMEOUT'
  | 'EXIT_INVALIDATION'
  | 'EXIT_MANUAL'
  | 'EXIT_KILL';

/** Order event — state transition record */
export interface OrderEvent {
  id: string;
  orderId: string;
  requestId: string;
  previousStatus: OrderStatus | null;
  newStatus: OrderStatus;
  /** Exchange response data (if any) */
  exchangeData: Record<string, unknown> | null;
  /** Error message (if failed/rejected) */
  errorMessage: string | null;
  timestamp: Date;
}

/** Fill — partial or complete execution */
export interface Fill {
  id: string;
  orderId: string;
  requestId: string;
  symbol: string;
  side: OrderSide;
  /** Executed price */
  price: number;
  /** Executed quantity (base asset) */
  quantity: number;
  /** Quote amount of this fill */
  quoteAmount: number;
  /** Commission paid */
  commission: number;
  /** Commission asset */
  commissionAsset: string;
  /** Exchange fill/trade ID */
  exchangeTradeId: string;
  /** Whether this is a maker fill */
  isMaker: boolean;
  timestamp: Date;
}

/** Order summary for dashboard display */
export interface OrderSummary {
  id: string;
  symbol: string;
  side: OrderSide;
  type: EntryType;
  quantity: number;
  price: number | null;
  status: OrderStatus;
  purpose: OrderPurpose;
  filledQuantity: number;
  filledQuoteAmount: number;
  averageFillPrice: number | null;
  exchangeOrderId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Exchange adapter standardized order response */
export interface ExchangeOrderResponse {
  success: boolean;
  exchangeOrderId: string | null;
  status: OrderStatus;
  filledQuantity: number;
  filledQuoteAmount: number;
  averagePrice: number | null;
  /** Total commission paid across all fills (in commissionAsset units) */
  commission: number;
  /** Asset used for commission payment (e.g. BNB, USDT, BTC) */
  commissionAsset: string;
  errorCode: string | null;
  errorMessage: string | null;
  timestamp: number;
  raw: Record<string, unknown>;
}

/** Exchange adapter standardized balance response */
export interface ExchangeBalanceResponse {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

/** Exchange adapter standardized open orders response */
export interface ExchangeOpenOrder {
  exchangeOrderId: string;
  symbol: string;
  side: OrderSide;
  type: EntryType;
  price: number;
  quantity: number;
  filledQuantity: number;
  status: string;
  timestamp: number;
}
