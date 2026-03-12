-- ═══════════════════════════════════════════════════════════
-- Migration: add_trade_lifecycle
-- Purpose: Complete end-to-end trade audit trail
-- ═══════════════════════════════════════════════════════════

-- CreateTable
CREATE TABLE "trade_lifecycle" (
    "id"                   TEXT NOT NULL,
    "tradeId"              TEXT NOT NULL,
    "decisionId"           TEXT NOT NULL,
    "symbol"               TEXT NOT NULL,
    "entryOrderIds"        TEXT[] DEFAULT ARRAY[]::TEXT[],
    "exitOrderIds"         TEXT[] DEFAULT ARRAY[]::TEXT[],
    "entryQtyRequested"    DOUBLE PRECISION NOT NULL,
    "entryQtyFilled"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exitQtyRequested"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exitQtyFilled"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgEntryPrice"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgExitPrice"         DOUBLE PRECISION,
    "feesTotal"            DOUBLE PRECISION NOT NULL DEFAULT 0,
    "slippageBps"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    "realizedPnl"          DOUBLE PRECISION,
    "unrealizedPnl"        DOUBLE PRECISION,
    "positionId"           TEXT,
    "positionAfterTrade"   JSONB,
    "closedReason"         TEXT,
    "reconciliationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "lastReconciledAt"     TIMESTAMP(3),
    "reconciliationNotes"  TEXT,
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trade_lifecycle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trade_lifecycle_tradeId_key"             ON "trade_lifecycle"("tradeId");
CREATE INDEX        "trade_lifecycle_symbol_createdAt_idx"    ON "trade_lifecycle"("symbol", "createdAt");
CREATE INDEX        "trade_lifecycle_positionId_idx"          ON "trade_lifecycle"("positionId");
CREATE INDEX        "trade_lifecycle_decisionId_idx"          ON "trade_lifecycle"("decisionId");
CREATE INDEX        "trade_lifecycle_reconciliationStatus_idx" ON "trade_lifecycle"("reconciliationStatus");
