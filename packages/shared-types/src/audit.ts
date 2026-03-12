// ═══════════════════════════════════════════════════════════════
// Audit Types
// Audit log entry types for full traceability
// ═══════════════════════════════════════════════════════════════

import { AuditEventType } from './enums.js';

/** Audit log entry — immutable record of any system event */
export interface AuditEntry {
  id: string;
  /** Correlation ID for request tracing */
  requestId: string;
  /** Trade lifecycle ID (groups related events) */
  tradeId: string | null;
  /** Event type */
  eventType: AuditEventType;
  /** Source module */
  source: string;
  /** Event-specific payload */
  payload: Record<string, unknown>;
  /** Human-readable summary */
  summary: string;
  /** Severity level for filtering */
  severity: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
  /** Timestamp */
  createdAt: Date;
}

/** Audit query filters */
export interface AuditQueryFilters {
  eventType?: AuditEventType;
  source?: string;
  tradeId?: string;
  requestId?: string;
  severity?: string;
  startDate?: Date;
  endDate?: Date;
  symbol?: string;
  limit?: number;
  offset?: number;
}
