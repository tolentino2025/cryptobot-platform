// ═══════════════════════════════════════════════════════════════
// API Types
// Request/response DTOs for the Ops API
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';
import { TradingMode, SystemState } from './enums.js';
import type { PortfolioSummary } from './portfolio.js';
import type { RiskLimits } from './risk.js';
import type { Incident } from './incident.js';
import type { OrderSummary } from './order.js';

// ── System endpoints ──

export interface SystemStateResponse {
  state: SystemState;
  mode: TradingMode;
  uptime: number;
  version: string;
  configVersion: number;
  lastDecisionAt: Date | null;
  lastTradeAt: Date | null;
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  checks: {
    database: boolean;
    redis: boolean;
    exchange: boolean;
    marketData: boolean;
    claudeApi: boolean;
  };
  timestamp: Date;
}

export interface ComponentHealth {
  healthy: boolean;
  latencyMs?: number;
  error?: string;
  lastCheckedAt: string;
}

export interface SystemHealthReport {
  status: 'ok' | 'degraded' | 'error';
  systemState: SystemState;
  tradingMode: TradingMode;
  uptime: number;
  version: string;
  checks: {
    database: ComponentHealth;
    redis: ComponentHealth;
    exchange: ComponentHealth;
    marketData: ComponentHealth & { symbols?: Record<string, { fresh: boolean; ageMs: number }> };
    clockDrift: ComponentHealth & { driftMs?: number };
  };
  buildInfo: {
    gitCommit: string;
    buildTimestamp: string;
    environment: string;
    nodeVersion: string;
  };
  timestamp: string;
}

// ── Mode change ──

export const ModeChangeRequestSchema = z.object({
  mode: z.nativeEnum(TradingMode),
  /** Required when switching to LIVE */
  confirmationCode: z.string().optional(),
  reason: z.string().min(1).max(500),
});

export type ModeChangeRequest = z.infer<typeof ModeChangeRequestSchema>;

// ── Admin actions ──

export const AdminActionRequestSchema = z.object({
  reason: z.string().min(1).max(500),
});

export type AdminActionRequest = z.infer<typeof AdminActionRequestSchema>;

// ── Config updates ──

export const StrategyUpdateRequestSchema = z.object({
  updates: z.record(z.unknown()),
  reason: z.string().min(1).max(500),
});

export const RiskUpdateRequestSchema = z.object({
  updates: z.record(z.unknown()),
  reason: z.string().min(1).max(500),
});

// ── Dashboard data ──

export interface DashboardOverview {
  system: SystemStateResponse;
  portfolio: PortfolioSummary;
  riskLimits: RiskLimits;
  recentDecisions: Array<{
    id: string;
    action: string;
    symbol: string;
    regime: string | null;
    confidence: number;
    thesis: string;
    entryVeto: boolean;
    entryVetoReason: string | null;
    shouldExit: boolean;
    exitReason: string | null;
    isFallback: boolean;
    fallbackReason: string | null;
    inputSummary: Record<string, unknown> | null;
    holdReason: string;
    pipelineStageStoppedAt: string | null;
    failedEntryConditions: string[];
    verdict: string;
    denialReason: string | null;
    createdAt: Date;
  }>;
  recentOrders: OrderSummary[];
  recentIncidents: Incident[];
  metrics: {
    avgLatencyMs: number;
    decisionsToday: number;
    tradesThisHour: number;
    consecutiveLosses: number;
    cooldownActive: boolean;
    cooldownUntil: Date | null;
  };
}

// ── Pagination ──

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
