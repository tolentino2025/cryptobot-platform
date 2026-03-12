// ═══════════════════════════════════════════════════════════════
// Core Utilities Tests
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  generateRequestId,
  generateTradeId,
  generateIdempotencyKey,
  basisPoints,
  roundTo,
  clamp,
  isWithinSession,
  CircuitBreaker,
} from '../utils.js';

describe('ID generation', () => {
  it('should generate unique request IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateRequestId()));
    expect(ids.size).toBe(100);
  });

  it('should prefix request IDs with req_', () => {
    expect(generateRequestId()).toMatch(/^req_/);
  });

  it('should prefix trade IDs with trd_', () => {
    expect(generateTradeId()).toMatch(/^trd_/);
  });

  it('should generate deterministic idempotency keys', () => {
    const k1 = generateIdempotencyKey('dec_123', 'ENTRY');
    const k2 = generateIdempotencyKey('dec_123', 'ENTRY');
    expect(k1).toBe(k2);
  });

  it('should generate different keys for different purposes', () => {
    const k1 = generateIdempotencyKey('dec_123', 'ENTRY');
    const k2 = generateIdempotencyKey('dec_123', 'EXIT_TP');
    expect(k1).not.toBe(k2);
  });
});

describe('basisPoints', () => {
  it('should calculate bps correctly', () => {
    expect(basisPoints(100, 101)).toBe(100); // 1% = 100bps
  });

  it('should handle 0 price', () => {
    expect(basisPoints(0, 100)).toBe(0);
  });

  it('should return absolute value', () => {
    expect(basisPoints(100, 99)).toBe(100);
  });
});

describe('roundTo', () => {
  it('should round to specified decimals', () => {
    expect(roundTo(1.23456, 2)).toBe(1.23);
    expect(roundTo(1.23456, 4)).toBe(1.2346);
    expect(roundTo(1.5, 0)).toBe(2);
  });
});

describe('clamp', () => {
  it('should clamp values', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe('isWithinSession', () => {
  it('should return true for wildcard session', () => {
    expect(isWithinSession(['*'])).toBe(true);
  });

  it('should handle empty sessions', () => {
    expect(isWithinSession([])).toBe(false);
  });
});

describe('CircuitBreaker', () => {
  it('should start closed', () => {
    const cb = new CircuitBreaker(3, 1000);
    expect(cb.isOpen).toBe(false);
  });

  it('should open after threshold failures', () => {
    const cb = new CircuitBreaker(3, 1000);
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.isOpen).toBe(false);
    cb.recordFailure();
    expect(cb.isOpen).toBe(true);
  });

  it('should reset on success', () => {
    const cb = new CircuitBreaker(3, 1000);
    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess();
    cb.recordFailure(); // Only 1 failure now
    expect(cb.isOpen).toBe(false);
  });

  it('should half-open after reset time', async () => {
    const cb = new CircuitBreaker(1, 50); // 50ms reset
    cb.recordFailure();
    expect(cb.isOpen).toBe(true);
    await new Promise((r) => setTimeout(r, 60));
    expect(cb.isOpen).toBe(false); // Half-open
  });
});
