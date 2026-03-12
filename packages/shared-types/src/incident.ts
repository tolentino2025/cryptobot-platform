// ═══════════════════════════════════════════════════════════════
// Incident Types
// Incident detection, recording, and notification
// ═══════════════════════════════════════════════════════════════

import { IncidentSeverity, IncidentType } from './enums.js';

/** Incident record */
export interface Incident {
  id: string;
  requestId: string;
  type: IncidentType;
  severity: IncidentSeverity;
  /** What happened */
  title: string;
  /** Detailed description */
  description: string;
  /** What action was taken automatically */
  actionTaken: string;
  /** Related entity (order ID, symbol, etc.) */
  relatedEntity: string | null;
  /** Additional context data */
  context: Record<string, unknown>;
  /** Is this incident still active? */
  isActive: boolean;
  /** When was it resolved? */
  resolvedAt: Date | null;
  /** Resolution notes */
  resolutionNotes: string | null;
  createdAt: Date;
}

/** Notification payload sent via webhook */
export interface NotificationPayload {
  level: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  timestamp: Date;
  /** Fields for rich webhook formatting */
  fields: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
}
