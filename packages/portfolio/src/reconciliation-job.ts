// ═══════════════════════════════════════════════════════════════
// ReconciliationJob — Periodic trade lifecycle reconciliation
//
// Every N minutes:
//   1. Scan PENDING lifecycles and update unrealizedPnl from DB positions
//   2. Detect lifecycles whose position closed without lifecycle finalization
//   3. Run exchange reconciliation (compare local vs remote positions)
//   4. Mark DIVERGENT and raise incidents for any mismatches
// ═══════════════════════════════════════════════════════════════

import { createLogger, eventBus, generateRequestId } from '@cryptobot/core';
import type { PrismaClient } from '@prisma/client';
import type { IExchangeAdapter } from '@cryptobot/exchange';
import { ReconciliationStatus, IncidentType, IncidentSeverity } from '@cryptobot/shared-types';
import type { PortfolioService } from './service.js';

const logger = createLogger('reconciliation-job');

/** Tolerance for quantity divergence (0.1%) */
const QTY_DIVERGENCE_THRESHOLD = 0.001;

export class ReconciliationJob {
  private interval: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly db: PrismaClient,
    private readonly adapter: IExchangeAdapter,
    private readonly portfolio: PortfolioService,
  ) {}

  /** Start the reconciliation job at the given interval. */
  start(intervalMs = 5 * 60 * 1000): void {
    if (this.interval) return;
    logger.info({ intervalMs }, 'ReconciliationJob started');
    this.interval = setInterval(() => this.runCheck(), intervalMs);
  }

  /** Stop the reconciliation job. */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    logger.info('ReconciliationJob stopped');
  }

  // ─────────────────────────────────────────────────────────
  // MAIN CHECK
  // ─────────────────────────────────────────────────────────

  async runCheck(): Promise<void> {
    if (this.running) {
      logger.warn('Reconciliation check already running — skipping');
      return;
    }
    this.running = true;
    const reqId = generateRequestId();

    try {
      logger.info({ reqId }, 'ReconciliationJob — running periodic check');

      await Promise.all([
        this.syncOpenLifecycles(),
        this.detectOrphanedClosedPositions(),
        this.compareWithExchange(reqId),
      ]);

      logger.info({ reqId }, 'ReconciliationJob — check complete');
    } catch (error) {
      logger.error({ reqId, error }, 'ReconciliationJob check failed');
    } finally {
      this.running = false;
    }
  }

  // ─────────────────────────────────────────────────────────
  // STEP 1: Sync unrealizedPnl on PENDING lifecycles
  // ─────────────────────────────────────────────────────────

  private async syncOpenLifecycles(): Promise<void> {
    const pending = await this.db.tradeLifecycle.findMany({
      where: { reconciliationStatus: ReconciliationStatus.PENDING },
    });

    for (const lc of pending) {
      if (!lc.positionId) continue;

      const position = await this.db.position.findUnique({
        where: { id: lc.positionId },
      });

      if (!position) {
        // Position deleted without closing lifecycle — mark for manual review
        await this.db.tradeLifecycle.update({
          where: { id: lc.id },
          data: {
            reconciliationStatus: ReconciliationStatus.MANUAL_REVIEW,
            reconciliationNotes: 'Position record not found — was it deleted manually?',
            lastReconciledAt: new Date(),
          },
        });
        continue;
      }

      // Update unrealized PnL from current position
      if (position.unrealizedPnl !== null) {
        await this.db.tradeLifecycle.update({
          where: { id: lc.id },
          data: { unrealizedPnl: position.unrealizedPnl, lastReconciledAt: new Date() },
        });
      }
    }

    if (pending.length > 0) {
      logger.debug({ count: pending.length }, 'Synced unrealizedPnl on open lifecycles');
    }
  }

  // ─────────────────────────────────────────────────────────
  // STEP 2: Detect orphaned closed positions
  // Closed positions that have no lifecycle finalization
  // ─────────────────────────────────────────────────────────

  private async detectOrphanedClosedPositions(): Promise<void> {
    // Find PENDING lifecycles whose linked position is now CLOSED
    const pendingWithClosedPos = await this.db.tradeLifecycle.findMany({
      where: { reconciliationStatus: ReconciliationStatus.PENDING },
    });

    for (const lc of pendingWithClosedPos) {
      if (!lc.positionId) continue;

      const position = await this.db.position.findUnique({ where: { id: lc.positionId } });
      if (!position || position.status !== 'CLOSED') continue;

      // Position is closed but lifecycle not finalized — reconstruct from DB
      logger.warn(
        { lifecycleId: lc.id, positionId: lc.positionId },
        'Orphaned closed position detected — auto-finalizing lifecycle',
      );

      await this.portfolio.updateLifecycleOnExit({
        positionId: lc.positionId,
        exitOrderId: position.exitOrderId ?? 'unknown',
        exitQtyFilled: position.quantity,
        avgExitPrice: position.exitPrice ?? 0,
        feesAdded: 0,
        realizedPnl: position.realizedPnl ?? 0,
        closedReason: position.exitReason ?? 'UNKNOWN',
        positionSnapshot: {
          symbol: position.symbol,
          side: position.side,
          entryPrice: position.entryPrice,
          exitPrice: position.exitPrice,
          quantity: position.quantity,
          notional: position.notional,
          realizedPnl: position.realizedPnl,
          realizedPnlPercent: position.realizedPnlPercent,
          holdingTimeSec: position.holdingTimeSec,
          totalCommission: position.totalCommission,
          closedAt: position.closedAt?.toISOString(),
          autoReconciled: true,
        },
      });
    }
  }

  // ─────────────────────────────────────────────────────────
  // STEP 3: Compare local state with exchange
  // ─────────────────────────────────────────────────────────

  private async compareWithExchange(reqId: string): Promise<void> {
    try {
      // Get local open positions
      const localOpenPositions = await this.db.position.findMany({
        where: { status: { in: ['OPEN', 'EXIT_PENDING'] } },
      });

      if (localOpenPositions.length === 0) return;

      // Get exchange open orders / positions (simplified: check orders)
      const exchangeOpenOrders = await this.adapter.getOpenOrders('');

      // exchangeOrderIds used below for untracked order detection

      for (const position of localOpenPositions) {
        // Check if the entry order is still tracked by the exchange
        const entryOrder = await this.db.orderRequest.findUnique({
          where: { id: position.entryOrderId },
        });
        if (!entryOrder?.exchangeOrderId) continue;

        // Check quantity divergence by looking at fills
        const fills = await this.db.fill.findMany({
          where: { orderId: position.entryOrderId },
        });
        const totalFilledQty = fills.reduce((s, f) => s + f.quantity, 0);

        const qtyDivergence = Math.abs(totalFilledQty - position.quantity);
        if (qtyDivergence > position.quantity * QTY_DIVERGENCE_THRESHOLD && totalFilledQty > 0) {
          // Quantity mismatch between fills and position record
          await this.handleDivergence(reqId, position.id, {
            type: 'QTY_MISMATCH',
            details: `Position qty ${position.quantity} vs fill total ${totalFilledQty} (Δ${qtyDivergence.toFixed(8)})`,
          });
        }
      }

      // Check for exchange orders that are no longer tracked locally
      const localOrderIds = new Set(
        (await this.db.orderRequest.findMany({
          where: { status: { notIn: ['FILLED', 'CANCELLED', 'REJECTED', 'FAILED', 'EXPIRED'] } },
          select: { exchangeOrderId: true },
        })).map((o) => o.exchangeOrderId).filter(Boolean),
      );

      for (const exchangeOrder of exchangeOpenOrders) {
        if (!localOrderIds.has(exchangeOrder.exchangeOrderId)) {
          await this.handleDivergence(reqId, null, {
            type: 'UNTRACKED_EXCHANGE_ORDER',
            details: `Exchange order ${exchangeOrder.exchangeOrderId} (${exchangeOrder.symbol}) not in local DB`,
          });
        }
      }
    } catch (error) {
      logger.error({ error }, 'Exchange comparison failed');
    }
  }

  // ─────────────────────────────────────────────────────────
  // DIVERGENCE HANDLING
  // ─────────────────────────────────────────────────────────

  private async handleDivergence(
    reqId: string,
    positionId: string | null,
    divergence: { type: string; details: string },
  ): Promise<void> {
    logger.error({ positionId, divergence }, 'DIVERGENCE DETECTED');

    // Mark lifecycle as DIVERGENT
    if (positionId) {
      await this.db.tradeLifecycle.updateMany({
        where: { positionId, reconciliationStatus: ReconciliationStatus.PENDING },
        data: {
          reconciliationStatus: ReconciliationStatus.DIVERGENT,
          reconciliationNotes: `${divergence.type}: ${divergence.details}`,
          lastReconciledAt: new Date(),
        },
      });
    }

    // Create incident
    await this.db.incident.create({
      data: {
        requestId: reqId,
        type: IncidentType.EXCHANGE_DESYNC,
        severity: IncidentSeverity.CRITICAL,
        title: `Reconciliation divergence: ${divergence.type}`,
        description: divergence.details,
        actionTaken: 'RECONCILIATION_DIVERGENT',
        isActive: true,
        context: { positionId, divergenceType: divergence.type },
      },
    });

    // Emit for MainOrchestrator to potentially pause
    eventBus.emit('incident:created', {
      incidentId: reqId,
      type: IncidentType.EXCHANGE_DESYNC,
      severity: IncidentSeverity.CRITICAL,
    });
  }
}
