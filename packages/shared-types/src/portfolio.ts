// ═══════════════════════════════════════════════════════════════
// Portfolio Types
// Position, balance, PnL types
// ═══════════════════════════════════════════════════════════════

import { PositionStatus, ExitReason } from './enums.js';

/** Active or closed position */
export interface Position {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  status: PositionStatus;
  /** Entry details */
  entryOrderId: string;
  entryPrice: number;          // Average entry price
  quantity: number;             // Base asset quantity
  notional: number;             // Entry notional (quote)
  /** Current mark-to-market (updated live for open positions) */
  currentPrice: number | null;
  unrealizedPnl: number | null;
  unrealizedPnlPercent: number | null;
  /** Exit details (filled when closed) */
  exitOrderId: string | null;
  exitPrice: number | null;
  exitReason: ExitReason | null;
  realizedPnl: number | null;
  realizedPnlPercent: number | null;
  /** Commission total */
  totalCommission: number;
  /** Timing */
  openedAt: Date;
  closedAt: Date | null;
  /** Time position was held in seconds */
  holdingTimeSec: number | null;
  /** Reference to the decision */
  decisionId: string;
}

/** Balance snapshot */
export interface Balance {
  asset: string;
  free: number;
  locked: number;
  total: number;
  /** Estimated value in quote currency (USDT) */
  estimatedValue: number;
  updatedAt: Date;
}

/** PnL snapshot — periodic summary */
export interface PnlSnapshot {
  id: string;
  /** Period type */
  period: 'TRADE' | 'HOURLY' | 'DAILY' | 'WEEKLY';
  /** Period identifier (e.g., trade ID, date string) */
  periodKey: string;
  /** Realized PnL in this period */
  realizedPnl: number;
  /** Unrealized PnL at snapshot time */
  unrealizedPnl: number;
  /** Total PnL */
  totalPnl: number;
  /** Number of trades */
  tradeCount: number;
  /** Win rate */
  winCount: number;
  lossCount: number;
  /** Total commission paid */
  totalCommission: number;
  /** Best and worst trade */
  bestTradePnl: number;
  worstTradePnl: number;
  createdAt: Date;
}

/** Portfolio summary for dashboard */
export interface PortfolioSummary {
  totalEquity: number;
  availableBalance: number;
  lockedBalance: number;
  /** All position notionals combined */
  totalExposure: number;
  /** Exposure as percentage of equity */
  exposurePercent: number;
  openPositions: Position[];
  /** Today's PnL */
  dailyPnl: number;
  dailyPnlPercent: number;
  /** Weekly PnL */
  weeklyPnl: number;
  /** Total realized PnL since inception */
  totalRealizedPnl: number;
  /** Today's trade count */
  dailyTradeCount: number;
  /** Consecutive losses counter */
  consecutiveLosses: number;
  updatedAt: Date;
}

/** Reconciliation result */
export interface ReconciliationResult {
  success: boolean;
  /** Positions that match */
  matchedPositions: number;
  /** Positions found locally but not on exchange */
  orphanedLocal: string[];
  /** Positions found on exchange but not locally */
  unexpectedRemote: string[];
  /** Balance discrepancies */
  balanceDiscrepancies: Array<{
    asset: string;
    localBalance: number;
    exchangeBalance: number;
    difference: number;
  }>;
  /** Whether safe mode should be activated */
  requiresSafeMode: boolean;
  timestamp: Date;
}
