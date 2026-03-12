// ═══════════════════════════════════════════════════════════════
// ExecutionOrchestrator Tests — EXIT flow and normal entry path
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionOrchestrator } from '../orchestrator.js';
import {
  TradeAction,
  EntryType,
  OrderSide,
  OrderStatus,
  RiskVerdict,
  type ModelDecision,
  type RiskReview,
} from '@cryptobot/shared-types';

// ── Helpers ──

function makeDecision(overrides: Partial<ModelDecision> = {}): ModelDecision {
  return {
    action: TradeAction.BUY,
    symbol: 'BTCUSDT',
    confidence: 0.75,
    entry_type: EntryType.MARKET,
    entry_price: 50000,
    size_quote: 100,
    stop_price: 49000,
    take_profit_price: 51000,
    max_slippage_bps: 5,
    time_horizon_sec: 300,
    thesis: 'Test thesis',
    invalidate_if: [],
    ...overrides,
  };
}

function makeReview(overrides: Partial<RiskReview> = {}): RiskReview {
  return {
    id: 'review_001',
    decisionId: 'dec_001',
    requestId: 'req_001',
    verdict: RiskVerdict.APPROVED,
    denialReasons: [],
    adjustedParams: null,
    explanation: 'All checks passed',
    checksPerformed: [],
    createdAt: new Date(),
    ...overrides,
  };
}

function makeOpenPosition(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pos_001',
    symbol: 'BTCUSDT',
    side: 'LONG',
    status: 'OPEN',
    quantity: 0.002,
    notional: 100,
    entryPrice: 50000,
    exitOrderId: null,
    openedAt: new Date(),
    ...overrides,
  };
}

function makeExchangeResponse(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    exchangeOrderId: 'exch_001',
    status: OrderStatus.FILLED,
    filledQuantity: 0.002,
    filledQuoteAmount: 100,
    averagePrice: 50000,
    errorCode: null,
    errorMessage: null,
    timestamp: Date.now(),
    raw: { mock: true },
    ...overrides,
  };
}

// ── Mock factories ──

function makeMockDb() {
  return {
    position: {
      findFirst: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    },
    orderRequest: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    orderEvent: {
      create: vi.fn(),
    },
    fill: {
      create: vi.fn(),
    },
  };
}

function makeMockAdapter() {
  return {
    name: 'MOCK',
    isSimulated: true,
    placeOrder: vi.fn(),
    cancelOrder: vi.fn(),
    getOrderStatus: vi.fn(),
    getOpenOrders: vi.fn(),
    getBalances: vi.fn(),
    isHealthy: vi.fn(),
    getServerTime: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

function makeMockAudit() {
  return {
    recordOrder: vi.fn().mockResolvedValue(undefined),
    recordDecision: vi.fn().mockResolvedValue(undefined),
    recordRisk: vi.fn().mockResolvedValue(undefined),
    recordSystem: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockPortfolio() {
  return {
    closePosition: vi.fn().mockResolvedValue(10),
    openPosition: vi.fn().mockResolvedValue('pos_new'),
    incrementTradesHour: vi.fn().mockResolvedValue(undefined),
    setExitPending: vi.fn().mockResolvedValue(undefined),
    setExitFailed: vi.fn().mockResolvedValue(undefined),
    updateLifecycleOnExit: vi.fn().mockResolvedValue(undefined),
    createTradeLifecycle: vi.fn().mockResolvedValue('lc_001'),
    getSummary: vi.fn(),
    getRiskState: vi.fn(),
  };
}

// ── Tests ──

describe('ExecutionOrchestrator', () => {
  let db: ReturnType<typeof makeMockDb>;
  let adapter: ReturnType<typeof makeMockAdapter>;
  let audit: ReturnType<typeof makeMockAudit>;
  let portfolio: ReturnType<typeof makeMockPortfolio>;
  let orchestrator: ExecutionOrchestrator;

  beforeEach(() => {
    db = makeMockDb();
    adapter = makeMockAdapter();
    audit = makeMockAudit();
    portfolio = makeMockPortfolio();
    orchestrator = new ExecutionOrchestrator(
      adapter as any,
      db as any,
      audit as any,
      portfolio as any,
    );

    // Default stubs for DB operations
    db.orderRequest.findUnique.mockResolvedValue(null);
    db.orderRequest.findFirst.mockResolvedValue(null);
    db.orderEvent.create.mockResolvedValue({});
    db.fill.create.mockResolvedValue({});
  });

  // ════════════════════════════════════════
  // HOLD decision
  // ════════════════════════════════════════

  describe('HOLD decision', () => {
    it('should return null immediately without placing any order', async () => {
      const decision = makeDecision({ action: TradeAction.HOLD });
      const review = makeReview();

      const result = await orchestrator.execute(decision, review, 'req_001');

      expect(result).toBeNull();
      expect(adapter.placeOrder).not.toHaveBeenCalled();
      expect(db.orderRequest.create).not.toHaveBeenCalled();
    });
  });

  // ════════════════════════════════════════
  // DENIED decision
  // ════════════════════════════════════════

  describe('DENIED decision', () => {
    it('should return null without placing any order when verdict is DENIED', async () => {
      const decision = makeDecision({ action: TradeAction.BUY });
      const review = makeReview({ verdict: RiskVerdict.DENIED });

      const result = await orchestrator.execute(decision, review, 'req_001');

      expect(result).toBeNull();
      expect(adapter.placeOrder).not.toHaveBeenCalled();
    });
  });

  // ════════════════════════════════════════
  // BUY (normal entry path)
  // ════════════════════════════════════════

  describe('BUY decision — normal entry path', () => {
    it('should create an order and send to exchange', async () => {
      const createdOrder = {
        id: 'ord_001',
        symbol: 'BTCUSDT',
        side: OrderSide.BUY,
        type: EntryType.MARKET,
        quantity: 0.002,
        price: null,
        decisionId: 'dec_001',
        riskReviewId: 'review_001',
        requestId: 'req_001',
        purpose: 'ENTRY',
        status: OrderStatus.PENDING,
      };
      db.orderRequest.create.mockResolvedValue(createdOrder);
      db.orderRequest.update.mockResolvedValue({ ...createdOrder, status: OrderStatus.FILLED });
      adapter.placeOrder.mockResolvedValue(makeExchangeResponse());

      const decision = makeDecision({ action: TradeAction.BUY, entry_price: 50000, size_quote: 100 });
      const review = makeReview();

      const result = await orchestrator.execute(decision, review, 'req_001');

      expect(result).toBe('ord_001');
      expect(adapter.placeOrder).toHaveBeenCalledOnce();
      const call = adapter.placeOrder.mock.calls[0]![0]!;
      expect(call.side).toBe(OrderSide.BUY);
      expect(call.symbol).toBe('BTCUSDT');
    });

    it('should route to executeExit for EXIT action (not normal entry path)', async () => {
      // Set up position for EXIT path
      db.position.findFirst.mockResolvedValue(makeOpenPosition());
      db.position.update.mockResolvedValue({});
      const exitOrder = { id: 'ord_exit_001', symbol: 'BTCUSDT', side: OrderSide.SELL, purpose: 'EXIT_AI', status: OrderStatus.PENDING };
      db.orderRequest.create.mockResolvedValue(exitOrder);
      db.orderRequest.update.mockResolvedValue({ ...exitOrder, status: OrderStatus.FILLED });
      adapter.placeOrder.mockResolvedValue(makeExchangeResponse());

      const decision = makeDecision({ action: TradeAction.EXIT });
      const review = makeReview();

      const result = await orchestrator.execute(decision, review, 'req_001');

      // Should return an order ID (not null), but via EXIT path
      expect(result).toBe('ord_exit_001');
      // The order created should be EXIT_AI purpose, not ENTRY
      const createCall = db.orderRequest.create.mock.calls[0]![0]!.data;
      expect(createCall.purpose).toBe('EXIT_AI');
      expect(createCall.side).toBe(OrderSide.SELL); // LONG → SELL
    });
  });

  // ════════════════════════════════════════
  // EXIT — open LONG position
  // ════════════════════════════════════════

  describe('EXIT decision with open LONG position', () => {
    it('should create a SELL order and close the position', async () => {
      const position = makeOpenPosition({ side: 'LONG', status: 'OPEN' });
      db.position.findFirst.mockResolvedValue(position);
      db.position.update.mockResolvedValue({});

      const exitOrder = {
        id: 'ord_exit_001',
        symbol: 'BTCUSDT',
        side: OrderSide.SELL,
        purpose: 'EXIT_AI',
        status: OrderStatus.PENDING,
        decisionId: 'dec_001',
        riskReviewId: 'review_001',
        requestId: 'req_001',
        quantity: 0.002,
        price: null,
      };
      db.orderRequest.create.mockResolvedValue(exitOrder);
      db.orderRequest.update.mockResolvedValue({ ...exitOrder, status: OrderStatus.FILLED });
      adapter.placeOrder.mockResolvedValue(makeExchangeResponse({ status: OrderStatus.FILLED, filledQuantity: 0.002 }));

      const decision = makeDecision({ action: TradeAction.EXIT });
      const review = makeReview();

      const result = await orchestrator.execute(decision, review, 'req_001');

      expect(result).toBe('ord_exit_001');

      // Position was set to EXIT_PENDING
      expect(db.position.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pos_001' },
          data: expect.objectContaining({ status: 'EXIT_PENDING' }),
        }),
      );

      // Order created with SELL side
      const createData = db.orderRequest.create.mock.calls[0]![0]!.data;
      expect(createData.side).toBe(OrderSide.SELL);
      expect(createData.purpose).toBe('EXIT_AI');

      // Exchange was called
      expect(adapter.placeOrder).toHaveBeenCalledOnce();

      // Position closed via portfolio service
      expect(portfolio.closePosition).toHaveBeenCalledWith(
        'pos_001',
        'ord_exit_001',
        expect.any(Number),
        expect.any(String),
        0,
      );
    });
  });

  // ════════════════════════════════════════
  // EXIT — no open position
  // ════════════════════════════════════════

  describe('EXIT decision with no open position', () => {
    it('should return null, log warning, and NOT throw', async () => {
      db.position.findFirst.mockResolvedValue(null);

      const decision = makeDecision({ action: TradeAction.EXIT });
      const review = makeReview();

      let result: string | null;
      let threw = false;
      try {
        result = await orchestrator.execute(decision, review, 'req_001');
      } catch {
        threw = true;
        result = null;
      }

      expect(threw).toBe(false);
      expect(result).toBeNull();

      // No order should be created or sent
      expect(db.orderRequest.create).not.toHaveBeenCalled();
      expect(adapter.placeOrder).not.toHaveBeenCalled();
    });
  });

  // ════════════════════════════════════════
  // EXIT — idempotency: already EXIT_PENDING with exitOrderId
  // ════════════════════════════════════════

  describe('EXIT decision with position already EXIT_PENDING', () => {
    it('should return existing exitOrderId without creating a duplicate order', async () => {
      const existingOrderId = 'ord_existing_001';
      const position = makeOpenPosition({
        status: 'EXIT_PENDING',
        exitOrderId: existingOrderId,
      });
      db.position.findFirst.mockResolvedValue(position);

      const decision = makeDecision({ action: TradeAction.EXIT });
      const review = makeReview();

      const result = await orchestrator.execute(decision, review, 'req_001');

      expect(result).toBe(existingOrderId);

      // No new order created, no exchange call
      expect(db.orderRequest.create).not.toHaveBeenCalled();
      expect(adapter.placeOrder).not.toHaveBeenCalled();
    });
  });

  // ════════════════════════════════════════
  // EXIT — exchange error → position reverts to OPEN
  // ════════════════════════════════════════

  describe('EXIT decision with exchange error', () => {
    it('should revert position to OPEN and return null on exchange failure', async () => {
      const position = makeOpenPosition({ side: 'LONG', status: 'OPEN' });
      db.position.findFirst.mockResolvedValue(position);
      db.position.update.mockResolvedValue({});

      const exitOrder = {
        id: 'ord_exit_fail_001',
        symbol: 'BTCUSDT',
        side: OrderSide.SELL,
        purpose: 'EXIT_AI',
        status: OrderStatus.PENDING,
      };
      db.orderRequest.create.mockResolvedValue(exitOrder);
      db.orderRequest.update.mockResolvedValue({});

      // Exchange throws
      adapter.placeOrder.mockRejectedValue(new Error('Exchange connection timeout'));

      const decision = makeDecision({ action: TradeAction.EXIT });
      const review = makeReview();

      const result = await orchestrator.execute(decision, review, 'req_001');

      expect(result).toBeNull();

      // Position should have been set to EXIT_PENDING first, then reverted to OPEN
      const updateCalls: Array<[{ where: { id: string }; data: { status: string } }]> =
        db.position.update.mock.calls as Array<[{ where: { id: string }; data: { status: string } }]>;
      expect(updateCalls.length).toBeGreaterThanOrEqual(2);

      const firstCall = updateCalls[0];
      expect(firstCall).toBeDefined();
      expect(firstCall![0].data.status).toBe('EXIT_PENDING');

      const revertUpdate = updateCalls.find(
        (call) => call[0]?.data.status === 'OPEN',
      );
      expect(revertUpdate).toBeDefined();

      // Order marked FAILED
      expect(db.orderRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ord_exit_fail_001' },
          data: { status: OrderStatus.FAILED },
        }),
      );

      // Portfolio close should NOT have been called
      expect(portfolio.closePosition).not.toHaveBeenCalled();
    });
  });
});
