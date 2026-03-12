// ═══════════════════════════════════════════════════════════════
// ExecutionOrchestrator — Transforms approved decisions into orders
// Handles idempotency, order lifecycle, partial fills, timeouts
// ═══════════════════════════════════════════════════════════════

import {
  createLogger,
  generateIdempotencyKey,
  generateTradeId,
  eventBus,
} from '@cryptobot/core';
import type { PrismaClient, Prisma } from '@prisma/client';
import {
  OrderStatus,
  RiskVerdict,
  TradeAction,
  OrderSide,
  EntryType,
  ExitReason,
  AuditEventType,
  TERMINAL_ORDER_STATES,
  type RiskReview,
  type ModelDecision,
  type ExchangeOrderResponse,
} from '@cryptobot/shared-types';
import type { IExchangeAdapter } from '@cryptobot/exchange';
import type { AuditService } from '@cryptobot/audit';
import type { PortfolioService } from '@cryptobot/portfolio';

const logger = createLogger('execution');

export class ExecutionOrchestrator {
  constructor(
    private readonly adapter: IExchangeAdapter,
    private readonly db: PrismaClient,
    private readonly audit: AuditService,
    private readonly portfolio: PortfolioService,
  ) {}

  /**
   * Execute an approved decision — creates and sends order.
   * Returns the order ID or null if skipped.
   */
  async execute(
    decision: ModelDecision,
    review: RiskReview,
    requestId: string,
  ): Promise<string | null> {
    if (review.verdict === RiskVerdict.DENIED) {
      logger.warn({ decisionId: review.decisionId }, 'Cannot execute denied decision');
      return null;
    }

    if (decision.action === TradeAction.HOLD) return null;

    // Route EXIT decisions to dedicated handler
    if (decision.action === TradeAction.EXIT) {
      // Safety guard — executeExit must exist (catches context-loss bugs at runtime)
      if (typeof this.executeExit !== 'function') {
        const msg = 'CRITICAL: executeExit is not a function — possible prototype corruption';
        logger.fatal({ msg }, msg);
        eventBus.emit('execution:critical-error', {
          symbol: decision.symbol,
          error: msg,
          action: 'EXIT',
        });
        return null;
      }
      return this.executeExit(decision, review, requestId);
    }

    const tradeId = generateTradeId();
    const purpose = 'ENTRY' as const;
    const idempotencyKey = generateIdempotencyKey(review.decisionId, purpose);

    // ── Idempotency check ──
    const existing = await this.db.orderRequest.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      logger.info({ idempotencyKey, existingId: existing.id }, 'Duplicate order detected — skipping');
      return existing.id;
    }

    // ── Determine side and quantity ──
    const adjustedDecision = review.adjustedParams
      ? { ...decision, ...review.adjustedParams }
      : decision;

    const side = adjustedDecision.action === TradeAction.BUY ? OrderSide.BUY : OrderSide.SELL;
    const entryPrice = adjustedDecision.entry_price;
    const quantity = entryPrice > 0 ? adjustedDecision.size_quote / entryPrice : 0;

    if (quantity <= 0) {
      logger.warn({ decision: adjustedDecision }, 'Computed quantity is 0 — skipping');
      return null;
    }

    // ── Create order in DB ──
    const order = await this.db.orderRequest.create({
      data: {
        idempotencyKey,
        decisionId: review.decisionId,
        riskReviewId: review.id,
        requestId,
        symbol: adjustedDecision.symbol,
        side,
        type: adjustedDecision.entry_type,
        quantity,
        price: adjustedDecision.entry_type === 'LIMIT' ? entryPrice : null,
        quoteAmount: adjustedDecision.size_quote,
        stopPrice: adjustedDecision.stop_price > 0 ? adjustedDecision.stop_price : null,
        takeProfitPrice: adjustedDecision.take_profit_price > 0 ? adjustedDecision.take_profit_price : null,
        maxSlippageBps: adjustedDecision.max_slippage_bps,
        timeoutSec: adjustedDecision.time_horizon_sec,
        purpose,
        status: OrderStatus.PENDING,
      },
    });

    // Record order creation event
    await this.recordOrderEvent(order.id, requestId, null, OrderStatus.PENDING, null, null);
    await this.audit.recordOrder(requestId, tradeId, AuditEventType.ORDER_CREATED, {
      orderId: order.id,
      symbol: order.symbol,
      side,
      quantity,
      price: entryPrice,
    }, `Order created: ${side} ${quantity} ${order.symbol}`);

    eventBus.emit('order:created', { orderId: order.id, symbol: order.symbol });

    // ── Send to exchange ──
    try {
      const response = await this.adapter.placeOrder({
        symbol: adjustedDecision.symbol,
        side,
        type: adjustedDecision.entry_type,
        quantity,
        price: adjustedDecision.entry_type === 'LIMIT' ? entryPrice : null,
        clientOrderId: order.id,
      });

      // Update order with exchange response
      const newStatus = response.success ? response.status : OrderStatus.FAILED;
      await this.db.orderRequest.update({
        where: { id: order.id },
        data: {
          exchangeOrderId: response.exchangeOrderId,
          status: newStatus,
        },
      });

      await this.recordOrderEvent(
        order.id, requestId,
        OrderStatus.PENDING, newStatus,
        response.raw, response.errorMessage,
      );

      if (response.success) {
        eventBus.emit('order:sent', {
          orderId: order.id,
          exchangeOrderId: response.exchangeOrderId,
        });
        logger.info(
          { orderId: order.id, exchangeOrderId: response.exchangeOrderId, status: newStatus },
          'Order sent to exchange',
        );

        // If filled immediately (market order or SIM), process fills
        if (response.status === OrderStatus.FILLED && response.filledQuantity > 0) {
          await this.processFill(order.id, requestId, tradeId, response);
        }
      } else {
        eventBus.emit('order:failed', { orderId: order.id, error: response.errorMessage ?? 'Unknown' });
        logger.error(
          { orderId: order.id, error: response.errorMessage },
          'Order failed at exchange',
        );
      }

      return order.id;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await this.db.orderRequest.update({
        where: { id: order.id },
        data: { status: OrderStatus.FAILED },
      });
      await this.recordOrderEvent(order.id, requestId, OrderStatus.PENDING, OrderStatus.FAILED, null, errorMsg);
      eventBus.emit('order:failed', { orderId: order.id, error: errorMsg });

      logger.error({ orderId: order.id, error: errorMsg }, 'Failed to send order');
      return order.id;
    }
  }

  /** Process a fill response and update portfolio */
  private async processFill(
    orderId: string,
    requestId: string,
    tradeId: string,
    response: ExchangeOrderResponse,
  ): Promise<void> {
    const order = await this.db.orderRequest.findUnique({ where: { id: orderId } });
    if (!order) return;

    // Record fill
    await this.db.fill.create({
      data: {
        orderId,
        requestId,
        symbol: order.symbol,
        side: order.side,
        price: response.averagePrice ?? order.price ?? 0,
        quantity: response.filledQuantity,
        quoteAmount: response.filledQuoteAmount,
        commission: 0, // TODO: extract from exchange response
        commissionAsset: 'USDT',
        exchangeTradeId: response.exchangeOrderId ?? `fill_${Date.now()}`,
        isMaker: order.type === 'LIMIT',
      },
    });

    eventBus.emit('order:filled', {
      orderId,
      price: response.averagePrice ?? 0,
      quantity: response.filledQuantity,
    });

    await this.audit.recordOrder(requestId, tradeId, AuditEventType.ORDER_FILLED, {
      orderId,
      price: response.averagePrice,
      quantity: response.filledQuantity,
      quoteAmount: response.filledQuoteAmount,
    }, `Order filled: ${response.filledQuantity} @ ${response.averagePrice}`);

    // Open or close position based on order purpose
    if (order.purpose === 'ENTRY') {
      const fillPrice = response.averagePrice ?? order.price ?? 0;
      const positionId = await this.portfolio.openPosition({
        symbol: order.symbol,
        side: order.side === 'BUY' ? 'LONG' : 'SHORT',
        entryOrderId: orderId,
        entryPrice: fillPrice,
        quantity: response.filledQuantity,
        notional: response.filledQuoteAmount,
        decisionId: order.decisionId,
        commission: 0,
      });

      eventBus.emit('position:opened', {
        positionId,
        symbol: order.symbol,
        side: order.side === 'BUY' ? 'LONG' : 'SHORT',
      });

      await this.portfolio.incrementTradesHour();

      // ── Create TradeLifecycle ──
      // Compute slippage: for LIMIT orders compare fill vs requested price
      const requestedPrice = order.price ?? fillPrice;
      const slippageBps = requestedPrice > 0
        ? ((fillPrice - requestedPrice) / requestedPrice) * 10_000 * (order.side === 'BUY' ? 1 : -1)
        : 0;

      await this.portfolio.createTradeLifecycle({
        tradeId,
        decisionId: order.decisionId,
        symbol: order.symbol,
        entryOrderId: orderId,
        entryQtyRequested: order.quantity,
        entryQtyFilled: response.filledQuantity,
        avgEntryPrice: fillPrice,
        feesTotal: 0, // TODO: extract from exchange response when available
        slippageBps: Math.max(0, slippageBps), // only count adverse slippage
        positionId,
      });
    }
  }

  /** Track open orders — check for fills, timeouts, etc. */
  async trackOpenOrders(): Promise<void> {
    const openOrders = await this.db.orderRequest.findMany({
      where: {
        status: { in: [OrderStatus.SENT, OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED] },
      },
    });

    for (const order of openOrders) {
      if (!order.exchangeOrderId) continue;

      try {
        const response = await this.adapter.getOrderStatus(order.symbol, order.exchangeOrderId);

        if (response.status !== order.status) {
          await this.db.orderRequest.update({
            where: { id: order.id },
            data: { status: response.status },
          });
          await this.recordOrderEvent(
            order.id, order.requestId,
            order.status as OrderStatus, response.status,
            response.raw, null,
          );

          if (response.status === OrderStatus.FILLED && response.filledQuantity > 0) {
            await this.processFill(order.id, order.requestId, `trd_${order.id}`, response);
          }

          if (response.status === OrderStatus.CANCELLED) {
            eventBus.emit('order:cancelled', { orderId: order.id, reason: 'Exchange cancelled' });
          }
        }

        // Timeout check
        const ageMs = Date.now() - order.createdAt.getTime();
        if (ageMs > order.timeoutSec * 1000 && !TERMINAL_ORDER_STATES.has(order.status as OrderStatus)) {
          logger.warn({ orderId: order.id, ageMs, timeout: order.timeoutSec }, 'Order timed out — cancelling');
          await this.cancelOrder(order.id);
        }
      } catch (error) {
        logger.error({ orderId: order.id, error }, 'Failed to track order');
      }
    }
  }

  /** Cancel an open order */
  async cancelOrder(orderId: string): Promise<boolean> {
    const order = await this.db.orderRequest.findUnique({ where: { id: orderId } });
    if (!order || !order.exchangeOrderId) return false;
    if (TERMINAL_ORDER_STATES.has(order.status as OrderStatus)) return false;

    try {
      const response = await this.adapter.cancelOrder(order.symbol, order.exchangeOrderId);
      if (response.success) {
        await this.db.orderRequest.update({
          where: { id: orderId },
          data: { status: OrderStatus.CANCELLED },
        });
        await this.recordOrderEvent(
          orderId, order.requestId,
          order.status as OrderStatus, OrderStatus.CANCELLED,
          response.raw, null,
        );
        eventBus.emit('order:cancelled', { orderId, reason: 'Manual/timeout cancel' });
        return true;
      }
      return false;
    } catch (error) {
      logger.error({ orderId, error }, 'Failed to cancel order');
      return false;
    }
  }

  /** Execute an EXIT decision — closes the existing open position */
  private async executeExit(
    decision: ModelDecision,
    review: RiskReview,
    requestId: string,
  ): Promise<string | null> {
    // 1. Find the open/exit_pending position for this symbol
    const openPosition = await this.db.position.findFirst({
      where: {
        symbol: decision.symbol,
        status: { in: ['OPEN', 'EXIT_PENDING'] },
      },
      orderBy: { openedAt: 'desc' },
    });

    if (!openPosition) {
      logger.warn({ symbol: decision.symbol }, 'EXIT decision but no open position found — skipping');
      return null;
    }

    // 2. Idempotency: if already EXIT_PENDING with existing exit order, skip
    if (openPosition.status === 'EXIT_PENDING' && openPosition.exitOrderId) {
      logger.warn({ positionId: openPosition.id }, 'EXIT already in progress — skipping duplicate');
      return openPosition.exitOrderId;
    }

    // 3. Set position to EXIT_PENDING immediately
    await this.db.position.update({
      where: { id: openPosition.id },
      data: { status: 'EXIT_PENDING', exitOrderSentAt: new Date() },
    });

    // 4. Determine close side (opposite of position side)
    const side = openPosition.side === 'LONG' ? OrderSide.SELL : OrderSide.BUY;

    // 5. Idempotency key for this exit
    const idempotencyKey = generateIdempotencyKey(review.decisionId, 'EXIT');
    const existing = await this.db.orderRequest.findFirst({ where: { idempotencyKey } });
    if (existing) {
      logger.info({ orderId: existing.id }, 'Exit order already exists (idempotent)');
      return existing.id;
    }

    // 6. Create exit order
    const tradeId = generateTradeId();
    const order = await this.db.orderRequest.create({
      data: {
        idempotencyKey,
        decisionId: review.decisionId,
        riskReviewId: review.id,
        requestId,
        symbol: decision.symbol,
        side,
        type: EntryType.MARKET,
        quantity: openPosition.quantity,
        price: null,
        quoteAmount: openPosition.notional,
        stopPrice: null,
        takeProfitPrice: null,
        maxSlippageBps: decision.max_slippage_bps,
        timeoutSec: 30,
        purpose: decision.exit_reason ?? 'EXIT_AI',
        status: OrderStatus.PENDING,
      },
    });

    const exitPurpose = decision.exit_reason ?? 'EXIT_AI';
    await this.recordOrderEvent(order.id, requestId, null, OrderStatus.PENDING, null, null);
    await this.audit.recordOrder(requestId, tradeId, AuditEventType.ORDER_CREATED, {
      orderId: order.id,
      symbol: order.symbol,
      side,
      quantity: openPosition.quantity,
      purpose: exitPurpose,
    }, `Exit order created: ${side} ${openPosition.quantity} ${order.symbol} (${exitPurpose})`);

    // 7. Send to exchange
    let response: ExchangeOrderResponse;
    try {
      response = await this.adapter.placeOrder({
        symbol: decision.symbol,
        side,
        type: EntryType.MARKET,
        quantity: openPosition.quantity,
        price: null,
        clientOrderId: order.id,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ err, positionId: openPosition.id }, 'Exit order failed — exchange error');
      // Revert position to OPEN so risk engine can retry on next cycle
      await this.db.position.update({
        where: { id: openPosition.id },
        data: { status: 'OPEN', exitOrderSentAt: null },
      });
      await this.db.orderRequest.update({
        where: { id: order.id },
        data: { status: OrderStatus.FAILED },
      });
      await this.recordOrderEvent(order.id, requestId, OrderStatus.PENDING, OrderStatus.FAILED, null, errorMsg);
      // Emit critical error so MainOrchestrator can pause + reconcile
      eventBus.emit('execution:critical-error', {
        symbol: decision.symbol,
        error: `EXIT order failed: ${errorMsg}`,
        action: 'EXIT',
      });
      return null;
    }

    // 8. Update order with exchange response
    const newStatus = response.success ? response.status : OrderStatus.FAILED;
    await this.db.orderRequest.update({
      where: { id: order.id },
      data: {
        exchangeOrderId: response.exchangeOrderId,
        status: newStatus,
      },
    });
    await this.recordOrderEvent(order.id, requestId, OrderStatus.PENDING, newStatus, response.raw, response.errorMessage);

    // 9. If filled immediately (market order or SIM mode), close position
    if (response.success && (response.status === OrderStatus.FILLED || response.filledQuantity > 0)) {
      const fillPrice = response.averagePrice ?? decision.entry_price;
      await this.processExitFill(
        openPosition.id, order.id, requestId, tradeId,
        decision.symbol, side, fillPrice, openPosition.quantity, response,
      );
    }

    logger.info({
      positionId: openPosition.id,
      orderId: order.id,
      side,
      quantity: openPosition.quantity,
      status: newStatus,
    }, 'Exit order sent');

    return order.id;
  }

  /** Process a fill for an EXIT order — records fill and closes position */
  private async processExitFill(
    positionId: string,
    orderId: string,
    requestId: string,
    tradeId: string,
    symbol: string,
    side: OrderSide,
    fillPrice: number,
    quantity: number,
    response: ExchangeOrderResponse,
  ): Promise<void> {
    // Create fill record
    await this.db.fill.create({
      data: {
        orderId,
        requestId,
        symbol,
        side,
        price: fillPrice,
        quantity,
        quoteAmount: fillPrice * quantity,
        commission: 0,
        commissionAsset: 'USDT',
        exchangeTradeId: response.exchangeOrderId ?? `exit_fill_${Date.now()}`,
        isMaker: false,
      },
    });

    eventBus.emit('order:filled', {
      orderId,
      price: fillPrice,
      quantity,
    });

    await this.audit.recordOrder(requestId, tradeId, AuditEventType.ORDER_FILLED, {
      orderId,
      price: fillPrice,
      quantity,
      quoteAmount: fillPrice * quantity,
    }, `Exit order filled: ${quantity} @ ${fillPrice}`);

    // Resolve exit reason from the order's purpose field (set by executeExit via decision.exit_reason)
    const order = await this.db.orderRequest.findUnique({ where: { id: orderId }, select: { purpose: true } });
    const exitReason = (order?.purpose ?? ExitReason.AI_EXIT) as ExitReason;

    // Close the position
    const realizedPnl = await this.portfolio.closePosition(positionId, orderId, fillPrice, exitReason, 0);

    eventBus.emit('position:closed', { positionId, pnl: realizedPnl, reason: exitReason });

    // ── Finalize TradeLifecycle ──
    // Build a snapshot of the closed position for audit trail
    const closedPosition = await this.db.position.findUnique({ where: { id: positionId } });
    if (closedPosition) {
      await this.portfolio.updateLifecycleOnExit({
        positionId,
        exitOrderId: orderId,
        exitQtyFilled: quantity,
        avgExitPrice: fillPrice,
        feesAdded: 0, // TODO: extract from exchange response
        realizedPnl,
        closedReason: exitReason,
        positionSnapshot: {
          symbol,
          side: closedPosition.side,
          entryPrice: closedPosition.entryPrice,
          exitPrice: fillPrice,
          quantity: closedPosition.quantity,
          notional: closedPosition.notional,
          realizedPnl,
          realizedPnlPercent: closedPosition.realizedPnlPercent ?? 0,
          holdingTimeSec: closedPosition.holdingTimeSec ?? 0,
          totalCommission: closedPosition.totalCommission,
          closedAt: new Date().toISOString(),
        },
      });
    }

    logger.info({ positionId, orderId, fillPrice }, 'Position closed via EXIT signal');
  }

  /** Record an order event in the DB */
  private async recordOrderEvent(
    orderId: string,
    requestId: string,
    previousStatus: OrderStatus | null,
    newStatus: OrderStatus,
    exchangeData: Record<string, unknown> | null,
    errorMessage: string | null,
  ): Promise<void> {
    await this.db.orderEvent.create({
      data: {
        orderId,
        requestId,
        previousStatus: previousStatus ?? undefined,
        newStatus,
        exchangeData: (exchangeData ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
        errorMessage,
      },
    });
  }
}
