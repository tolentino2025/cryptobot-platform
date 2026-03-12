// ═══════════════════════════════════════════════════════════════
// Schema Validation Tests — Claude output validation
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { validateModelResponse } from '../schema.js';
import { TradeAction } from '@cryptobot/shared-types';

const ALLOWED = ['BTCUSDT'];

describe('validateModelResponse', () => {
  // ── Valid responses ──

  it('should accept valid BUY response', () => {
    const raw = JSON.stringify({
      action: 'BUY', symbol: 'BTCUSDT', confidence: 0.75, entry_type: 'LIMIT',
      entry_price: 50000, size_quote: 50, stop_price: 49800, take_profit_price: 50150,
      max_slippage_bps: 5, time_horizon_sec: 300,
      thesis: 'Pullback entry', invalidate_if: ['Price below 49700'],
    });
    const result = validateModelResponse(raw, ALLOWED);
    expect(result.valid).toBe(true);
    expect(result.decision.action).toBe(TradeAction.BUY);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept valid HOLD response', () => {
    const raw = JSON.stringify({
      action: 'HOLD', symbol: '', confidence: 0, entry_type: 'LIMIT',
      entry_price: 0, size_quote: 0, stop_price: 0, take_profit_price: 0,
      max_slippage_bps: 0, time_horizon_sec: 0,
      thesis: 'No edge', invalidate_if: [],
    });
    const result = validateModelResponse(raw, ALLOWED);
    expect(result.valid).toBe(true);
    expect(result.decision.action).toBe(TradeAction.HOLD);
  });

  // ── Invalid JSON ──

  it('should reject non-JSON response', () => {
    const result = validateModelResponse('This is not JSON at all', ALLOWED);
    expect(result.valid).toBe(false);
    expect(result.decision.action).toBe(TradeAction.HOLD);
    expect(result.errors).toContain('JSON parse error');
  });

  it('should handle markdown-wrapped JSON', () => {
    const raw = '```json\n{"action":"HOLD","symbol":"","confidence":0,"entry_type":"LIMIT","entry_price":0,"size_quote":0,"stop_price":0,"take_profit_price":0,"max_slippage_bps":0,"time_horizon_sec":0,"thesis":"No edge","invalidate_if":[]}\n```';
    const result = validateModelResponse(raw, ALLOWED);
    expect(result.valid).toBe(true);
  });

  // ── Schema violations ──

  it('should reject missing required fields', () => {
    const raw = JSON.stringify({ action: 'BUY' });
    const result = validateModelResponse(raw, ALLOWED);
    expect(result.valid).toBe(false);
  });

  it('should reject invalid action value', () => {
    const raw = JSON.stringify({
      action: 'PUMP', symbol: 'BTCUSDT', confidence: 0.5, entry_type: 'LIMIT',
      entry_price: 50000, size_quote: 50, stop_price: 49800, take_profit_price: 50200,
      max_slippage_bps: 5, time_horizon_sec: 300, thesis: 'Test', invalidate_if: [],
    });
    const result = validateModelResponse(raw, ALLOWED);
    expect(result.valid).toBe(false);
  });

  it('should reject confidence > 1', () => {
    const raw = JSON.stringify({
      action: 'BUY', symbol: 'BTCUSDT', confidence: 1.5, entry_type: 'LIMIT',
      entry_price: 50000, size_quote: 50, stop_price: 49800, take_profit_price: 50200,
      max_slippage_bps: 5, time_horizon_sec: 300, thesis: 'Test', invalidate_if: [],
    });
    const result = validateModelResponse(raw, ALLOWED);
    expect(result.valid).toBe(false);
  });

  it('should reject negative confidence', () => {
    const raw = JSON.stringify({
      action: 'BUY', symbol: 'BTCUSDT', confidence: -0.5, entry_type: 'LIMIT',
      entry_price: 50000, size_quote: 50, stop_price: 49800, take_profit_price: 50200,
      max_slippage_bps: 5, time_horizon_sec: 300, thesis: 'Test', invalidate_if: [],
    });
    const result = validateModelResponse(raw, ALLOWED);
    expect(result.valid).toBe(false);
  });

  // ── Business logic ──

  it('should reject disallowed symbol', () => {
    const raw = JSON.stringify({
      action: 'BUY', symbol: 'DOGEUSDT', confidence: 0.7, entry_type: 'LIMIT',
      entry_price: 0.1, size_quote: 50, stop_price: 0.09, take_profit_price: 0.11,
      max_slippage_bps: 5, time_horizon_sec: 300, thesis: 'Test', invalidate_if: [],
    });
    const result = validateModelResponse(raw, ALLOWED);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('not in allowed list'))).toBe(true);
  });

  it('should reject BUY with stop above entry', () => {
    const raw = JSON.stringify({
      action: 'BUY', symbol: 'BTCUSDT', confidence: 0.7, entry_type: 'LIMIT',
      entry_price: 50000, size_quote: 50, stop_price: 50100, take_profit_price: 50200,
      max_slippage_bps: 5, time_horizon_sec: 300, thesis: 'Test', invalidate_if: [],
    });
    const result = validateModelResponse(raw, ALLOWED);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Stop price must be below'))).toBe(true);
  });

  it('should reject BUY with TP below entry', () => {
    const raw = JSON.stringify({
      action: 'BUY', symbol: 'BTCUSDT', confidence: 0.7, entry_type: 'LIMIT',
      entry_price: 50000, size_quote: 50, stop_price: 49800, take_profit_price: 49900,
      max_slippage_bps: 5, time_horizon_sec: 300, thesis: 'Test', invalidate_if: [],
    });
    const result = validateModelResponse(raw, ALLOWED);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Take profit must be above'))).toBe(true);
  });

  it('should reject very low confidence on BUY', () => {
    const raw = JSON.stringify({
      action: 'BUY', symbol: 'BTCUSDT', confidence: 0.05, entry_type: 'LIMIT',
      entry_price: 50000, size_quote: 50, stop_price: 49800, take_profit_price: 50200,
      max_slippage_bps: 5, time_horizon_sec: 300, thesis: 'Test', invalidate_if: [],
    });
    const result = validateModelResponse(raw, ALLOWED);
    expect(result.valid).toBe(false);
  });
});
