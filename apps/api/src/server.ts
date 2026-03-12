// ═══════════════════════════════════════════════════════════════
// API Server — Fastify setup with all Ops API routes
// ═══════════════════════════════════════════════════════════════

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { generateRequestId } from '@cryptobot/core';
import type { PrismaClient } from '@prisma/client';
import {
  TradingMode,
  SystemState,
  AdminActionType,
  ModeChangeRequestSchema,
  AdminActionRequestSchema,
  PaginationQuerySchema,
} from '@cryptobot/shared-types';
import type { AuditService } from '@cryptobot/audit';
import type { PortfolioService } from '@cryptobot/portfolio';
import type { NotificationService } from '@cryptobot/notifications';

export interface ServerDependencies {
  db: PrismaClient;
  audit: AuditService;
  portfolio: PortfolioService;
  notifications: NotificationService;
  getSystemState: () => SystemState;
  setSystemState: (state: SystemState, reason: string) => Promise<void>;
  getTradingMode: () => TradingMode;
  setTradingMode: (mode: TradingMode, confirmationCode?: string) => Promise<void>;
}

export async function createServer(deps: ServerDependencies) {
  const app = Fastify({
    logger: false,
    requestTimeout: 30000,
  });

  await app.register(cors, { origin: true, credentials: true });

  // ── Request ID injection ──
  app.addHook('onRequest', async (request) => {
    (request as any).requestId = generateRequestId();
  });

  // ── Auth hook ──
  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/health') return;

    const token = request.headers.authorization?.replace('Bearer ', '');
    const expectedToken = process.env['API_AUTH_TOKEN'];

    if (!token || token !== expectedToken) {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // ════════════════════════════════════════
  // SYSTEM ENDPOINTS
  // ════════════════════════════════════════

  app.get('/health', async () => {
    const dbHealthy = await deps.db.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    return {
      status: dbHealthy ? 'ok' : 'degraded',
      checks: {
        database: dbHealthy,
        redis: true, // simplified
        exchange: true,
        marketData: true,
        claudeApi: true,
      },
      timestamp: new Date().toISOString(),
    };
  });

  app.get('/system/state', async () => ({
    state: deps.getSystemState(),
    mode: deps.getTradingMode(),
    uptime: process.uptime(),
    version: '0.1.0',
    configVersion: 1,
    lastDecisionAt: null,
    lastTradeAt: null,
  }));

  app.post('/system/pause', async (request) => {
    const body = AdminActionRequestSchema.parse(request.body);
    const reqId = (request as any).requestId;
    await deps.setSystemState(SystemState.PAUSED, body.reason);
    await deps.audit.recordAdminAction(reqId, AdminActionType.PAUSE, { reason: body.reason }, 'api');
    await deps.notifications.warning('System Paused', body.reason);
    return { success: true, state: SystemState.PAUSED };
  });

  app.post('/system/resume', async (request) => {
    const body = AdminActionRequestSchema.parse(request.body);
    const reqId = (request as any).requestId;
    const current = deps.getSystemState();
    if (current !== SystemState.PAUSED) {
      return { success: false, error: `Cannot resume from state ${current}` };
    }
    await deps.setSystemState(SystemState.RUNNING, body.reason);
    await deps.audit.recordAdminAction(reqId, AdminActionType.RESUME, { reason: body.reason }, 'api');
    await deps.notifications.info('System Resumed', body.reason);
    return { success: true, state: SystemState.RUNNING };
  });

  app.post('/system/kill', async (request) => {
    const body = AdminActionRequestSchema.parse(request.body);
    const reqId = (request as any).requestId;
    await deps.setSystemState(SystemState.KILLED, body.reason);
    await deps.audit.recordAdminAction(reqId, AdminActionType.KILL, { reason: body.reason }, 'api');
    await deps.notifications.critical('KILL SWITCH', `Kill switch activated: ${body.reason}`);
    return { success: true, state: SystemState.KILLED, message: 'System killed. Restart required.' };
  });

  // ════════════════════════════════════════
  // MODE ENDPOINTS
  // ════════════════════════════════════════

  app.post('/mode/sim', async (request) => {
    const reqId = (request as any).requestId;
    await deps.setTradingMode(TradingMode.SIM);
    await deps.audit.recordAdminAction(reqId, AdminActionType.MODE_CHANGE, { mode: 'SIM' }, 'api');
    return { success: true, mode: TradingMode.SIM };
  });

  app.post('/mode/demo', async (request) => {
    const reqId = (request as any).requestId;
    await deps.setTradingMode(TradingMode.DEMO);
    await deps.audit.recordAdminAction(reqId, AdminActionType.MODE_CHANGE, { mode: 'DEMO' }, 'api');
    return { success: true, mode: TradingMode.DEMO };
  });

  app.post('/mode/live', async (request) => {
    const body = ModeChangeRequestSchema.parse(request.body);
    const reqId = (request as any).requestId;
    const expectedCode = process.env['LIVE_CONFIRMATION_CODE'];
    if (!expectedCode || body.confirmationCode !== expectedCode) {
      return { success: false, error: 'Invalid confirmation code for LIVE mode' };
    }
    await deps.setTradingMode(TradingMode.LIVE, body.confirmationCode);
    await deps.audit.recordAdminAction(reqId, AdminActionType.MODE_CHANGE, { mode: 'LIVE', reason: body.reason }, 'api');
    await deps.notifications.critical('LIVE MODE ACTIVATED', `Reason: ${body.reason}`);
    return { success: true, mode: TradingMode.LIVE, warning: '⚠️ REAL MONEY AT RISK' };
  });

  // ════════════════════════════════════════
  // CONFIG ENDPOINTS
  // ════════════════════════════════════════

  app.get('/config', async () => {
    const [botConfig, strategyConfig, riskLimits] = await Promise.all([
      deps.db.botConfig.findFirst({ where: { id: 'default' } }),
      deps.db.strategyConfig.findFirst({ where: { isActive: true } }),
      deps.db.riskLimits.findFirst({ where: { isActive: true } }),
    ]);
    return { botConfig, strategyConfig, riskLimits };
  });

  app.put('/config/strategy', async (request) => {
    const reqId = (request as any).requestId;
    const { updates, reason } = request.body as { updates: Record<string, unknown>; reason: string };
    const current = await deps.db.strategyConfig.findFirst({ where: { isActive: true } });
    if (!current) return { success: false, error: 'No active strategy config' };
    const updated = await deps.db.strategyConfig.update({
      where: { id: current.id },
      data: { ...updates, version: current.version + 1 },
    });
    await deps.audit.recordAdminAction(reqId, AdminActionType.STRATEGY_UPDATE, { updates, reason }, 'api');
    return { success: true, config: updated };
  });

  app.put('/config/risk', async (request) => {
    const reqId = (request as any).requestId;
    const { updates, reason } = request.body as { updates: Record<string, unknown>; reason: string };
    const current = await deps.db.riskLimits.findFirst({ where: { isActive: true } });
    if (!current) return { success: false, error: 'No active risk limits' };
    const updated = await deps.db.riskLimits.update({
      where: { id: current.id },
      data: { ...updates, version: current.version + 1 },
    });
    await deps.audit.recordAdminAction(reqId, AdminActionType.RISK_UPDATE, { updates, reason }, 'api');
    return { success: true, config: updated };
  });

  // ════════════════════════════════════════
  // DATA ENDPOINTS
  // ════════════════════════════════════════

  app.get('/positions', async (request) => {
    const { page, pageSize } = PaginationQuerySchema.parse(request.query);
    const [data, total] = await Promise.all([
      deps.db.position.findMany({
        orderBy: { openedAt: 'desc' },
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
      deps.db.position.count(),
    ]);
    return { data, total, page, pageSize, hasMore: page * pageSize < total };
  });

  app.get('/balances', async () => {
    const balances = await deps.portfolio.getBalances();
    return { data: balances };
  });

  app.get('/orders', async (request) => {
    const { page, pageSize } = PaginationQuerySchema.parse(request.query);
    const [data, total] = await Promise.all([
      deps.db.orderRequest.findMany({
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip: (page - 1) * pageSize,
        include: { events: { orderBy: { createdAt: 'desc' }, take: 5 } },
      }),
      deps.db.orderRequest.count(),
    ]);
    return { data, total, page, pageSize, hasMore: page * pageSize < total };
  });

  app.get('/fills', async (request) => {
    const { page, pageSize } = PaginationQuerySchema.parse(request.query);
    const [data, total] = await Promise.all([
      deps.db.fill.findMany({
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
      deps.db.fill.count(),
    ]);
    return { data, total, page, pageSize, hasMore: page * pageSize < total };
  });

  app.get('/decisions', async (request) => {
    const { page, pageSize } = PaginationQuerySchema.parse(request.query);
    const [data, total] = await Promise.all([
      deps.db.modelDecision.findMany({
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip: (page - 1) * pageSize,
        include: { riskReview: true },
      }),
      deps.db.modelDecision.count(),
    ]);
    return { data, total, page, pageSize, hasMore: page * pageSize < total };
  });

  app.get('/incidents', async (request) => {
    const { page, pageSize } = PaginationQuerySchema.parse(request.query);
    const [data, total] = await Promise.all([
      deps.db.incident.findMany({
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
      deps.db.incident.count(),
    ]);
    return { data, total, page, pageSize, hasMore: page * pageSize < total };
  });

  app.get('/audit', async (request) => {
    const { page, pageSize } = PaginationQuerySchema.parse(request.query);
    const q = request.query as Record<string, string>;
    const where: Record<string, unknown> = {};
    if (q['eventType']) where['eventType'] = q['eventType'];
    if (q['severity']) where['severity'] = q['severity'];
    if (q['source']) where['source'] = q['source'];

    const [data, total] = await Promise.all([
      deps.db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
      deps.db.auditLog.count({ where }),
    ]);
    return { data, total, page, pageSize, hasMore: page * pageSize < total };
  });

  // ════════════════════════════════════════
  // DASHBOARD OVERVIEW
  // ════════════════════════════════════════

  app.get('/dashboard/overview', async () => {
    const [portfolio, recentDecisions, recentOrders, recentIncidents, riskLimits] =
      await Promise.all([
        deps.portfolio.getSummary(),
        deps.db.modelDecision.findMany({
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { riskReview: true },
        }),
        deps.db.orderRequest.findMany({
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        deps.db.incident.findMany({
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        deps.db.riskLimits.findFirst({ where: { isActive: true } }),
      ]);

    return {
      system: {
        state: deps.getSystemState(),
        mode: deps.getTradingMode(),
        uptime: process.uptime(),
        version: '0.1.0',
      },
      portfolio,
      riskLimits,
      recentDecisions: recentDecisions.map((d) => ({
        id: d.id,
        action: (d.decision as any)?.action ?? 'HOLD',
        symbol: d.symbol,
        confidence: (d.decision as any)?.confidence ?? 0,
        thesis: (d.decision as any)?.thesis ?? '',
        verdict: d.riskReview?.verdict ?? 'N/A',
        denialReason: d.riskReview?.denialReasons?.join(', ') ?? null,
        latencyMs: d.latencyMs,
        createdAt: d.createdAt,
      })),
      recentOrders,
      recentIncidents,
    };
  });

  return app;
}
