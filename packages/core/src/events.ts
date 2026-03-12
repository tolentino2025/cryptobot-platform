// ═══════════════════════════════════════════════════════════════
// Event Bus — Internal typed event system
// Lightweight pub/sub for inter-module communication
// ═══════════════════════════════════════════════════════════════

import { EventEmitter } from 'events';
import { createLogger } from './logger.js';

const logger = createLogger('event-bus');

/** All system events with their payload types */
export interface SystemEvents {
  'market:snapshot': { symbol: string; timestamp: number };
  'market:stale': { symbol: string; stalenessMs: number };
  'market:gap': { symbol: string; gapMs: number };
  'decision:requested': { requestId: string; symbol: string };
  'decision:received': { requestId: string; action: string };
  'decision:fallback': { requestId: string; reason: string };
  'risk:approved': { requestId: string; decisionId: string };
  'risk:adjusted': { requestId: string; decisionId: string };
  'risk:denied': { requestId: string; reasons: string[] };
  'order:created': { orderId: string; symbol: string };
  'order:sent': { orderId: string; exchangeOrderId: string | null };
  'order:filled': { orderId: string; price: number; quantity: number };
  'order:cancelled': { orderId: string; reason: string };
  'order:rejected': { orderId: string; reason: string };
  'order:failed': { orderId: string; error: string };
  'position:opened': { positionId: string; symbol: string; side: string };
  'position:closed': { positionId: string; pnl: number; reason: string };
  'incident:created': { incidentId: string; type: string; severity: string };
  'incident:resolved': { incidentId: string };
  'system:state-change': { from: string; to: string; reason: string };
  'system:pause': { reason: string };
  'system:resume': { reason: string };
  'system:kill': { reason: string };
}

type EventName = keyof SystemEvents;

class TypedEventBus {
  private emitter = new EventEmitter();

  constructor() {
    // Increase max listeners for production use
    this.emitter.setMaxListeners(50);
  }

  emit<E extends EventName>(event: E, payload: SystemEvents[E]): void {
    logger.debug({ event, payload }, 'Event emitted');
    this.emitter.emit(event, payload);
  }

  on<E extends EventName>(
    event: E,
    handler: (payload: SystemEvents[E]) => void,
  ): void {
    this.emitter.on(event, handler);
  }

  once<E extends EventName>(
    event: E,
    handler: (payload: SystemEvents[E]) => void,
  ): void {
    this.emitter.once(event, handler);
  }

  off<E extends EventName>(
    event: E,
    handler: (payload: SystemEvents[E]) => void,
  ): void {
    this.emitter.off(event, handler);
  }

  removeAllListeners(event?: EventName): void {
    if (event) {
      this.emitter.removeAllListeners(event);
    } else {
      this.emitter.removeAllListeners();
    }
  }
}

/** Singleton event bus */
export const eventBus = new TypedEventBus();
