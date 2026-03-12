// ═══════════════════════════════════════════════════════════════
// MainOrchestrator — The heart of the system
// Manages the decision loop, state machine, and module coordination
// ═══════════════════════════════════════════════════════════════

import {
  createLogger,
  generateRequestId,
  eventBus,
  sleep,
} from '@cryptobot/core';
import type { PrismaClient, Prisma } from '@prisma/client';
import {
  SystemState,
  TradingMode,
  TradeAction,
  RiskVerdict,
  RiskDenialReason,
  AuditEventType,
  IncidentType,
  IncidentSeverity,
  NON_TRADING_STATES,
  type RiskLimits,
  type StrategyConfig,
} from '@cryptobot/shared-types';
import { MarketDataService } from '@cryptobot/market-data';
import { FeatureEngine } from '@cryptobot/features';
import { ClaudeDecisionEngine, type DecisionEngineConfig } from '@cryptobot/decision-engine';
import { RiskEngine } from '@cryptobot/risk-engine';
import { ExecutionOrchestrator } from '@cryptobot/execution';
import type { IExchangeAdapter } from '@cryptobot/exchange';
import { PortfolioService } from '@cryptobot/portfolio';
import { AuditService } from '@cryptobot/audit';
import { NotificationService } from '@cryptobot/notifications';

const logger = createLogger('orchestrator');

export class MainOrchestrator {
  private systemState: SystemState = SystemState.INITIALIZING;
  private tradingMode: TradingMode;
  private running = false;
  private loopInterval: ReturnType<typeof setInterval> | null = null;
  /** Symbols with an exit order in-flight — prevents duplicate EXIT cycles */
  private readonly exitingSymbols = new Set<string>();

  // Services
  private marketData: MarketDataService;
  private featureEngine: FeatureEngine;
  private decisionEngine: ClaudeDecisionEngine;
  private riskEngine: RiskEngine;
  private executionOrch: ExecutionOrchestrator;
  private portfolio: PortfolioService;
  private audit: AuditService;
  private notifications: NotificationService;

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
    this.decisionEngine = new ClaudeDecisionEngine(decisionEngineConfig, db);
    this.riskEngine = new RiskEngine();
    this.portfolio = new PortfolioService(db, adapter);
    this.audit = new AuditService(db);
    this.notifications = new NotificationService(webhookUrl);
    this.executionOrch = new ExecutionOrchestrator(adapter, db, this.audit, this.portfolio);

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
    };
  }

  /** Set system state with audit trail */
  async setSystemState(newState: SystemState, reason: string): Promise<void> {
    const oldState = this.systemState;
    if (oldState === newState) return;

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
      // Load config from DB
      await this.loadConfig();

      // Connect exchange adapter
      await this.adapter.connect();

      // Start market data
      const simMode = this.tradingMode === TradingMode.SIM;
      await this.marketData.start(this.riskLimits.allowedSymbols, simMode);

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
    await this.marketData.stop();
    await this.adapter.disconnect();
    logger.info('Orchestrator stopped');
  }

  /** Main decision loop — runs on every tick */
  private async decisionLoop(): Promise<void> {
    if (!this.running || NON_TRADING_STATES.has(this.systemState)) {
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

    // Step 2: Check data freshness
    if (!this.marketData.isDataFresh(symbol, this.riskLimits.dataFreshnessMaxMs)) {
      logger.warn({ symbol, age: snapshot.dataAgeMs }, 'Stale market data — skipping');
      return;
    }

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

    const context = this.featureEngine.computeContext(
      snapshot, positionContext, accountContext, this.strategyConfig,
    );
    const featuresMs = Date.now() - t4;

    // Step 5: Update mark-to-market (fire and forget — non-critical path)
    if (hasPosition) {
      this.portfolio.updateMarkToMarket(symbol, snapshot.ticker.last).catch((e) => {
        logger.warn({ symbol, error: e }, 'Mark-to-market update failed (non-critical)');
      });
    }

    // Step 6: Consult Claude
    const t6 = Date.now();
    const decisionRecord = await this.decisionEngine.decide(context);
    const claudeMs = Date.now() - t6;

    await this.audit.recordDecision(
      requestId, null,
      decisionRecord.isFallback ? AuditEventType.DECISION_FALLBACK : AuditEventType.DECISION_RECEIVED,
      {
        action: decisionRecord.decision.action,
        confidence: decisionRecord.decision.confidence,
        isFallback: decisionRecord.isFallback,
        latencyMs: decisionRecord.latencyMs,
      },
      `Decision: ${decisionRecord.decision.action} (${decisionRecord.decision.confidence})`,
    );

    // Step 7: If HOLD, log trace and return
    if (decisionRecord.decision.action === TradeAction.HOLD) {
      logger.debug(
        {
          symbol,
          riskStateMs,
          featuresMs,
          claudeMs,
          totalMs: Date.now() - cycleStart,
          thesis: decisionRecord.decision.thesis,
        },
        'Cycle complete: HOLD',
      );
      return;
    }

    // Step 8: Risk review
    const review = this.riskEngine.evaluate(
      decisionRecord.decision,
      this.riskLimits,
      riskState,
      portfolio,
      this.systemState,
      snapshot.dataAgeMs,
    );

    // Link review to decision
    review.decisionId = decisionRecord.id;
    review.requestId = requestId;

    // Persist risk review
    await this.db.riskReview.create({
      data: {
        decisionId: decisionRecord.id,
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

    // Step 9: If denied, log structured trace and return
    if (review.verdict === RiskVerdict.DENIED) {
      logger.info(
        {
          symbol,
          action: decisionRecord.decision.action,
          confidence: decisionRecord.decision.confidence,
          reasons: review.denialReasons,
          riskStateMs,
          featuresMs,
          claudeMs,
          totalMs: Date.now() - cycleStart,
        },
        `Decision DENIED [${review.denialReasons.join(', ')}]`,
      );

      // Check if we need cooldown
      if (review.denialReasons.includes(RiskDenialReason.CONSECUTIVE_LOSSES)) {
        await this.portfolio.setCooldown(this.riskLimits.cooldownAfterLossMinutes);
      }
      return;
    }

    // Step 10: Execute
    const execStart = Date.now();
    const orderId = await this.executionOrch.execute(
      decisionRecord.decision, review, requestId,
    );
    const execLatencyMs = Date.now() - execStart;

    if (orderId) {
      logger.info(
        { symbol, action: decisionRecord.decision.action, orderId, execLatencyMs },
        'Order executed',
      );
      // Increment hourly trade counter for non-EXIT actions
      if (decisionRecord.decision.action !== TradeAction.EXIT) {
        await this.portfolio.incrementTradesHour();
      }
    }

    // Step 11: Handle EXIT post-execution
    if (decisionRecord.decision.action === TradeAction.EXIT) {
      if (orderId) {
        // Lock this symbol to prevent duplicate EXIT cycles
        this.exitingSymbols.add(symbol);
        // Auto-clear lock after 60 seconds as failsafe
        setTimeout(() => {
          this.exitingSymbols.delete(symbol);
        }, 60_000);
      } else if (review.verdict === RiskVerdict.APPROVED) {
        // EXIT was approved but execution failed to create an order — raise incident
        logger.error(
          { symbol, decisionId: decisionRecord.id },
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

    // Check if position just closed (e.g. EXIT fill completed) — clear lock
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
        action: decisionRecord.decision.action,
        orderId,
        riskStateMs,
        featuresMs,
        claudeMs,
        totalMs: Date.now() - cycleStart,
      },
      `Cycle complete: ${decisionRecord.decision.action} → ${orderId ? 'executed' : 'skipped'}`,
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

  /** Handle an incident */
  private async handleIncident(
    requestId: string,
    type: IncidentType,
    title: string,
    error: unknown,
  ): Promise<void> {
    const description = error instanceof Error ? error.message : String(error);
    const severity = type === IncidentType.EXCHANGE_DESYNC || type === IncidentType.UNEXPECTED_POSITION
      ? IncidentSeverity.CRITICAL : IncidentSeverity.WARNING;

    await this.db.incident.create({
      data: {
        requestId,
        type,
        severity,
        title,
        description,
        actionTaken: severity === IncidentSeverity.CRITICAL ? 'PAUSED' : 'LOGGED',
        isActive: true,
      },
    });

    eventBus.emit('incident:created', { incidentId: requestId, type, severity });

    if (severity === IncidentSeverity.CRITICAL) {
      await this.setSystemState(SystemState.PAUSED, `Incident: ${title}`);
      await this.notifications.critical(title, description);
    } else {
      await this.notifications.warning(title, description);
    }
  }

  /** Setup event handlers for automatic reactions */
  private setupEventHandlers(): void {
    eventBus.on('market:gap', async ({ symbol, gapMs }) => {
      if (this.riskLimits?.killOnMarketDataGap) {
        await this.handleIncident(
          generateRequestId(),
          IncidentType.MARKET_DATA_GAP,
          `Market data gap: ${symbol}`,
          new Error(`Data gap of ${gapMs}ms detected for ${symbol}`),
        );
      }
    });

    eventBus.on('system:kill', async ({ reason }) => {
      await this.setSystemState(SystemState.KILLED, reason);
    });
  }
}
