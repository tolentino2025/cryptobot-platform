-- CreateTable
CREATE TABLE "bot_config" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'SIM',
    "exchange" TEXT NOT NULL DEFAULT 'SIMULATED',
    "decisionIntervalSec" INTEGER NOT NULL DEFAULT 15,
    "claudeModel" TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
    "claudeTimeoutMs" INTEGER NOT NULL DEFAULT 5000,
    "claudeMaxRetries" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategy_config" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Micro Pullback',
    "type" TEXT NOT NULL DEFAULT 'MICRO_PULLBACK',
    "emaFastPeriod" INTEGER NOT NULL DEFAULT 9,
    "emaSlowPeriod" INTEGER NOT NULL DEFAULT 21,
    "rsiPeriod" INTEGER NOT NULL DEFAULT 7,
    "rsiOversold" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "rsiOverbought" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "atrPeriod" INTEGER NOT NULL DEFAULT 14,
    "minVolumeRatio" DOUBLE PRECISION NOT NULL DEFAULT 1.2,
    "minBookImbalance" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "minConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "takeProfitBps" INTEGER NOT NULL DEFAULT 30,
    "stopLossBps" INTEGER NOT NULL DEFAULT 20,
    "timeoutSeconds" INTEGER NOT NULL DEFAULT 300,
    "candleInterval" TEXT NOT NULL DEFAULT '1m',
    "lookbackCandles" INTEGER NOT NULL DEFAULT 60,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategy_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_limits" (
    "id" TEXT NOT NULL,
    "maxPositionNotional" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "maxTotalExposureNotional" DOUBLE PRECISION NOT NULL DEFAULT 200,
    "maxOpenPositions" INTEGER NOT NULL DEFAULT 1,
    "maxDailyLoss" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "maxWeeklyLoss" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "maxTradesPerHour" INTEGER NOT NULL DEFAULT 4,
    "maxConsecutiveLosses" INTEGER NOT NULL DEFAULT 3,
    "cooldownAfterLossMinutes" INTEGER NOT NULL DEFAULT 30,
    "maxSpreadBps" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "maxSlippageBps" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "allowedSymbols" TEXT[] DEFAULT ARRAY['BTCUSDT']::TEXT[],
    "allowedSessions" TEXT[] DEFAULT ARRAY['*']::TEXT[],
    "dataFreshnessMaxMs" INTEGER NOT NULL DEFAULT 5000,
    "maxOrderRetries" INTEGER NOT NULL DEFAULT 2,
    "killOnExchangeDesync" BOOLEAN NOT NULL DEFAULT true,
    "killOnMarketDataGap" BOOLEAN NOT NULL DEFAULT true,
    "killOnUnexpectedPosition" BOOLEAN NOT NULL DEFAULT true,
    "killOnRepeatedRejections" BOOLEAN NOT NULL DEFAULT true,
    "noTradeDuringIncident" BOOLEAN NOT NULL DEFAULT true,
    "noTradeWhenBalanceBelowThreshold" BOOLEAN NOT NULL DEFAULT true,
    "minBalanceThreshold" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "minConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "allowPyramiding" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risk_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "symbols" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "baseAsset" TEXT NOT NULL,
    "quoteAsset" TEXT NOT NULL,
    "minNotional" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "stepSize" DOUBLE PRECISION NOT NULL DEFAULT 0.00001,
    "pricePrecision" INTEGER NOT NULL DEFAULT 2,
    "quantityPrecision" INTEGER NOT NULL DEFAULT 5,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "symbols_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_snapshots" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "dataAgeMs" INTEGER NOT NULL,
    "isFresh" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_decisions" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "decision" JSONB NOT NULL,
    "inputSummary" JSONB NOT NULL,
    "rawResponse" TEXT NOT NULL,
    "isValid" BOOLEAN NOT NULL,
    "isFallback" BOOLEAN NOT NULL DEFAULT false,
    "fallbackReason" TEXT,
    "latencyMs" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_reviews" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "denialReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "adjustedParams" JSONB,
    "explanation" TEXT NOT NULL,
    "checksPerformed" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_requests" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "riskReviewId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION,
    "quoteAmount" DOUBLE PRECISION NOT NULL,
    "stopPrice" DOUBLE PRECISION,
    "takeProfitPrice" DOUBLE PRECISION,
    "maxSlippageBps" INTEGER NOT NULL,
    "timeoutSec" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "exchangeOrderId" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_events" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "exchangeData" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fills" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "quoteAmount" DOUBLE PRECISION NOT NULL,
    "commission" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commissionAsset" TEXT NOT NULL DEFAULT 'USDT',
    "exchangeTradeId" TEXT NOT NULL,
    "isMaker" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "entryOrderId" TEXT NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "notional" DOUBLE PRECISION NOT NULL,
    "currentPrice" DOUBLE PRECISION,
    "unrealizedPnl" DOUBLE PRECISION,
    "unrealizedPnlPercent" DOUBLE PRECISION,
    "exitOrderId" TEXT,
    "exitPrice" DOUBLE PRECISION,
    "exitReason" TEXT,
    "realizedPnl" DOUBLE PRECISION,
    "realizedPnlPercent" DOUBLE PRECISION,
    "totalCommission" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "holdingTimeSec" INTEGER,
    "decisionId" TEXT NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "balances" (
    "id" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "free" DOUBLE PRECISION NOT NULL,
    "locked" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "estimatedValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pnl_snapshots" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "realizedPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unrealizedPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tradeCount" INTEGER NOT NULL DEFAULT 0,
    "winCount" INTEGER NOT NULL DEFAULT 0,
    "lossCount" INTEGER NOT NULL DEFAULT 0,
    "totalCommission" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bestTradePnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "worstTradePnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pnl_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "actionTaken" TEXT NOT NULL,
    "relatedEntity" TEXT,
    "context" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_actions" (
    "id" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "reason" TEXT NOT NULL,
    "performedBy" TEXT NOT NULL DEFAULT 'system',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "tradeId" TEXT,
    "eventType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "summary" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_state" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'INITIALIZING',
    "previousState" TEXT,
    "reason" TEXT,
    "triggeredBy" TEXT NOT NULL DEFAULT 'system',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "symbols_symbol_key" ON "symbols"("symbol");

-- CreateIndex
CREATE INDEX "market_snapshots_symbol_createdAt_idx" ON "market_snapshots"("symbol", "createdAt");

-- CreateIndex
CREATE INDEX "model_decisions_symbol_createdAt_idx" ON "model_decisions"("symbol", "createdAt");

-- CreateIndex
CREATE INDEX "model_decisions_requestId_idx" ON "model_decisions"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "risk_reviews_decisionId_key" ON "risk_reviews"("decisionId");

-- CreateIndex
CREATE INDEX "risk_reviews_requestId_idx" ON "risk_reviews"("requestId");

-- CreateIndex
CREATE INDEX "risk_reviews_verdict_createdAt_idx" ON "risk_reviews"("verdict", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "order_requests_idempotencyKey_key" ON "order_requests"("idempotencyKey");

-- CreateIndex
CREATE INDEX "order_requests_symbol_createdAt_idx" ON "order_requests"("symbol", "createdAt");

-- CreateIndex
CREATE INDEX "order_requests_status_idx" ON "order_requests"("status");

-- CreateIndex
CREATE INDEX "order_requests_requestId_idx" ON "order_requests"("requestId");

-- CreateIndex
CREATE INDEX "order_requests_exchangeOrderId_idx" ON "order_requests"("exchangeOrderId");

-- CreateIndex
CREATE INDEX "order_events_orderId_createdAt_idx" ON "order_events"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "fills_orderId_idx" ON "fills"("orderId");

-- CreateIndex
CREATE INDEX "fills_symbol_createdAt_idx" ON "fills"("symbol", "createdAt");

-- CreateIndex
CREATE INDEX "positions_symbol_status_idx" ON "positions"("symbol", "status");

-- CreateIndex
CREATE INDEX "positions_status_idx" ON "positions"("status");

-- CreateIndex
CREATE INDEX "positions_openedAt_idx" ON "positions"("openedAt");

-- CreateIndex
CREATE INDEX "balances_asset_createdAt_idx" ON "balances"("asset", "createdAt");

-- CreateIndex
CREATE INDEX "pnl_snapshots_period_createdAt_idx" ON "pnl_snapshots"("period", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "pnl_snapshots_period_periodKey_key" ON "pnl_snapshots"("period", "periodKey");

-- CreateIndex
CREATE INDEX "incidents_type_createdAt_idx" ON "incidents"("type", "createdAt");

-- CreateIndex
CREATE INDEX "incidents_severity_isActive_idx" ON "incidents"("severity", "isActive");

-- CreateIndex
CREATE INDEX "admin_actions_actionType_createdAt_idx" ON "admin_actions"("actionType", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_eventType_createdAt_idx" ON "audit_log"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_requestId_idx" ON "audit_log"("requestId");

-- CreateIndex
CREATE INDEX "audit_log_tradeId_idx" ON "audit_log"("tradeId");

-- CreateIndex
CREATE INDEX "audit_log_severity_createdAt_idx" ON "audit_log"("severity", "createdAt");

-- CreateIndex
CREATE INDEX "system_state_state_createdAt_idx" ON "system_state"("state", "createdAt");

-- AddForeignKey
ALTER TABLE "risk_reviews" ADD CONSTRAINT "risk_reviews_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "model_decisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_requests" ADD CONSTRAINT "order_requests_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "model_decisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fills" ADD CONSTRAINT "fills_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
