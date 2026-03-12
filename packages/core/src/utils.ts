// ═══════════════════════════════════════════════════════════════
// Utilities — Common helper functions
// ═══════════════════════════════════════════════════════════════

import { nanoid } from 'nanoid';

/** Generate a unique request ID */
export function generateRequestId(): string {
  return `req_${nanoid(16)}`;
}

/** Generate a unique trade ID (groups related events) */
export function generateTradeId(): string {
  return `trd_${nanoid(12)}`;
}

/** Generate an idempotency key for orders */
export function generateIdempotencyKey(decisionId: string, purpose: string): string {
  return `idem_${decisionId}_${purpose}`;
}

/** Sleep for N milliseconds */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry with exponential backoff */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    onRetry?: (attempt: number, error: unknown) => void;
  },
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < opts.maxRetries) {
        const delay = Math.min(
          opts.baseDelayMs * Math.pow(2, attempt),
          opts.maxDelayMs,
        );
        opts.onRetry?.(attempt + 1, error);
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

/** Calculate basis points between two prices */
export function basisPoints(price1: number, price2: number): number {
  if (price1 === 0) return 0;
  return Math.abs((price2 - price1) / price1) * 10000;
}

/** Round to N decimal places */
export function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/** Get current date string (YYYY-MM-DD) in UTC */
export function todayUTC(): string {
  return new Date().toISOString().split('T')[0]!;
}

/** Get ISO week string (YYYY-WNN) */
export function currentWeekUTC(): string {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor(
    (now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000),
  );
  const week = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Clamp a value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Check if current time is within allowed sessions */
export function isWithinSession(allowedSessions: string[]): boolean {
  // "*" means 24/7
  if (allowedSessions.includes('*')) return true;

  const now = new Date();
  const currentHour = now.getUTCHours();

  for (const session of allowedSessions) {
    // Format: "HH-HH" (UTC hours, e.g., "08-22")
    const parts = session.split('-');
    if (parts.length === 2) {
      const start = parseInt(parts[0]!, 10);
      const end = parseInt(parts[1]!, 10);
      if (start <= end) {
        if (currentHour >= start && currentHour < end) return true;
      } else {
        // Wraps midnight (e.g., "22-06")
        if (currentHour >= start || currentHour < end) return true;
      }
    }
  }

  return false;
}

/** Circuit breaker simple implementation */
export class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private readonly threshold: number,
    private readonly resetTimeMs: number,
  ) {}

  get isOpen(): boolean {
    if (this.state === 'OPEN') {
      // Check if reset time has passed
      if (Date.now() - this.lastFailure >= this.resetTimeMs) {
        this.state = 'HALF_OPEN';
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
    }
  }

  get currentState() {
    return { state: this.state, failures: this.failures };
  }
}
