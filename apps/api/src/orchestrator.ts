// ═══════════════════════════════════════════════════════════════
// MainOrchestrator — The heart of the system
// Manages the decision loop, state machine, and module coordination
// ═══════════════════════════════════════════════════════════════

import {
  createLogger,
  generateRequestId,
  eventBus,
  sleep,
  getRedis,
  getBuildInfo,
} from '@cryptobot/core';
import type { SystemHealthReport } from '@cryptobot/shared-types';
import type { PrismaClient, Prisma } from '@prisma/client';
import {
  SystemState,
  TradingMode,
  TradeAction,
  EntryType,
  ExitReason,
  RiskVerdict,
  RiskDenialReason,
  AuditEventType,
  IncidentType,
  IncidentSeverity,
  OrderSide,
  NON_TRADING_STATES,
  ALLOWED_STATE_TRANSITIONS,
  type ModelDecision,
  type RiskLimits,
  type StrategyConfig,
} from '@cryptobot/shared-types';
import { MarketDataService } from '@cryptobot/market-data';
import { FeatureEngine, PhaseAAnalysisService } from '@cryptobot/features';
import {
  ClaudeDecisionEngine,
  DeterministicEntryEngine,
  type DecisionEngineConfig,
} from '@cryptobot/decision-engine';
import { RiskEngine } from '@cryptobot/risk-engine';
import { ExecutionOrchestrator } from '@cryptobot/execution';
import type { IExchangeAdapter } from '@cryptobot/exchange';
import { PortfolioService, ReconciliationJob } from '@cryptobot/portfolio';
import { AuditService } from '@cryptobot/audit';
import { NotificationService } from '@cryptobot/notifications';

const logger = createLogger('orchestrator');

/** Clock drift thresholds */
const CLOCK_DRIFT_WARNING_MS = 500;   // >500ms → WARNING incident
const CLOCK_DRIFT_PAUSE_MS   = 1_000; // >1000ms → PAUSED

/** Incident types that immediately pause the system (CRITICAL severity) */
const CRITICAL_INCIDENT_TYPES = new Set<IncidentType>([
  IncidentType.EXCHANGE_DESYNC,
  IncidentType.UNEXPECTED_POSITION,
  IncidentType.MARKET_DATA_GAP,
  IncidentType.DAILY_LOSS_LIMIT,
  IncidentType.WEEKLY_LOSS_LIMIT,
  IncidentType.EXECUTION_FAILED,
  IncidentType.BALANCE_INCONSISTENCY,
  IncidentType.CLOCK_DRIFT,
]);

/** Market data gap thresholds */
const MARKET_DATA_GAP_DEGRADED_MS = 2_000;  // >2s → DEGRADED
const MARKET_DATA_GAP_PAUSED_MS   = 5_000;  // >5s → PAUSED

export class MainOrchestrator {
  private systemState: SystemState = SystemState.BOOTING;
  private tradingMode: TradingMode;
  private running = false;
  private loopInterval: ReturnType<typeof setInterval> | null = null;
  /** Symbols with an exit order in-flight — prevents duplicate EXIT cycles */
  private readonly exitingSymbols = new Set<string>();
  /**
   * Kill switches that have already fired this session — prevents repeated
   * incident spam when a limit is continuously breached.
   */
  private readonly firedKillSwitches = new Set<string>();

  /**
   * Tracks how many times each incident type has been raised this session.
   * Used for automatic escalation: >3 occurrences → CRITICAL regardless of type.
   */
  private readonly incidentCounts = new Map<string, number>();

  // Clock drift monitoring
  private clockDriftInterval: ReturnType<typeof setInterval> | null = null;
  private lastClockDriftMs = 0;
  private lastClockDriftCheckedAt: Date | null = null;
  private clockDriftWarningFired = false;

  // Services
  private marketData: MarketDataService;
  private featureEngine: FeatureEngine;
  private phaseAAnalysis: PhaseAAnalysisService;
  private decisionEngine: ClaudeDecisionEngine;
  private deterministicEntry: DeterministicEntryEngine;
  private riskEngine: RiskEngine;
  private executionOrch: ExecutionOrchestrator;
  private portfolio: PortfolioService;
  private audit: AuditService;
  private notifications: NotificationService;
  private reconciliationJob: ReconciliationJob;

  // Config
  private riskLimits!: RiskLimits;
  private strategyConfig!: StrategyConfig;
  private decisionIntervalSec: number;

  constructor(
    private readonly db: PrismaClient,
    private readonly adapter: IExchangeAdapter,
    decisionEngineConfig: DecisionEngineConfig,
    tradingMode: TradingMode,
    decisionIntervalSec: number,
    webhookUrl?: string,
  ) {
    this.tradingMode = tradingMode;
    this.decisionIntervalSec = decisionIntervalSec;

    // Initialize services
    this.marketData = new MarketDataService();
    this.featureEngine = new FeatureEngine();
    this.phaseAAnalysis = new PhaseAAnalysisService();
    this.decisionEngine = new ClaudeDecisionEngine(decisionEngineConfig, db);
    this.deterministicEntry = new DeterministicEntryEngine();
    this.riskEngine = new RiskEngine();
    this.portfolio = new PortfolioService(db, adapter);
    this.audit = new AuditService(db);
    this.notifications = new NotificationService(webhookUrl);
    this.executionOrch = new ExecutionOrchestrator(adapter, db, this.audit, this.portfolio);
    this.reconciliationJob = new ReconciliationJob(db, adapter, this.portfolio);

    this.setupEventHandlers();
  }

  /** Get current system state */
  getSystemState(): SystemState {
    return this.systemState;
  }

  /** Get current trading mode */
  getTradingMode(): TradingMode {
    return this.tradingMode;
  }

  /** Get services for API injection */
  getServices() {
    return {
      audit: this.audit,
      portfolio: this.portfolio,
      notifications: this.notifications,
      liquidateAllPositions: (reason: string) => this.liquidateAllPositions(reason),
    };
  }

  /** Set system state with audit trail — enforces explicit transition rules */
  async setSystemState(newState: SystemState, reason: string): Promise<void> {
    const oldState = this.systemState;
    if (oldState === newState) return;

    // ── Terminal state guards ──
    if (oldState === SystemState.KILLED) {
      logger.error(
        { attempted: newState, reason },
        'BLOCKED: Cannot transition out of KILLED — process restart required',
      );
      return;
    }
    if (oldState === SystemState.SAFE_MODE && newState !== SystemState.KILLED) {
      logger.error(
        { attempted: newState, reason },
        'BLOCKED: SAFE_MODE can only transition to KILLED — human intervention required',
      );
      return;
    }

    // ── Transition validation (soft — logs warning, does not block) ──
    const allowedNext = ALLOWED_STATE_TRANSITIONS.get(oldState);
    if (allowedNext && !allowedNext.has(newState)) {
      logger.warn(
        { from: oldState, to: newState, reason },
        `Non-standard state transition: ${oldState} → ${newState}`,
      );
    }

    this.systemState = newState;
    const requestId = generateRequestId();

    await this.db.systemState.create({
      data: {
        state: newState,
        previousState: oldState,
        reason,
        triggeredBy: 'system',
      },
    });

    await this.audit.recordStateChange(requestId, oldState, newState, reason);
    eventBus.emit('system:state-change', { from: oldState, to: newState, reason });

    logger.info({ from: oldState, to: newState, reason }, `State: ${oldState} → ${newState}`);

    if (newState === SystemState.KILLED) {
      // Emergency liquidation before stopping — ensures no open positions remain
      await this.liquidateAllPositions(`Kill switch activated: ${reason}`).catch((err) => {
        logger.error({ err }, 'Emergency liquidation failed during kill switch — proceeding with stop');
      });
      await this.stop();
    }
  }

  /** Set trading mode with safety checks */
  async setTradingMode(mode: TradingMode, confirmationCode?: string): Promise<void> {
    if (mode === TradingMode.LIVE) {
      const expected = process.env['LIVE_CONFIRMATION_CODE'];
      if (!expected || confirmationCode !== expected) {
        throw new Error('Invalid confirmation code for LIVE mode');
      }
      // Run preflight checks — throws if any condition fails
      await this.goLivePreflightCheck();
    }
    this.tradingMode = mode;
    await this.db.botConfig.update({
      where: { id: 'default' },
      data: { mode },
    });
    logger.warn({ mode }, `Trading mode changed to ${mode}`);
  }

  /** Start the orchestrator */
  async start(): Promise<void> {
    logger.info('╔══════════════════════════════════════════╗');
    logger.info('║     MainOrchestrator — Starting...       ║');
    logger.info('╚══════════════════════════════════════════╝');

    try {
      // ── Phase 0: Interface validation ──
      // Abort startup if any critical service method is missing.
      this.validateInterfaces();

      // Load config from DB
      await this.loadConfig();

      // Connect exchange adapter
      await this.adapter.connect();

      // Start market data
      const simMode = this.tradingMode === TradingMode.SIM;
      const restBaseUrl = this.tradingMode === TradingMode.LIVE
        ? 'https://api.binance.com'
        : this.tradingMode === TradingMode.DEMO
          ? 'https://testnet.binance.vision'
          : undefined;
      await this.marketData.start(this.riskLimits.allowedSymbols, simMode, restBaseUrl);

      // Seed Redis counters from DB (prevents reset on restart)
      await this.portfolio.initializeCountersFromDb();

      // Reconcile if needed
      if (this.tradingMode !== TradingMode.SIM) {
        await this.setSystemState(SystemState.RECONCILING, 'Startup reconciliation');
        const result = await this.portfolio.reconcile();
        if (result.requiresSafeMode) {
          await this.setSystemState(SystemState.SAFE_MODE, 'Reconciliation found discrepancies');
          await this.notifications.critical('SAFE MODE', 'Reconciliation failed — manual intervention required');
          return;
        }
      }

      // Transition to RUNNING
      await this.setSystemState(SystemState.RUNNING, 'Initialization complete');
      this.running = true;

      // Wait for initial data
      await sleep(2000);

      // Start reconciliation job and clock drift monitor (skip in SIM mode — no real exchange)
      if (this.tradingMode !== TradingMode.SIM) {
        this.reconciliationJob.start(5 * 60 * 1000); // every 5 minutes
        this.startClockDriftMonitor();
      }

      // Start decision loop
      this.loopInterval = setInterval(
        () => this.decisionLoop(),
        this.decisionIntervalSec * 1000,
      );

      logger.info(
        { mode: this.tradingMode, interval: this.decisionIntervalSec },
        'Decision loop started',
      );

      await this.audit.record({
        requestId: generateRequestId(),
        tradeId: null,
        eventType: AuditEventType.SYSTEM_START,
        source: 'orchestrator',
        payload: { mode: this.tradingMode, interval: this.decisionIntervalSec },
        summary: `System started in ${this.tradingMode} mode`,
        severity: 'INFO',
      });
    } catch (error) {
      logger.fatal({ error }, 'Failed to start orchestrator');
      await this.setSystemState(SystemState.KILLED, `Startup failed: ${error}`);
      throw error;
    }
  }

  /** Stop the orchestrator */
  async stop(): Promise<void> {
    this.running = false;
    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }
    this.reconciliationJob.stop();
    this.stopClockDriftMonitor();
    await this.marketData.stop();
    await this.adapter.disconnect();
    logger.info('Orchestrator stopped');
  }

  /**
   * Emergency liquidation — immediately close ALL open positions at market price.
   * Called by kill switch and /positions/emergency-liquidate endpoint.
   * Continues even if individual position closes fail; collects all errors.
   */
  async liquidateAllPositions(reason: string): Promise<void> {
    logger.error({ reason }, '⚠ EMERGENCY LIQUIDATION — closing all open positions at market');

    const openPositions = await this.db.position.findMany({
      where: { status: { in: ['OPEN', 'EXIT_PENDING'] } },
    });

    if (openPositions.length === 0) {
      logger.info('Emergency liquidation: no open positions found');
      return;
    }

    const reqId = generateRequestId();
    const errors: string[] = [];

    for (const pos of openPositions) {
      try {
        const side = pos.side === 'LONG' ? OrderSide.SELL : OrderSide.BUY;
        // Use unique clientOrderId to avoid idempotency collisions
        const clientOrderId = `emrg_${pos.id.slice(-8)}_${Date.now()}`;

        const response = await this.adapter.placeOrder({
          symbol: pos.symbol,
          side,
          type: EntryType.MARKET,
          quantity: pos.quantity,
          price: null,
          clientOrderId,
        });

        if (response.success) {
          const fillPrice = response.averagePrice ?? pos.entryPrice;
          await this.portfolio.closePosition(
            pos.id, clientOrderId, fillPrice, ExitReason.KILL_SWITCH, response.commission ?? 0,
          );
          logger.info(
            { positionId: pos.id, symbol: pos.symbol, fillPrice, side },
            'Emergency liquidation: position closed',
          );
        } else {
          const msg = `${pos.symbol}: ${response.errorMessage ?? 'unknown error'}`;
          errors.push(msg);
          logger.error({ positionId: pos.id, error: response.errorMessage }, 'Emergency liquidation: order rejected');
        }
      } catch (err) {
        const msg = `${pos.symbol}: ${err instanceof Error ? err.message : String(err)}`;
        errors.push(msg);
        logger.error({ positionId: pos.id, error: msg }, 'Emergency liquidation: exception');
      }
    }

    await this.audit.record({
      requestId: reqId,
      tradeId: null,
      eventType: AuditEventType.SYSTEM_STOP,
      source: 'emergency_liquidation',
      payload: { reason, positionCount: openPositions.length, errors },
      summary: `Emergency liquidation: ${openPositions.length} positions, ${errors.length} errors. Reason: ${reason}`,
      severity: errors.length > 0 ? 'CRITICAL' : 'WARN',
    });

    if (errors.length > 0) {
      await this.notifications.critical(
        'EMERGENCY LIQUIDATION INCOMPLETE',
        `${errors.length}/${openPositions.length} positions failed to close:\n${errors.join('\n')}`,
      );
    } else {
      await this.notifications.critical(
        'EMERGENCY LIQUIDATION COMPLETE',
        `All ${openPositions.length} open positions closed. Reason: ${reason}`,
      );
    }
  }

  /** Main decision loop — runs on every tick */
  private async decisionLoop(): Promise<void> {
    if (!this.running) return;

    // ── Auto-recovery from DEGRADED ──
    // If all allowed symbols have fresh data again, restore RUNNING automatically.
    if (this.systemState === SystemState.DEGRADED) {
      const allFresh = this.riskLimits?.allowedSymbols.every((s) =>
        this.marketData.isDataFresh(s, MARKET_DATA_GAP_DEGRADED_MS),
      ) ?? false;
      if (allFresh) {
        await this.setSystemState(SystemState.RUNNING, 'Market data recovered — auto-resuming from DEGRADED');
        this.firedKillSwitches.delete('MARKET_DATA_GAP');
      } else {
        return; // Still degraded
      }
    }

    if (NON_TRADING_STATES.has(this.systemState)) {
      return;
    }

    const requestId = generateRequestId();

    try {
      // Process each allowed symbol
      for (const symbol of this.riskLimits.allowedSymbols) {
        await this.processSymbol(symbol, requestId);
      }

      // Track open orders
      await this.executionOrch.trackOpenOrders();
    } catch (error) {
      logger.error({ requestId, error }, 'Decision loop error');
      await this.handleIncident(requestId, IncidentType.EXCHANGE_ERROR, 'Decision loop error', error);
    }
  }

  /** Process a single symbol through the full pipeline */
  private async processSymbol(symbol: string, requestId: string): Promise<void> {
    const cycleStart = Date.now();

    // If exit is in progress for this symbol, skip decision to prevent duplicates
    if (this.exitingSymbols.has(symbol)) {
      logger.info({ symbol }, 'Exit in progress — skipping decision cycle');
      return;
    }

    // Step 1: Get market data
    const snapshot = this.marketData.getSnapshot(symbol);
    if (!snapshot) {
      logger.debug({ symbol }, 'No market snapshot available');
      return;
    }

    // Step 2: Market data gap detection — classify by severity
    const dataAge = snapshot.dataAgeMs;
    if (dataAge > MARKET_DATA_GAP_PAUSED_MS) {
      // Critical gap: data older than 5s → pause the entire system
      if (!this.firedKillSwitches.has('MARKET_DATA_GAP')) {
        this.firedKillSwitches.add('MARKET_DATA_GAP');
        logger.error({ symbol, dataAge }, `Market data critical gap (${dataAge}ms > ${MARKET_DATA_GAP_PAUSED_MS}ms) — PAUSING system`);
        await this.handleIncident(
          requestId,
          IncidentType.MARKET_DATA_GAP,
          `Critical market data gap: ${symbol}`,
          new Error(`Data age ${dataAge}ms exceeds ${MARKET_DATA_GAP_PAUSED_MS}ms critical threshold`),
        );
      }
      return;
    }
    if (dataAge > MARKET_DATA_GAP_DEGRADED_MS) {
      // Degraded gap: data older than 2s → degrade the system
      if (this.systemState === SystemState.RUNNING) {
        logger.warn({ symbol, dataAge }, `Market data stale (${dataAge}ms > ${MARKET_DATA_GAP_DEGRADED_MS}ms) — transitioning to DEGRADED`);
        await this.setSystemState(
          SystemState.DEGRADED,
          `Market data stale: ${symbol} (${dataAge}ms > ${MARKET_DATA_GAP_DEGRADED_MS}ms)`,
        );
      }
      return;
    }
    // Data is fresh — ensure kill switch clears on recovery
    this.firedKillSwitches.delete('MARKET_DATA_GAP');
    await this.resolveActiveIncidents(
      IncidentType.MARKET_DATA_GAP,
      `Recovered automatically: fresh market data for ${symbol}`,
    );

    // Step 3: Pre-flight risk check
    const t3 = Date.now();
    const riskState = await this.portfolio.getRiskState();
    if (riskState.cooldownUntil && Date.now() < riskState.cooldownUntil) {
      const cooldownRemainingSec = Math.ceil((riskState.cooldownUntil - Date.now()) / 1000);
      logger.debug({ symbol, cooldownRemainingSec }, 'Cooldown active — skipping');
      return;
    }
    const riskStateMs = Date.now() - t3;

    // Step 4: Compute features
    const t4 = Date.now();
    const portfolio = await this.portfolio.getSummary();
    const openPositions = portfolio.openPositions.filter((p) => p.symbol === symbol);
    const hasPosition = openPositions.length > 0;
    const currentPos = openPositions[0];

    const positionContext = {
      hasPosition,
      side: currentPos ? (currentPos.side as 'LONG' | 'SHORT') : null,
      entryPrice: currentPos?.entryPrice ?? null,
      quantity: currentPos?.quantity ?? null,
      notional: currentPos?.notional ?? null,
      unrealizedPnl: currentPos?.unrealizedPnl ?? null,
      unrealizedPnlPercent: currentPos?.unrealizedPnlPercent ?? null,
      holdingTimeSec: currentPos?.holdingTimeSec ?? null,
    };

    const accountContext = {
      availableBalance: portfolio.availableBalance,
      totalEquity: portfolio.totalEquity,
      dailyPnl: portfolio.dailyPnl,
      dailyTradeCount: portfolio.dailyTradeCount,
      consecutiveLosses: portfolio.consecutiveLosses,
      lastTradeResult: null as 'WIN' | 'LOSS' | null,
    };

    const baseContext = this.featureEngine.computeContext(
      snapshot, positionContext, accountContext, this.strategyConfig,
    );
    const phaseAReports = await this.phaseAAnalysis.analyze(snapshot, baseContext.features);
    const context = {
      ...baseContext,
      phaseA: phaseAReports,
    };
    const featuresMs = Date.now() - t4;

    // Step 5: Update mark-to-market (fire and forget — non-critical path)
    if (hasPosition) {
      this.portfolio.updateMarkToMarket(symbol, snapshot.ticker.last).catch((e) => {
        logger.warn({ symbol, error: e }, 'Mark-to-market update failed (non-critical)');
      });
    }

    // Step 6: Consult Claude — regime classification + veto + exit signal only
    // Claude DOES NOT open trades. DeterministicEntryEngine handles entries.
    const t6 = Date.now();
    const assessmentRecord = await this.decisionEngine.assessMarket(context);
    const claudeMs = Date.now() - t6;

    await this.audit.recordDecision(
      requestId, null,
      assessmentRecord.isFallback ? AuditEventType.DECISION_FALLBACK : AuditEventType.DECISION_RECEIVED,
      {
        regime: assessmentRecord.assessment.regime,
        entry_veto: assessmentRecord.assessment.entry_veto,
        should_exit: assessmentRecord.assessment.should_exit,
        exit_reason: assessmentRecord.assessment.exit_reason,
        confidence: assessmentRecord.assessment.confidence,
        market_intelligence: phaseAReports.marketIntelligence.summary,
        technical_analysis: phaseAReports.technicalAnalysis.summary,
        isFallback: assessmentRecord.isFallback,
        latencyMs: assessmentRecord.latencyMs,
      },
      `Assessment: ${assessmentRecord.assessment.regime}` +
      `${assessmentRecord.assessment.entry_veto ? ' [VETO]' : ''}` +
      `${assessmentRecord.assessment.should_exit ? ` [EXIT:${assessmentRecord.assessment.exit_reason}]` : ''}`,
    );

    // Step 7: Determine final action
    //   Priority: SL/TP override > EXIT(AI) > BUY > HOLD
    //   - SL/TP: price deterministically crossed stop/take-profit threshold
    //   - EXIT:  AI signals should_exit AND a position is open
    //   - BUY:   DeterministicEntryEngine approves AND AI does not veto AND no open position
    //   - HOLD:  everything else

    let finalDecision: ModelDecision | null = null;
    let failedEntryConditions: string[] = [];

    // ── Step 7a: Deterministic SL/TP override ──
    // Fires before AI to protect positions even when Claude is slow or unavailable.
    // Note: this is soft SL/TP (checked each cycle). For hard exchange-side SL/TP,
    // OCO orders must be implemented on top of this.
    if (hasPosition && currentPos && !this.exitingSymbols.has(symbol)) {
      const entryOrder = await this.db.orderRequest.findUnique({
        where: { id: currentPos.entryOrderId },
        select: { stopPrice: true, takeProfitPrice: true },
      });
      const price = snapshot.ticker.last;
      const isLong = currentPos.side === 'LONG';
      const sl = entryOrder?.stopPrice ?? 0;
      const tp = entryOrder?.takeProfitPrice ?? 0;
      const slHit = sl > 0 && (isLong ? price <= sl : price >= sl);
      const tpHit = tp > 0 && (isLong ? price >= tp : price <= tp);

      if (slHit || tpHit) {
        const exitReason = slHit ? ExitReason.STOP_LOSS : ExitReason.TAKE_PROFIT;
        logger.warn(
          { symbol, price, sl, tp, side: currentPos.side, exitReason },
          `${exitReason} triggered — forcing deterministic EXIT`,
        );
        finalDecision = {
          action: TradeAction.EXIT,
          symbol,
          confidence: 1.0,
          entry_type: EntryType.MARKET,
          entry_price: price,
          size_quote: 0,
          stop_price: 0,
          take_profit_price: 0,
          max_slippage_bps: 15,
          time_horizon_sec: 30,
          thesis: `[DETERMINISTIC] ${exitReason} — ${isLong ? 'LONG' : 'SHORT'} price=${price} SL=${sl} TP=${tp}`,
          invalidate_if: [],
          exit_reason: exitReason,
        };
      }
    }

    // ── Step 7b: AI exit signal (skipped if SL/TP already forced exit) ──
    if (!finalDecision && assessmentRecord.assessment.should_exit && hasPosition) {
      // AI signalled exit — build EXIT decision
      finalDecision = {
        action: TradeAction.EXIT,
        symbol,
        confidence: assessmentRecord.assessment.confidence,
        entry_type: EntryType.MARKET,
        entry_price: snapshot.ticker.bid,  // Use bid as proxy for exit price
        size_quote: 0,
        stop_price: 0,
        take_profit_price: 0,
        max_slippage_bps: 15,
        time_horizon_sec: 30,
        thesis: assessmentRecord.assessment.exit_thesis || assessmentRecord.assessment.thesis,
        invalidate_if: [],
        exit_reason: assessmentRecord.assessment.exit_reason ?? ExitReason.REGIME_EXIT,
      };

      logger.info(
        {
          symbol,
          exit_reason: finalDecision.exit_reason,
          regime: assessmentRecord.assessment.regime,
          thesis: finalDecision.thesis,
        },
        `AI exit signal: ${finalDecision.exit_reason}`,
      );
    }

    // ── Step 7c: Deterministic entry (only when no exit decision and no open position) ──
    if (!finalDecision && !hasPosition && !assessmentRecord.assessment.entry_veto) {
      // No position — evaluate deterministic entry conditions
      const entryCandidate = this.deterministicEntry.evaluate(
        context.features,
        snapshot.ticker,
        {
          ...DeterministicEntryEngine.fromStrategyConfig(this.strategyConfig),
          // sizeQuote: not in StrategyConfig — DeterministicEntryEngine uses its own default (50 USDT)
        },
      );

      failedEntryConditions = entryCandidate.failedConditions;

      if (entryCandidate.shouldEnter) {
        finalDecision = {
          action: TradeAction.BUY,
          symbol,
          confidence: assessmentRecord.assessment.confidence,
          entry_type: entryCandidate.entryType,
          entry_price: entryCandidate.entryPrice,
          size_quote: entryCandidate.sizeQuote,
          stop_price: entryCandidate.stopPrice,
          take_profit_price: entryCandidate.takeProfitPrice,
          max_slippage_bps: entryCandidate.maxSlippageBps,
          time_horizon_sec: entryCandidate.timeHorizonSec,
          thesis: `[DETERMINISTIC] ${entryCandidate.reason} | AI regime: ${assessmentRecord.assessment.regime}`,
          invalidate_if: [],
          exit_reason: null,
        };

        logger.info(
          {
            symbol,
            entryPrice: entryCandidate.entryPrice,
            stopPrice: entryCandidate.stopPrice,
            takeProfitPrice: entryCandidate.takeProfitPrice,
            sizeQuote: entryCandidate.sizeQuote,
            regime: assessmentRecord.assessment.regime,
          },
          'Deterministic entry: BUY candidate approved by AI regime',
        );
      }
    }

    // Step 7b: If HOLD (no action), log trace and return
    if (!finalDecision) {
      const pipelineStageStoppedAt = assessmentRecord.assessment.entry_veto
        ? 'AI_VETO'
        : failedEntryConditions.length > 0
          ? 'ENTRY_RULES_FAILED'
          : hasPosition
            ? 'NO_EXIT_SIGNAL'
            : 'NO_ACTION';
      const holdReason = assessmentRecord.assessment.entry_veto
        ? `AI veto: ${assessmentRecord.assessment.entry_veto_reason}`
        : failedEntryConditions.length > 0
          ? `Entry blocked: ${failedEntryConditions.join('; ')}`
          : 'No entry conditions met / no exit signal';

      try {
        await this.db.modelDecision.update({
          where: { id: assessmentRecord.id },
          data: {
            decision: {
              ...(assessmentRecord.assessment as unknown as Record<string, unknown>),
              hold_reason: holdReason,
              pipeline_stage_stopped_at: pipelineStageStoppedAt,
              failed_entry_conditions: failedEntryConditions,
            } as Prisma.InputJsonValue,
          },
        });
      } catch (error) {
        logger.warn({ symbol, assessmentId: assessmentRecord.id, error }, 'Failed to persist HOLD diagnostics');
      }

      logger.debug(
        {
          symbol,
          regime: assessmentRecord.assessment.regime,
          entry_veto: assessmentRecord.assessment.entry_veto,
          pipelineStageStoppedAt,
          failedEntryConditions,
          riskStateMs,
          featuresMs,
          claudeMs,
          totalMs: Date.now() - cycleStart,
          thesis: assessmentRecord.assessment.thesis,
          holdReason,
        },
        'Cycle complete: HOLD',
      );
      return;
    }

    // Step 8: Risk review
    const review = this.riskEngine.evaluate(
      finalDecision,
      this.riskLimits,
      riskState,
      portfolio,
      this.systemState,
      snapshot.dataAgeMs,
    );

    // Link review to the assessment record ID
    review.decisionId = assessmentRecord.id;
    review.requestId = requestId;

    // Persist risk review
    await this.db.riskReview.create({
      data: {
        decisionId: assessmentRecord.id,
        requestId,
        verdict: review.verdict,
        denialReasons: review.denialReasons,
        adjustedParams: review.adjustedParams as unknown as Prisma.InputJsonValue | undefined,
        explanation: review.explanation,
        checksPerformed: review.checksPerformed as unknown as Prisma.InputJsonValue,
      },
    });

    const auditEventType = review.verdict === RiskVerdict.APPROVED
      ? AuditEventType.RISK_APPROVED
      : review.verdict === RiskVerdict.ADJUSTED
        ? AuditEventType.RISK_ADJUSTED
        : AuditEventType.RISK_DENIED;

    await this.audit.recordRisk(requestId, null, auditEventType, {
      verdict: review.verdict,
      denialReasons: review.denialReasons,
    }, `Risk: ${review.verdict} — ${review.explanation}`);

    // Step 9: If denied, log structured trace and apply kill switches
    if (review.verdict === RiskVerdict.DENIED) {
      logger.info(
        {
          symbol,
          action: finalDecision.action,
          confidence: finalDecision.confidence,
          reasons: review.denialReasons,
          riskStateMs,
          featuresMs,
          claudeMs,
          totalMs: Date.now() - cycleStart,
        },
        `Decision DENIED [${review.denialReasons.join(', ')}]`,
      );

      // ── Kill switch triggers on specific denial reasons ──
      if (review.denialReasons.includes(RiskDenialReason.CONSECUTIVE_LOSSES)) {
        await this.portfolio.setCooldown(this.riskLimits.cooldownAfterLossMinutes);
        if (!this.firedKillSwitches.has('CONSECUTIVE_LOSSES')) {
          this.firedKillSwitches.add('CONSECUTIVE_LOSSES');
          await this.handleIncident(
            requestId,
            IncidentType.CONSECUTIVE_LOSSES,
            'Consecutive loss limit reached',
            new Error(`${riskState.consecutiveLosses} consecutive losses — cooldown activated`),
          );
        }
      }

      if (review.denialReasons.includes(RiskDenialReason.DAILY_LOSS_EXCEEDED)) {
        if (!this.firedKillSwitches.has('DAILY_LOSS_LIMIT')) {
          this.firedKillSwitches.add('DAILY_LOSS_LIMIT');
          await this.handleIncident(
            requestId,
            IncidentType.DAILY_LOSS_LIMIT,
            'Daily loss limit reached — trading suspended',
            new Error(`Daily PnL: ${riskState.dailyPnl} (limit: ${this.riskLimits.maxDailyLoss})`),
          );
        }
      }

      if (review.denialReasons.includes(RiskDenialReason.WEEKLY_LOSS_EXCEEDED)) {
        if (!this.firedKillSwitches.has('WEEKLY_LOSS_LIMIT')) {
          this.firedKillSwitches.add('WEEKLY_LOSS_LIMIT');
          await this.handleIncident(
            requestId,
            IncidentType.WEEKLY_LOSS_LIMIT,
            'Weekly loss limit reached — trading suspended',
            new Error(`Weekly PnL: ${riskState.weeklyPnl} (limit: ${this.riskLimits.maxWeeklyLoss})`),
          );
        }
      }

      if (review.denialReasons.includes(RiskDenialReason.SPREAD_TOO_WIDE)) {
        if (!this.firedKillSwitches.has('SPREAD_TOO_WIDE')) {
          this.firedKillSwitches.add('SPREAD_TOO_WIDE');
          await this.handleIncident(
            requestId,
            IncidentType.SPREAD_TOO_WIDE,
            'Excessive spread detected',
            new Error(`Spread ${context.features.spreadBps}bps exceeds limit ${this.riskLimits.maxSpreadBps}bps`),
          );
        }
      }

      return;
    }

    // Step 10: Execute
    const execStart = Date.now();
    const orderId = await this.executionOrch.execute(
      finalDecision, review, requestId,
    );
    const execLatencyMs = Date.now() - execStart;

    if (orderId) {
      logger.info(
        { symbol, action: finalDecision.action, orderId, execLatencyMs },
        'Order executed',
      );
      // NOTE: incrementTradesHour() is called exclusively inside ExecutionOrchestrator.processFill()
    }

    // Step 11: Handle EXIT post-execution
    if (finalDecision.action === TradeAction.EXIT) {
      if (orderId) {
        this.exitingSymbols.add(symbol);
        setTimeout(() => { this.exitingSymbols.delete(symbol); }, 60_000);
      } else if (review.verdict === RiskVerdict.APPROVED) {
        logger.error(
          { symbol, assessmentId: assessmentRecord.id },
          'EXIT approved but no exit order created — incident raised',
        );
        await this.createIncident(
          requestId,
          IncidentType.EXCHANGE_ERROR,
          'EXIT_ORDER_MISSING',
          `EXIT decision was APPROVED for ${symbol} but execution failed to create an exit order`,
        );
      }
    }

    // Check if position just closed — clear exit lock
    const latestPosition = await this.db.position.findFirst({
      where: { symbol, status: { in: ['OPEN', 'EXIT_PENDING'] } },
      orderBy: { openedAt: 'desc' },
    });
    if (!latestPosition) {
      this.exitingSymbols.delete(symbol);
    }

    logger.info(
      {
        symbol,
        action: finalDecision.action,
        orderId,
        regime: assessmentRecord.assessment.regime,
        riskStateMs,
        featuresMs,
        claudeMs,
        totalMs: Date.now() - cycleStart,
      },
      `Cycle complete: ${finalDecision.action} → ${orderId ? 'executed' : 'skipped'}`,
    );
  }

  /** Create an incident record */
  private async createIncident(
    requestId: string,
    type: IncidentType,
    title: string,
    description: string,
  ): Promise<void> {
    const severity = IncidentSeverity.WARNING;
    const incident = await this.db.incident.create({
      data: {
        requestId,
        type,
        severity,
        title,
        description,
        actionTaken: 'LOGGED',
        isActive: true,
      },
    });
    eventBus.emit('incident:created', { incidentId: incident.id, type, severity });
    await this.notifications.warning(title, description);
  }

  /** Resolve stale active incidents once the underlying condition has recovered. */
  private async resolveActiveIncidents(type: IncidentType, resolutionNotes: string): Promise<void> {
    const result = await this.db.incident.updateMany({
      where: { type, isActive: true },
      data: {
        isActive: false,
        resolvedAt: new Date(),
        resolutionNotes,
      },
    });

    if (result.count > 0) {
      logger.info({ type, count: result.count }, 'Resolved recovered incidents');
    }
  }

  /** Load configuration from database */
  private async loadConfig(): Promise<void> {
    const riskLimits = await this.db.riskLimits.findFirst({ where: { isActive: true } });
    if (!riskLimits) throw new Error('No active risk limits found');

    const strategyConfig = await this.db.strategyConfig.findFirst({ where: { isActive: true } });
    if (!strategyConfig) throw new Error('No active strategy config found');

    this.riskLimits = {
      maxPositionNotional: riskLimits.maxPositionNotional,
      maxTotalExposureNotional: riskLimits.maxTotalExposureNotional,
      maxOpenPositions: riskLimits.maxOpenPositions,
      maxDailyLoss: riskLimits.maxDailyLoss,
      maxWeeklyLoss: riskLimits.maxWeeklyLoss,
      maxTradesPerHour: riskLimits.maxTradesPerHour,
      maxConsecutiveLosses: riskLimits.maxConsecutiveLosses,
      cooldownAfterLossMinutes: riskLimits.cooldownAfterLossMinutes,
      maxSpreadBps: riskLimits.maxSpreadBps,
      maxSlippageBps: riskLimits.maxSlippageBps,
      allowedSymbols: riskLimits.allowedSymbols,
      allowedSessions: riskLimits.allowedSessions,
      dataFreshnessMaxMs: riskLimits.dataFreshnessMaxMs,
      maxOrderRetries: riskLimits.maxOrderRetries,
      killOnExchangeDesync: riskLimits.killOnExchangeDesync,
      killOnMarketDataGap: riskLimits.killOnMarketDataGap,
      killOnUnexpectedPosition: riskLimits.killOnUnexpectedPosition,
      killOnRepeatedRejections: riskLimits.killOnRepeatedRejections,
      noTradeDuringIncident: riskLimits.noTradeDuringIncident,
      noTradeWhenBalanceBelowThreshold: riskLimits.noTradeWhenBalanceBelowThreshold,
      minBalanceThreshold: riskLimits.minBalanceThreshold,
      minConfidence: riskLimits.minConfidence,
      allowPyramiding: riskLimits.allowPyramiding,
    };

    this.strategyConfig = strategyConfig as unknown as StrategyConfig;

    logger.info(
      { symbols: this.riskLimits.allowedSymbols, strategy: strategyConfig.name },
      'Configuration loaded',
    );
  }

  /** Handle an incident — CRITICAL types pause the system, FATAL types kill it */
  private async handleIncident(
    requestId: string,
    type: IncidentType,
    title: string,
    error: unknown,
  ): Promise<void> {
    const description = error instanceof Error ? error.message : String(error);

    // ── Escalation: >3 occurrences of any incident type → CRITICAL ──
    const count = (this.incidentCounts.get(type) ?? 0) + 1;
    this.incidentCounts.set(type, count);

    const isCritical = CRITICAL_INCIDENT_TYPES.has(type) || count > 3;
    if (!CRITICAL_INCIDENT_TYPES.has(type) && count > 3) {
      logger.error(
        { type, count },
        `Incident ${type} has occurred ${count} times — escalating to CRITICAL`,
      );
    }

    const severity = isCritical ? IncidentSeverity.CRITICAL : IncidentSeverity.WARNING;

    await this.db.incident.create({
      data: {
        requestId,
        type,
        severity,
        title,
        description,
        actionTaken: isCritical ? 'PAUSED' : 'LOGGED',
        isActive: true,
      },
    });

    eventBus.emit('incident:created', { incidentId: requestId, type, severity });

    if (isCritical) {
      logger.error({ type, title, description }, `CRITICAL incident — pausing system`);
      await this.setSystemState(SystemState.PAUSED, `Critical incident: ${title}`);
      await this.notifications.critical(title, description);
    } else {
      logger.warn({ type, title, description }, `Incident logged`);
      await this.notifications.warning(title, description);
    }
  }

  /**
   * Trigger a reconciliation cycle — used after execution errors to verify
   * exchange state matches local state.
   */
  private async triggerReconciliation(reason: string): Promise<void> {
    if (this.tradingMode === TradingMode.SIM) return;
    if (this.systemState === SystemState.RECONCILING) return;
    if (this.systemState === SystemState.KILLED) return;

    logger.warn({ reason }, 'Triggering reconciliation');
    await this.setSystemState(SystemState.RECONCILING, `Reconciliation triggered: ${reason}`);
    const result = await this.portfolio.reconcile();

    if (result.requiresSafeMode) {
      await this.setSystemState(SystemState.SAFE_MODE, 'Reconciliation found critical discrepancies');
      await this.notifications.critical('SAFE MODE', 'Reconciliation failed — manual intervention required');
    } else {
      await this.setSystemState(SystemState.PAUSED, 'Reconciliation complete — awaiting manual resume');
      await this.notifications.warning('Reconciliation complete', `Triggered by: ${reason}. System is PAUSED.`);
    }
  }

  /** Setup event handlers for automatic reactions */
  private setupEventHandlers(): void {
    // Market data gap from the MarketDataService staleness checker
    eventBus.on('market:gap', async ({ symbol, gapMs }: { symbol: string; gapMs: number }) => {
      if (!this.riskLimits?.killOnMarketDataGap) return;
      // Only fire once per gap episode (firedKillSwitches prevents repeated incidents)
      if (this.firedKillSwitches.has('MARKET_DATA_GAP')) return;
      this.firedKillSwitches.add('MARKET_DATA_GAP');
      await this.handleIncident(
        generateRequestId(),
        IncidentType.MARKET_DATA_GAP,
        `Market data gap: ${symbol}`,
        new Error(`Data gap of ${gapMs}ms detected for ${symbol}`),
      );
    });

    // Execution critical error — pause system and trigger reconciliation
    eventBus.on('execution:critical-error', async ({ symbol, error, action }: { symbol: string; error: string; action: string }) => {
      const reqId = generateRequestId();
      await this.handleIncident(
        reqId,
        IncidentType.EXECUTION_FAILED,
        `Execution critical failure: ${action} ${symbol}`,
        new Error(error),
      );
      await this.triggerReconciliation(`execution_error:${action}:${symbol}`);
    });

    // Manual kill switch via event bus
    eventBus.on('system:kill', async ({ reason }: { reason: string }) => {
      await this.setSystemState(SystemState.KILLED, reason);
    });
  }

  // ─────────────────────────────────────────────────────────
  // CLOCK DRIFT MONITOR
  // ─────────────────────────────────────────────────────────

  /** Start comparing local clock with exchange time every 30 seconds. */
  private startClockDriftMonitor(): void {
    if (this.clockDriftInterval) return;
    this.clockDriftInterval = setInterval(() => this.checkClockDrift(), 30_000);
    void this.checkClockDrift();
    logger.info('Clock drift monitor started');
  }

  private stopClockDriftMonitor(): void {
    if (this.clockDriftInterval) {
      clearInterval(this.clockDriftInterval);
      this.clockDriftInterval = null;
    }
  }

  private async checkClockDrift(): Promise<void> {
    try {
      const before = Date.now();
      const exchangeTime = await this.adapter.getServerTime();
      const after = Date.now();
      // Use midpoint of the request to approximate local time at exchange measurement
      const localTime = Math.round((before + after) / 2);
      const driftMs = Math.abs(localTime - exchangeTime);

      this.lastClockDriftMs = driftMs;
      this.lastClockDriftCheckedAt = new Date();

      if (driftMs > CLOCK_DRIFT_PAUSE_MS) {
        if (!this.firedKillSwitches.has('CLOCK_DRIFT')) {
          this.firedKillSwitches.add('CLOCK_DRIFT');
          logger.error({ driftMs }, `Clock drift CRITICAL (${driftMs}ms > ${CLOCK_DRIFT_PAUSE_MS}ms) — PAUSING system`);
          await this.handleIncident(
            generateRequestId(),
            IncidentType.CLOCK_DRIFT,
            `Clock drift critical: ${driftMs}ms`,
            new Error(`Local clock differs from exchange by ${driftMs}ms — exceeds ${CLOCK_DRIFT_PAUSE_MS}ms threshold`),
          );
        }
      } else if (driftMs > CLOCK_DRIFT_WARNING_MS) {
        if (!this.clockDriftWarningFired) {
          this.clockDriftWarningFired = true;
          logger.warn({ driftMs }, `Clock drift WARNING (${driftMs}ms > ${CLOCK_DRIFT_WARNING_MS}ms)`);
          await this.handleIncident(
            generateRequestId(),
            IncidentType.CLOCK_DRIFT,
            `Clock drift warning: ${driftMs}ms`,
            new Error(`Local clock differs from exchange by ${driftMs}ms — exceeds ${CLOCK_DRIFT_WARNING_MS}ms threshold`),
          );
        }
      } else {
        // Drift recovered — clear flags
        this.clockDriftWarningFired = false;
        this.firedKillSwitches.delete('CLOCK_DRIFT');
        await this.resolveActiveIncidents(
          IncidentType.CLOCK_DRIFT,
          `Recovered automatically: clock drift back within ${CLOCK_DRIFT_WARNING_MS}ms`,
        );
      }
    } catch (error) {
      logger.warn({ error }, 'Clock drift check failed — could not reach exchange');
    }
  }

  // ─────────────────────────────────────────────────────────
  // SYSTEM HEALTH REPORT
  // ─────────────────────────────────────────────────────────

  /** Return a comprehensive health report for diagnostics. */
  async getHealth(): Promise<SystemHealthReport> {
    const now = new Date().toISOString();

    // ── Database ──
    const dbStart = Date.now();
    const dbHealth = await this.db.$queryRaw`SELECT 1`
      .then(() => ({ healthy: true, latencyMs: Date.now() - dbStart, lastCheckedAt: now }))
      .catch((e: unknown) => ({
        healthy: false,
        latencyMs: Date.now() - dbStart,
        error: e instanceof Error ? e.message : String(e),
        lastCheckedAt: now,
      }));

    // ── Redis ──
    const redisStart = Date.now();
    const redisHealth = await getRedis().ping()
      .then(() => ({ healthy: true, latencyMs: Date.now() - redisStart, lastCheckedAt: now }))
      .catch((e: unknown) => ({
        healthy: false,
        latencyMs: Date.now() - redisStart,
        error: e instanceof Error ? e.message : String(e),
        lastCheckedAt: now,
      }));

    // ── Exchange ──
    const exchStart = Date.now();
    const exchHealth = await this.adapter.getServerTime()
      .then(() => ({ healthy: true, latencyMs: Date.now() - exchStart, lastCheckedAt: now }))
      .catch((e: unknown) => ({
        healthy: false,
        latencyMs: Date.now() - exchStart,
        error: e instanceof Error ? e.message : String(e),
        lastCheckedAt: now,
      }));

    // ── Market data ──
    const symbols = this.riskLimits?.allowedSymbols ?? [];
    const symbolHealth: Record<string, { fresh: boolean; ageMs: number }> = {};
    let marketDataHealthy = true;
    for (const sym of symbols) {
      const snapshot = this.marketData.getSnapshot(sym);
      const ageMs = snapshot?.dataAgeMs ?? -1;
      const fresh = ageMs >= 0 && ageMs < MARKET_DATA_GAP_PAUSED_MS;
      symbolHealth[sym] = { fresh, ageMs };
      if (!fresh) marketDataHealthy = false;
    }
    const marketDataHealth = {
      healthy: marketDataHealthy,
      lastCheckedAt: now,
      symbols: symbolHealth,
    };

    // ── Clock drift (last known value) ──
    const clockDriftHealth = {
      healthy: this.lastClockDriftMs < CLOCK_DRIFT_WARNING_MS,
      driftMs: this.lastClockDriftMs,
      lastCheckedAt: this.lastClockDriftCheckedAt?.toISOString() ?? 'never',
    };

    // ── Overall status ──
    const allHealthy = dbHealth.healthy && redisHealth.healthy && exchHealth.healthy && marketDataHealthy;
    const anyCritical = !dbHealth.healthy || !redisHealth.healthy;
    const status = anyCritical ? 'error' : allHealthy ? 'ok' : 'degraded';

    const buildInfo = getBuildInfo();

    return {
      status,
      systemState: this.systemState,
      tradingMode: this.tradingMode,
      uptime: process.uptime(),
      version: buildInfo.version,
      checks: {
        database: dbHealth,
        redis: redisHealth,
        exchange: exchHealth,
        marketData: marketDataHealth,
        clockDrift: clockDriftHealth,
      },
      buildInfo: {
        gitCommit: buildInfo.gitCommit,
        buildTimestamp: buildInfo.buildTimestamp,
        environment: buildInfo.environment,
        nodeVersion: buildInfo.nodeVersion,
      },
      timestamp: now,
    };
  }

  /**
   * Validate that all required service interfaces are present before startup.
   * Aborts initialization if a critical method is missing.
   */
  private validateInterfaces(): void {
    const execAsMap = this.executionOrch as unknown as Record<string, unknown>;
    for (const method of ['execute', 'executeExit', 'trackOpenOrders', 'cancelOrder']) {
      if (typeof execAsMap[method] !== 'function') {
        throw new Error(
          `STARTUP ABORTED: ExecutionOrchestrator is missing required method: ${method}`,
        );
      }
    }

    const portfolioAsMap = this.portfolio as unknown as Record<string, unknown>;
    for (const method of ['getRiskState', 'getSummary', 'incrementTradesHour', 'reconcile']) {
      if (typeof portfolioAsMap[method] !== 'function') {
        throw new Error(
          `STARTUP ABORTED: PortfolioService is missing required method: ${method}`,
        );
      }
    }

    const decisionAsMap = this.decisionEngine as unknown as Record<string, unknown>;
    if (typeof decisionAsMap['assessMarket'] !== 'function') {
      throw new Error('STARTUP ABORTED: ClaudeDecisionEngine.assessMarket is missing');
    }
    if (typeof decisionAsMap['decide'] === 'function') {
      throw new Error('STARTUP ABORTED: ClaudeDecisionEngine has legacy decide() — remove it before starting');
    }

    const marketDataAsMap = this.marketData as unknown as Record<string, unknown>;
    if (typeof marketDataAsMap['isHealthy'] !== 'function') {
      throw new Error('STARTUP ABORTED: MarketDataService.isHealthy is missing');
    }

    logger.info('Interface validation passed — all required methods present');
  }

  /**
   * Pre-flight check before switching to LIVE mode.
   * Blocks the switch if any critical condition is unmet.
   */
  private async goLivePreflightCheck(): Promise<void> {
    const errors: string[] = [];

    // 1. System must be RUNNING (not PAUSED, DEGRADED, etc.)
    if (this.systemState !== SystemState.RUNNING) {
      errors.push(`System state is ${this.systemState} — must be RUNNING before going LIVE`);
    }

    // 2. No active incidents
    const activeIncidents = await this.db.incident.count({ where: { isActive: true } });
    if (activeIncidents > 0) {
      errors.push(`${activeIncidents} active incident(s) must be resolved before going LIVE`);
    }

    // 3. Market data must be healthy for all allowed symbols
    const symbols = this.riskLimits?.allowedSymbols ?? [];
    for (const sym of symbols) {
      const snapshot = this.marketData.getSnapshot(sym);
      if (!snapshot || snapshot.dataAgeMs > MARKET_DATA_GAP_DEGRADED_MS) {
        errors.push(`Market data for ${sym} is stale or unavailable`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`LIVE preflight FAILED:\n${errors.map((e) => `  • ${e}`).join('\n')}`);
    }

    logger.info('LIVE preflight check passed — all conditions met');
  }
}
