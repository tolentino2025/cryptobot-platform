// ═══════════════════════════════════════════════════════════════
// AuditService — Persists ALL system events for traceability
// Every decision, order, fill, incident, and admin action is recorded
// ═══════════════════════════════════════════════════════════════

import { createLogger } from '@cryptobot/core';
import type { PrismaClient, Prisma } from '@prisma/client';
import {
  AuditEventType,
  type AuditEntry,
  type AuditQueryFilters,
} from '@cryptobot/shared-types';

const logger = createLogger('audit');

export class AuditService {
  constructor(private readonly db: PrismaClient) {}

  /** Record an audit event — NEVER throws, logging failures are non-fatal */
  async record(entry: Omit<AuditEntry, 'id' | 'createdAt'>): Promise<void> {
    try {
      await this.db.auditLog.create({
        data: {
          requestId: entry.requestId,
          tradeId: entry.tradeId,
          eventType: entry.eventType,
          source: entry.source,
          payload: entry.payload as unknown as Prisma.InputJsonValue,
          summary: entry.summary,
          severity: entry.severity,
        },
      });

      logger.debug(
        { eventType: entry.eventType, source: entry.source, requestId: entry.requestId },
        entry.summary,
      );
    } catch (error) {
      // Audit failures must NEVER crash the system
      logger.error(
        { error, eventType: entry.eventType, requestId: entry.requestId },
        'Failed to persist audit entry',
      );
    }
  }

  /** Convenience: record a model decision */
  async recordDecision(
    requestId: string,
    tradeId: string | null,
    eventType: AuditEventType,
    payload: Record<string, unknown>,
    summary: string,
  ): Promise<void> {
    await this.record({
      requestId,
      tradeId,
      eventType,
      source: 'decision-engine',
      payload,
      summary,
      severity: 'INFO',
    });
  }

  /** Convenience: record a risk event */
  async recordRisk(
    requestId: string,
    tradeId: string | null,
    eventType: AuditEventType,
    payload: Record<string, unknown>,
    summary: string,
  ): Promise<void> {
    await this.record({
      requestId,
      tradeId,
      eventType,
      source: 'risk-engine',
      payload,
      summary,
      severity: eventType === AuditEventType.RISK_DENIED ? 'WARN' : 'INFO',
    });
  }

  /** Convenience: record an order event */
  async recordOrder(
    requestId: string,
    tradeId: string | null,
    eventType: AuditEventType,
    payload: Record<string, unknown>,
    summary: string,
  ): Promise<void> {
    const severity =
      eventType === AuditEventType.ORDER_FAILED || eventType === AuditEventType.ORDER_REJECTED
        ? 'ERROR'
        : 'INFO';
    await this.record({
      requestId,
      tradeId,
      eventType,
      source: 'execution',
      payload,
      summary,
      severity,
    });
  }

  /** Convenience: record a system state change */
  async recordStateChange(
    requestId: string,
    from: string,
    to: string,
    reason: string,
  ): Promise<void> {
    await this.record({
      requestId,
      tradeId: null,
      eventType: AuditEventType.STATE_CHANGE,
      source: 'system',
      payload: { from, to, reason },
      summary: `State: ${from} → ${to} (${reason})`,
      severity: to === 'KILLED' ? 'CRITICAL' : 'WARN',
    });
  }

  /** Convenience: record an admin action */
  async recordAdminAction(
    requestId: string,
    action: string,
    payload: Record<string, unknown>,
    performedBy: string,
  ): Promise<void> {
    await this.record({
      requestId,
      tradeId: null,
      eventType: AuditEventType.ADMIN_ACTION,
      source: 'admin',
      payload: { ...payload, performedBy },
      summary: `Admin: ${action} by ${performedBy}`,
      severity: 'WARN',
    });
  }

  /** Query audit log with filters and pagination */
  async query(filters: AuditQueryFilters): Promise<{ entries: AuditEntry[]; total: number }> {
    const where: Record<string, unknown> = {};

    if (filters.eventType) where['eventType'] = filters.eventType;
    if (filters.source) where['source'] = filters.source;
    if (filters.tradeId) where['tradeId'] = filters.tradeId;
    if (filters.requestId) where['requestId'] = filters.requestId;
    if (filters.severity) where['severity'] = filters.severity;
    if (filters.startDate || filters.endDate) {
      where['createdAt'] = {
        ...(filters.startDate ? { gte: filters.startDate } : {}),
        ...(filters.endDate ? { lte: filters.endDate } : {}),
      };
    }

    const [entries, total] = await Promise.all([
      this.db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters.limit ?? 50,
        skip: filters.offset ?? 0,
      }),
      this.db.auditLog.count({ where }),
    ]);

    return {
      entries: entries.map((e) => ({
        id: e.id,
        requestId: e.requestId,
        tradeId: e.tradeId,
        eventType: e.eventType as AuditEventType,
        source: e.source,
        payload: e.payload as Record<string, unknown>,
        summary: e.summary,
        severity: e.severity as AuditEntry['severity'],
        createdAt: e.createdAt,
      })),
      total,
    };
  }
}
