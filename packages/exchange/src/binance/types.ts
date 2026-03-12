// ═══════════════════════════════════════════════════════════════
// Binance API Types — REST response shapes and WebSocket events
// ═══════════════════════════════════════════════════════════════

// ── REST ────────────────────────────────────────────────────────

export interface BinanceServerTime {
  serverTime: number;
}

export interface BinanceSymbolFilter {
  filterType: string;
  minQty?: string;
  maxQty?: string;
  stepSize?: string;
  minPrice?: string;
  maxPrice?: string;
  tickSize?: string;
  minNotional?: string;
  applyToMarket?: boolean;
}

export interface BinanceSymbolInfo {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  baseAssetPrecision: number;
  quotePrecision: number;
  filters: BinanceSymbolFilter[];
}

export interface BinanceExchangeInfo {
  timezone: string;
  serverTime: number;
  symbols: BinanceSymbolInfo[];
}

export interface BinanceAccountBalance {
  asset: string;
  free: string;
  locked: string;
}

export interface BinanceAccountInfo {
  balances: BinanceAccountBalance[];
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
  updateTime: number;
}

export interface BinanceOrderFill {
  price: string;
  qty: string;
  commission: string;
  commissionAsset: string;
  tradeId: number;
}

/** Response from POST /api/v3/order with newOrderRespType=FULL */
export interface BinanceOrderResponse {
  symbol: string;
  orderId: number;
  orderListId: number;
  clientOrderId: string;
  transactTime: number;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: string;
  timeInForce: string;
  type: string;
  side: string;
  fills?: BinanceOrderFill[];
}

export interface BinanceCancelResponse {
  symbol: string;
  origClientOrderId: string;
  orderId: number;
  orderListId: number;
  clientOrderId: string;  // new cancel confirmation ID
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: string;
  timeInForce: string;
  type: string;
  side: string;
}

export interface BinanceQueryOrderResponse {
  symbol: string;
  orderId: number;
  orderListId: number;
  clientOrderId: string;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: string;
  timeInForce: string;
  type: string;
  side: string;
  stopPrice: string;
  icebergQty: string;
  time: number;
  updateTime: number;
  isWorking: boolean;
}

export type BinanceOpenOrder = BinanceQueryOrderResponse;

export interface BinanceListenKeyResponse {
  listenKey: string;
}

export interface BinanceApiError {
  code: number;
  msg: string;
}

// ── WebSocket user data stream ───────────────────────────────────

/**
 * Execution report — emitted on every order state change.
 * x = execution type (event that triggered change)
 * X = resulting order status
 */
export interface BinanceExecutionReport {
  e: 'executionReport';
  E: number;            // Event time
  s: string;            // Symbol
  c: string;            // Client order ID
  S: 'BUY' | 'SELL';   // Side
  o: string;            // Order type (LIMIT, MARKET, ...)
  f: string;            // Time in force
  q: string;            // Order quantity (base)
  p: string;            // Order price
  P: string;            // Stop price
  x: 'NEW' | 'CANCELED' | 'REPLACED' | 'REJECTED' | 'TRADE' | 'EXPIRED'; // Execution type
  X: string;            // Order status: NEW | PARTIALLY_FILLED | FILLED | CANCELED | REJECTED | EXPIRED
  r: string;            // Reject reason (NONE if not rejected)
  i: number;            // Exchange order ID
  l: string;            // Last executed quantity (this fill)
  z: string;            // Cumulative filled quantity
  L: string;            // Last executed price (this fill)
  n: string;            // Commission amount
  N: string | null;     // Commission asset
  T: number;            // Transaction time
  t: number;            // Trade ID (-1 if no fill)
  m: boolean;           // Is this fill a maker?
  Z: string;            // Cumulative quote asset transacted
  Y: string;            // Last quote asset transacted quantity
  Q: string;            // Quote order quantity
}

export interface BinanceBalanceUpdate {
  e: 'outboundAccountPosition';
  E: number;            // Event time
  u: number;            // Last account update time
  B: Array<{
    a: string;          // Asset
    f: string;          // Free
    l: string;          // Locked
  }>;
}

export interface BinanceListenKeyExpired {
  e: 'listenKeyExpired';
}

export type BinanceWsMessage =
  | BinanceExecutionReport
  | BinanceBalanceUpdate
  | BinanceListenKeyExpired;
