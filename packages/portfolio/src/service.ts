// ═══════════════════════════════════════════════════════════════
// PortfolioService — Positions, balances, PnL, reconciliation
// Provides reliable state to Risk Engine and Dashboard
// ═══════════════════════════════════════════════════════════════

import { createLogger, getRedis } from '@cryptobot/core';
import type { PrismaClient } from '@prisma/client';
import type { IExchangeAdapter } from '@cryptobot/exchange';
import {
  PositionStatus,
  ReconciliationStatus,
  type PortfolioSummary,
  type Position,
  type Balance,
  type ReconciliationResult,
  type RiskState,
  type TradeLifecycle,
} from '@cryptobot/shared-types';

const logger = createLogger('portfolio');

// Redis keys
const KEY_DAILY_PNL = 'risk:daily_pnl';
const KEY_WEEKLY_PNL = 'risk:weekly_pnl';
const KEY_TRADES_HOUR = 'risk:trades_hour';
const KEY_CONSEC_LOSSES = 'risk:consecutive_losses';
const KEY_COOLDOWN = 'risk:cooldown_until';
const KEY_LAST_TRADE = 'risk:last_trade_ts';

export class PortfolioService {
  constructor(
    private readonly db: PrismaClient,
    private readonly adapter: IExchangeAdapter,
  ) {}

  /** Get current portfolio summary */
  async getSummary(): Promise<PortfolioSummary> {
    const [openPositions, balancesRaw, dailyPnl, weeklyPnl, dailyTradeCount, consecutiveLosses] =
      await Promise.all([
        this.getOpenPositions(),
        this.getBalances(),
        this.getDailyPnl(),
        this.getWeeklyPnl(),
        this.getDailyTradeCount(),
        this.getConsecutiveLosses(),
      ]);

    const usdtBalance = balancesRaw.find((b) => b.asset === 'USDT');
    const totalEquity = usdtBalance?.total ?? 0;
    const availableBalance = usdtBalance?.free ?? 0;
    const lockedBalance = usdtBalance?.locked ?? 0;
    const totalExposure = openPositions.reduce((sum, p) => sum + p.notional, 0);
    const exposurePercent = totalEquity > 0 ? (totalExposure / totalEquity) * 100 : 0;
    const totalRealizedPnl = await this.getTotalRealizedPnl();

    return {
      totalEquity,
      availableBalance,
      lockedBalance,
      totalExposure,
      exposurePercent,
      openPositions,
      dailyPnl,
      dailyPnlPercent: totalEquity > 0 ? (dailyPnl / totalEquity) * 100 : 0,
      weeklyPnl,
      totalRealizedPnl,
      dailyTradeCount,
      consecutiveLosses,
      updatedAt: new Date(),
    };
  }

  /** Get open positions from DB (includes EXIT_PENDING positions) */
  async getOpenPositions(): Promise<Position[]> {
    const rows = await this.db.position.findMany({
      where: { status: { in: [PositionStatus.OPEN, PositionStatus.EXIT_PENDING] } },
      orderBy: { openedAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      symbol: r.symbol,
      side: r.side as 'LONG' | 'SHORT',
      status: r.status as PositionStatus,
      entryOrderId: r.entryOrderId,
      entryPrice: r.entryPrice,
      quantity: r.quantity,
      notional: r.notional,
      currentPrice: r.currentPrice,
      unrealizedPnl: r.unrealizedPnl,
      unrealizedPnlPercent: r.unrealizedPnlPercent,
      exitOrderId: r.exitOrderId,
      exitPrice: r.exitPrice,
      exitReason: r.exitReason as Position['exitReason'],
      realizedPnl: r.realizedPnl,
      realizedPnlPercent: r.realizedPnlPercent,
      totalCommission: r.totalCommission,
      openedAt: r.openedAt,
      closedAt: r.closedAt,
      holdingTimeSec: r.holdingTimeSec,
      decisionId: r.decisionId,
    }));
  }

  /** Get balances — from adapter + cache in DB */
  async getBalances(): Promise<Balance[]> {
    try {
      const exchangeBalances = await this.adapter.getBalances();
      // Persist snapshot
      for (const b of exchangeBalances) {
        if (b.total > 0) {
          await this.db.balance.create({
            data: {
              asset: b.asset,
              free: b.free,
              locked: b.locked,
              total: b.total,
              estimatedValue: b.total, // simplified for USDT base
            },
          });
        }
      }
      return exchangeBalances.map((b) => ({
        asset: b.asset,
        free: b.free,
        locked: b.locked,
        total: b.total,
        estimatedValue: b.total,
        updatedAt: new Date(),
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to fetch balances from exchange');
      // Fallback to last known balances from DB
      const latest = await this.db.balance.findMany({
        distinct: ['asset'],
        orderBy: { createdAt: 'desc' },
      });
      return latest.map((b) => ({
        asset: b.asset,
        free: b.free,
        locked: b.locked,
        total: b.total,
        estimatedValue: b.estimatedValue,
        updatedAt: b.createdAt,
      }));
    }
  }

  /** Update mark-to-market for open positions (includes EXIT_PENDING) */
  async updateMarkToMarket(symbol: string, currentPrice: number): Promise<void> {
    const openPositions = await this.db.position.findMany({
      where: { symbol, status: { in: [PositionStatus.OPEN, PositionStatus.EXIT_PENDING] } },
    });

    for (const pos of openPositions) {
      const pnl = pos.side === 'LONG'
        ? (currentPrice - pos.entryPrice) * pos.quantity
        : (pos.entryPrice - currentPrice) * pos.quantity;
      const pnlPercent = pos.entryPrice > 0
        ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100 * (pos.side === 'LONG' ? 1 : -1)
        : 0;

      await this.db.position.update({
        where: { id: pos.id },
        data: {
          currentPrice,
          unrealizedPnl: pnl,
          unrealizedPnlPercent: pnlPercent,
        },
      });
    }
  }

  /** Record a new open position */
  async openPosition(data: {
    symbol: string;
    side: 'LONG' | 'SHORT';
    entryOrderId: string;
    entryPrice: number;
    quantity: number;
    notional: number;
    decisionId: string;
    commission: number;
  }): Promise<string> {
    const pos = await this.db.position.create({
      data: {
        symbol: data.symbol,
        side: data.side,
        status: PositionStatus.OPEN,
        entryOrderId: data.entryOrderId,
        entryPrice: data.entryPrice,
        quantity: data.quantity,
        notional: data.notional,
        currentPrice: data.entryPrice,
        unrealizedPnl: 0,
        unrealizedPnlPercent: 0,
        totalCommission: data.commission,
        decisionId: data.decisionId,
      },
    });
    logger.info({ positionId: pos.id, symbol: data.symbol, side: data.side }, 'Position opened');
    return pos.id;
  }

  /** Mark position as exit pending */
  async setExitPending(positionId: string): Promise<void> {
    await this.db.position.update({
      where: { id: positionId },
      data: { status: PositionStatus.EXIT_PENDING, exitOrderSentAt: new Date() },
    });
  }

  /** Revert exit pending back to open (e.g. on order failure) */
  async setExitFailed(positionId: string): Promise<void> {
    await this.db.position.update({
      where: { id: positionId },
      data: { status: PositionStatus.OPEN, exitOrderSentAt: null },
    });
  }

  /** Close a position (accepts OPEN or EXIT_PENDING status) */
  async closePosition(
    positionId: string,
    exitOrderId: string,
    exitPrice: number,
    exitReason: string,
    commission: number,
  ): Promise<number> {
    const pos = await this.db.position.findUnique({ where: { id: positionId } });
    if (!pos) throw new Error(`Position ${positionId} not found`);

    const realizedPnl = pos.side === 'LONG'
      ? (exitPrice - pos.entryPrice) * pos.quantity
      : (pos.entryPrice - exitPrice) * pos.quantity;
    const realizedPnlPercent = pos.entryPrice > 0
      ? ((exitPrice - pos.entryPrice) / pos.entryPrice) * 100 * (pos.side === 'LONG' ? 1 : -1)
      : 0;
    const holdingTimeSec = Math.floor((Date.now() - pos.openedAt.getTime()) / 1000);

    await this.db.position.update({
      where: { id: positionId },
      data: {
        status: PositionStatus.CLOSED,
        exitOrderId,
        exitPrice,
        exitReason,
        realizedPnl,
        realizedPnlPercent,
        totalCommission: pos.totalCommission + commission,
        closedAt: new Date(),
        holdingTimeSec,
        currentPrice: exitPrice,
        unrealizedPnl: 0,
        unrealizedPnlPercent: 0,
      },
    });

    // Update risk counters in Redis — non-blocking: Redis failure must NOT prevent position close
    const pnlDelta = realizedPnl - commission;
    try {
      const redis = getRedis();
      await redis.incrbyfloat(KEY_DAILY_PNL, pnlDelta);
      await redis.incrbyfloat(KEY_WEEKLY_PNL, pnlDelta);
      await redis.set(KEY_LAST_TRADE, Date.now().toString());

      if (pnlDelta < 0) {
        await redis.incr(KEY_CONSEC_LOSSES);
      } else {
        await redis.set(KEY_CONSEC_LOSSES, '0');
      }
    } catch (redisError) {
      // Redis is unavailable — counters will be re-initialized from DB on next startup.
      // The position close itself is already persisted to DB, so this is safe to ignore.
      logger.error(
        { positionId, redisError, pnlDelta },
        'Redis unavailable when updating risk counters — counters will resync on restart',
      );
    }

    logger.info(
      { positionId, symbol: pos.symbol, realizedPnl, exitReason, holdingTimeSec },
      'Position closed',
    );
    return realizedPnl;
  }

  /** Get current risk state for the Risk Engine */
  async getRiskState(): Promise<RiskState> {
    // Fetch Redis counters with fallback to DB-computed values if Redis is unreachable
    let dailyPnl: string | null = null;
    let weeklyPnl: string | null = null;
    let tradesHour: string | null = null;
    let consecLosses: string | null = null;
    let cooldownUntil: string | null = null;
    let lastTrade: string | null = null;

    try {
      const redis = getRedis();
      [dailyPnl, weeklyPnl, tradesHour, consecLosses, cooldownUntil, lastTrade] = await Promise.all([
        redis.get(KEY_DAILY_PNL),
        redis.get(KEY_WEEKLY_PNL),
        redis.get(KEY_TRADES_HOUR),
        redis.get(KEY_CONSEC_LOSSES),
        redis.get(KEY_COOLDOWN),
        redis.get(KEY_LAST_TRADE),
      ]);
    } catch (redisError) {
      // Redis unavailable — fall back to DB for critical counters.
      // This is degraded mode: trades may still fire but risk limits use DB state.
      logger.error({ redisError }, 'Redis unavailable in getRiskState — using DB fallback');
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const [dailyResult, recentLosses] = await Promise.all([
        this.db.position.aggregate({
          where: { status: 'CLOSED', closedAt: { gte: today } },
          _sum: { realizedPnl: true },
        }),
        this.db.position.findMany({
          where: { status: 'CLOSED' },
          orderBy: { closedAt: 'desc' },
          take: 10,
          select: { realizedPnl: true },
        }),
      ]);
      dailyPnl = String(dailyResult._sum.realizedPnl ?? 0);
      let streak = 0;
      for (const p of recentLosses) { if ((p.realizedPnl ?? 0) < 0) streak++; else break; }
      consecLosses = String(streak);
    }

    const activeIncidents = await this.db.incident.count({ where: { isActive: true } });

    const openPositions = await this.db.position.findMany({
      where: { status: { in: [PositionStatus.OPEN, PositionStatus.EXIT_PENDING] } },
    });
    const totalExposure = openPositions.reduce((sum, p) => sum + p.notional, 0);

    const recentRejections = await this.db.orderRequest.count({
      where: {
        status: 'REJECTED',
        createdAt: { gte: new Date(Date.now() - 3600000) },
      },
    });

    return {
      dailyPnl: parseFloat(dailyPnl ?? '0'),
      weeklyPnl: parseFloat(weeklyPnl ?? '0'),
      tradesThisHour: parseInt(tradesHour ?? '0', 10),
      consecutiveLosses: parseInt(consecLosses ?? '0', 10),
      cooldownUntil: cooldownUntil ? parseInt(cooldownUntil, 10) : null,
      lastTradeTimestamp: lastTrade ? parseInt(lastTrade, 10) : null,
      openPositionCount: openPositions.length,
      totalExposure,
      activeIncidentCount: activeIncidents,
      recentRejectionCount: recentRejections,
    };
  }

  /** Increment trades this hour */
  async incrementTradesHour(): Promise<void> {
    try {
      const redis = getRedis();
      const count = await redis.incr(KEY_TRADES_HOUR);
      if (count === 1) {
        await redis.expire(KEY_TRADES_HOUR, 3600);
      }
    } catch (redisError) {
      logger.error({ redisError }, 'Redis unavailable — could not increment trades-per-hour counter');
    }
  }

  /** Set cooldown */
  async setCooldown(minutes: number): Promise<void> {
    const until = Date.now() + minutes * 60 * 1000;
    try {
      await getRedis().set(KEY_COOLDOWN, until.toString());
    } catch (redisError) {
      logger.error({ redisError, minutes }, 'Redis unavailable — could not set cooldown');
    }
    logger.warn({ cooldownMinutes: minutes, until: new Date(until).toISOString() }, 'Cooldown activated');
  }

  /** Reset daily PnL counters (call at midnight UTC) */
  async resetDaily(): Promise<void> {
    await getRedis().set(KEY_DAILY_PNL, '0');
    logger.info('Daily PnL counter reset');
  }

  /** Reset weekly PnL counters (call at week start) */
  async resetWeekly(): Promise<void> {
    await getRedis().set(KEY_WEEKLY_PNL, '0');
    logger.info('Weekly PnL counter reset');
  }

  /**
   * Seed Redis counters from DB on startup.
   * Prevents PnL/counter reset when the process restarts mid-day.
   */
  async initializeCountersFromDb(): Promise<void> {
    const redis = getRedis();

    // ── Daily PnL: sum of realized PnL for positions closed today ──
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const weekStart = new Date();
    weekStart.setUTCHours(0, 0, 0, 0);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay()); // Sunday

    const [dailyResult, weeklyResult, consecLosses] = await Promise.all([
      this.db.position.aggregate({
        where: { status: 'CLOSED', closedAt: { gte: today } },
        _sum: { realizedPnl: true },
      }),
      this.db.position.aggregate({
        where: { status: 'CLOSED', closedAt: { gte: weekStart } },
        _sum: { realizedPnl: true },
      }),
      // Count consecutive losses from the end of the closed positions list
      this.db.position.findMany({
        where: { status: 'CLOSED' },
        orderBy: { closedAt: 'desc' },
        take: 20,
        select: { realizedPnl: true },
      }),
    ]);

    const dailyPnl = dailyResult._sum.realizedPnl ?? 0;
    const weeklyPnl = weeklyResult._sum.realizedPnl ?? 0;

    // Only overwrite if Redis shows 0 (fresh start) or is lower precision
    const existingDaily = parseFloat((await redis.get(KEY_DAILY_PNL)) ?? '0');
    if (existingDaily === 0 && dailyPnl !== 0) {
      await redis.set(KEY_DAILY_PNL, dailyPnl.toString());
    }
    const existingWeekly = parseFloat((await redis.get(KEY_WEEKLY_PNL)) ?? '0');
    if (existingWeekly === 0 && weeklyPnl !== 0) {
      await redis.set(KEY_WEEKLY_PNL, weeklyPnl.toString());
    }

    // Recalculate consecutive losses from recent trade history
    let streak = 0;
    for (const pos of consecLosses) {
      if ((pos.realizedPnl ?? 0) < 0) streak++;
      else break;
    }
    const existingStreak = parseInt((await redis.get(KEY_CONSEC_LOSSES)) ?? '0', 10);
    if (existingStreak === 0 && streak > 0) {
      await redis.set(KEY_CONSEC_LOSSES, streak.toString());
    }

    logger.info(
      { dailyPnl, weeklyPnl, consecutiveLosses: streak },
      'Risk counters initialized from DB',
    );
  }

  /** Get daily PnL */
  private async getDailyPnl(): Promise<number> {
    return parseFloat((await getRedis().get(KEY_DAILY_PNL)) ?? '0');
  }

  /** Get weekly PnL */
  private async getWeeklyPnl(): Promise<number> {
    return parseFloat((await getRedis().get(KEY_WEEKLY_PNL)) ?? '0');
  }

  /** Get trades today count */
  private async getDailyTradeCount(): Promise<number> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return this.db.position.count({
      where: { openedAt: { gte: today } },
    });
  }

  /** Get consecutive losses */
  private async getConsecutiveLosses(): Promise<number> {
    return parseInt((await getRedis().get(KEY_CONSEC_LOSSES)) ?? '0', 10);
  }

  /** Get total realized PnL */
  private async getTotalRealizedPnl(): Promise<number> {
    const result = await this.db.position.aggregate({
      where: { status: PositionStatus.CLOSED },
      _sum: { realizedPnl: true },
    });
    return result._sum.realizedPnl ?? 0;
  }

  // ═══════════════════════════════════════════════════════
  // TRADE LIFECYCLE — Create, update, and query
  // ═══════════════════════════════════════════════════════

  /** Create a new lifecycle record when an entry fill is confirmed. */
  async createTradeLifecycle(data: {
    tradeId: string;
    decisionId: string;
    symbol: string;
    entryOrderId: string;
    entryQtyRequested: number;
    entryQtyFilled: number;
    avgEntryPrice: number;
    feesTotal: number;
    slippageBps: number;
    positionId: string;
  }): Promise<string> {
    const lc = await this.db.tradeLifecycle.create({
      data: {
        tradeId: data.tradeId,
        decisionId: data.decisionId,
        symbol: data.symbol,
        entryOrderIds: [data.entryOrderId],
        entryQtyRequested: data.entryQtyRequested,
        entryQtyFilled: data.entryQtyFilled,
        avgEntryPrice: data.avgEntryPrice,
        feesTotal: data.feesTotal,
        slippageBps: data.slippageBps,
        positionId: data.positionId,
        reconciliationStatus: ReconciliationStatus.PENDING,
      },
    });
    logger.info({ lifecycleId: lc.id, tradeId: data.tradeId, symbol: data.symbol }, 'TradeLifecycle created');
    return lc.id;
  }

  /**
   * Finalize a lifecycle record when the position closes.
   * Looks up by positionId — called immediately after closePosition().
   */
  async updateLifecycleOnExit(data: {
    positionId: string;
    exitOrderId: string;
    exitQtyFilled: number;
    avgExitPrice: number;
    feesAdded: number;
    realizedPnl: number;
    closedReason: string;
    positionSnapshot: Record<string, unknown>;
  }): Promise<void> {
    const lc = await this.db.tradeLifecycle.findFirst({
      where: { positionId: data.positionId },
    });
    if (!lc) {
      logger.warn({ positionId: data.positionId }, 'No TradeLifecycle found for closed position — skipping update');
      return;
    }

    await this.db.tradeLifecycle.update({
      where: { id: lc.id },
      data: {
        exitOrderIds: { push: data.exitOrderId },
        exitQtyRequested: data.exitQtyFilled, // market exit: requested ≈ filled
        exitQtyFilled: data.exitQtyFilled,
        avgExitPrice: data.avgExitPrice,
        feesTotal: lc.feesTotal + data.feesAdded,
        realizedPnl: data.realizedPnl,
        unrealizedPnl: 0,
        closedReason: data.closedReason,
        positionAfterTrade: data.positionSnapshot as unknown as import('@prisma/client').Prisma.InputJsonValue,
        reconciliationStatus: ReconciliationStatus.RECONCILED,
        lastReconciledAt: new Date(),
      },
    });
    logger.info({ lifecycleId: lc.id, realizedPnl: data.realizedPnl }, 'TradeLifecycle finalized');
  }

  /** Update unrealized PnL on an open lifecycle (called during mark-to-market). */
  async updateLifecycleUnrealized(positionId: string, unrealizedPnl: number): Promise<void> {
    await this.db.tradeLifecycle.updateMany({
      where: { positionId, reconciliationStatus: ReconciliationStatus.PENDING },
      data: { unrealizedPnl },
    });
  }

  /** List trade lifecycles — paginated. */
  async getTradeLifecycles(limit = 20, offset = 0): Promise<TradeLifecycle[]> {
    const rows = await this.db.tradeLifecycle.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
    return rows.map((r) => this.mapLifecycle(r));
  }

  /** Get single lifecycle by ID. */
  async getTradeLifecycleById(id: string): Promise<TradeLifecycle | null> {
    const row = await this.db.tradeLifecycle.findUnique({ where: { id } });
    return row ? this.mapLifecycle(row) : null;
  }

  /** Get total count of lifecycles by status. */
  async getLifecycleStats(): Promise<Record<ReconciliationStatus, number>> {
    const counts = await this.db.tradeLifecycle.groupBy({
      by: ['reconciliationStatus'],
      _count: { id: true },
    });
    const result = {
      [ReconciliationStatus.PENDING]: 0,
      [ReconciliationStatus.RECONCILED]: 0,
      [ReconciliationStatus.DIVERGENT]: 0,
      [ReconciliationStatus.MANUAL_REVIEW]: 0,
    };
    for (const row of counts) {
      const status = row.reconciliationStatus as ReconciliationStatus;
      result[status] = row._count.id;
    }
    return result;
  }

  private mapLifecycle(r: {
    id: string; tradeId: string; decisionId: string; symbol: string;
    entryOrderIds: string[]; exitOrderIds: string[];
    entryQtyRequested: number; entryQtyFilled: number;
    exitQtyRequested: number; exitQtyFilled: number;
    avgEntryPrice: number; avgExitPrice: number | null;
    feesTotal: number; slippageBps: number;
    realizedPnl: number | null; unrealizedPnl: number | null;
    positionId: string | null; positionAfterTrade: unknown;
    closedReason: string | null;
    reconciliationStatus: string;
    lastReconciledAt: Date | null; reconciliationNotes: string | null;
    createdAt: Date; updatedAt: Date;
  }): TradeLifecycle {
    return {
      id: r.id,
      tradeId: r.tradeId,
      decisionId: r.decisionId,
      symbol: r.symbol,
      entryOrderIds: r.entryOrderIds,
      exitOrderIds: r.exitOrderIds,
      entryQtyRequested: r.entryQtyRequested,
      entryQtyFilled: r.entryQtyFilled,
      exitQtyRequested: r.exitQtyRequested,
      exitQtyFilled: r.exitQtyFilled,
      avgEntryPrice: r.avgEntryPrice,
      avgExitPrice: r.avgExitPrice,
      feesTotal: r.feesTotal,
      slippageBps: r.slippageBps,
      realizedPnl: r.realizedPnl,
      unrealizedPnl: r.unrealizedPnl,
      positionId: r.positionId,
      positionAfterTrade: r.positionAfterTrade as Record<string, unknown> | null,
      closedReason: r.closedReason,
      reconciliationStatus: r.reconciliationStatus as ReconciliationStatus,
      lastReconciledAt: r.lastReconciledAt,
      reconciliationNotes: r.reconciliationNotes,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  /** Reconcile local state with exchange */
  async reconcile(): Promise<ReconciliationResult> {
    logger.info('Starting reconciliation with exchange...');

    try {
      const [localPositions, exchangeBalances, exchangeOpenOrders] = await Promise.all([
        this.getOpenPositions(),
        this.adapter.getBalances(),
        this.adapter.getOpenOrders(''), // All symbols
      ]);

      const balanceDiscrepancies: ReconciliationResult['balanceDiscrepancies'] = [];
      let requiresSafeMode = false;

      // Check for unexpected open orders on exchange
      const unexpectedRemote: string[] = [];
      for (const order of exchangeOpenOrders) {
        const tracked = await this.db.orderRequest.findFirst({
          where: { exchangeOrderId: order.exchangeOrderId },
        });
        if (!tracked) {
          unexpectedRemote.push(`Order ${order.exchangeOrderId} (${order.symbol})`);
          requiresSafeMode = true;
        }
      }

      // Check balance discrepancies
      const localBalances = await this.db.balance.findMany({
        distinct: ['asset'],
        orderBy: { createdAt: 'desc' },
      });

      for (const local of localBalances) {
        const remote = exchangeBalances.find((b) => b.asset === local.asset);
        if (!remote) continue;

        const diff = Math.abs(remote.total - local.total);
        const baseline = Math.max(Math.abs(local.total), Math.abs(remote.total), 1);
        const diffRatio = diff / baseline;

        if (diffRatio > 0.01) {
          balanceDiscrepancies.push({
            asset: local.asset,
            localBalance: local.total,
            exchangeBalance: remote.total,
            difference: diff,
          });
        }
      }

      if (balanceDiscrepancies.length > 0) {
        requiresSafeMode = true;
        logger.warn({ balanceDiscrepancies }, 'Balance discrepancies found');
      }

      const result: ReconciliationResult = {
        success: !requiresSafeMode,
        matchedPositions: localPositions.length - unexpectedRemote.length,
        orphanedLocal: [],
        unexpectedRemote,
        balanceDiscrepancies,
        requiresSafeMode,
        timestamp: new Date(),
      };

      logger.info(
        { success: result.success, matched: result.matchedPositions, unexpected: unexpectedRemote.length },
        'Reconciliation complete',
      );

      return result;
    } catch (error) {
      logger.error({ error }, 'Reconciliation failed');
      return {
        success: false,
        matchedPositions: 0,
        orphanedLocal: [],
        unexpectedRemote: [],
        balanceDiscrepancies: [],
        requiresSafeMode: true,
        timestamp: new Date(),
      };
    }
  }
}
