// ═══════════════════════════════════════════════════════════════
// Schema Validation Tests — AI Assessment output validation
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { validateAIAssessment } from '../schema.js';
import { AIMarketRegime } from '@cryptobot/shared-types';

describe('validateAIAssessment', () => {

  // ── Valid responses ──────────────────────────────────────────

  it('should accept valid BULL_TREND, no-veto, no-exit assessment', () => {
    const raw = JSON.stringify({
      regime: 'BULL_TREND',
      entry_veto: false,
      entry_veto_reason: '',
      should_exit: false,
      exit_reason: null,
      exit_thesis: '',
      confidence: 0.75,
      thesis: 'BULL_TREND confirmed. EMA diff +0.12%. RSI 48.',
    });
    const result = validateAIAssessment(raw);
    expect(result.valid).toBe(true);
    expect(result.assessment.regime).toBe(AIMarketRegime.BULL_TREND);
    expect(result.assessment.entry_veto).toBe(false);
    expect(result.assessment.should_exit).toBe(false);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept valid BEAR_TREND, vetoed, exit signal', () => {
    const raw = JSON.stringify({
      regime: 'BEAR_TREND',
      entry_veto: true,
      entry_veto_reason: 'Regime is BEAR_TREND — no entries allowed',
      should_exit: true,
      exit_reason: 'REGIME_EXIT',
      exit_thesis: 'EMA cross bearish while LONG. Closing position.',
      confidence: 0.88,
      thesis: 'BEAR_TREND detected. EMA diff -0.15%. RSI 62.',
    });
    const result = validateAIAssessment(raw);
    expect(result.valid).toBe(true);
    expect(result.assessment.regime).toBe(AIMarketRegime.BEAR_TREND);
    expect(result.assessment.entry_veto).toBe(true);
    expect(result.assessment.should_exit).toBe(true);
    expect(result.assessment.exit_reason).toBe('REGIME_EXIT');
  });

  it('should accept VOLATILE regime with veto', () => {
    const raw = JSON.stringify({
      regime: 'VOLATILE',
      entry_veto: true,
      entry_veto_reason: 'Excessive volatility detected',
      should_exit: true,
      exit_reason: 'VOLATILITY_EXIT',
      exit_thesis: 'Price swing exceeds threshold while LONG.',
      confidence: 0.9,
      thesis: 'VOLATILE regime. price_change_5m +0.45%. RSI 70.',
    });
    const result = validateAIAssessment(raw);
    expect(result.valid).toBe(true);
    expect(result.assessment.exit_reason).toBe('VOLATILITY_EXIT');
  });

  it('should accept TIME_EXIT reason', () => {
    const raw = JSON.stringify({
      regime: 'RANGE',
      entry_veto: true,
      entry_veto_reason: 'RANGE regime — no clear trend',
      should_exit: true,
      exit_reason: 'TIME_EXIT',
      exit_thesis: 'Holding time exceeds 80% of timeout.',
      confidence: 0.65,
      thesis: 'RANGE. EMA diff 0.0%. RSI 52.',
    });
    const result = validateAIAssessment(raw);
    expect(result.valid).toBe(true);
    expect(result.assessment.exit_reason).toBe('TIME_EXIT');
  });

  it('should accept markdown-wrapped JSON', () => {
    const raw = '```json\n' + JSON.stringify({
      regime: 'RANGE',
      entry_veto: false,
      entry_veto_reason: '',
      should_exit: false,
      exit_reason: null,
      exit_thesis: '',
      confidence: 0.5,
      thesis: 'RANGE market. RSI 50. EMA diff 0.02%.',
    }) + '\n```';
    const result = validateAIAssessment(raw);
    expect(result.valid).toBe(true);
  });

  // ── Invalid JSON ─────────────────────────────────────────────

  it('should reject non-JSON response', () => {
    const result = validateAIAssessment('Not valid JSON');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('JSON parse error');
    expect(result.assessment.regime).toBe(AIMarketRegime.RANGE); // fallback
  });

  // ── Schema violations ─────────────────────────────────────────

  it('should reject invalid regime value', () => {
    const raw = JSON.stringify({
      regime: 'SIDEWAYS',  // not a valid AIMarketRegime
      entry_veto: false,
      entry_veto_reason: '',
      should_exit: false,
      exit_reason: null,
      exit_thesis: '',
      confidence: 0.5,
      thesis: 'Test.',
    });
    const result = validateAIAssessment(raw);
    expect(result.valid).toBe(false);
  });

  it('should reject missing required fields', () => {
    const raw = JSON.stringify({ regime: 'BULL_TREND' });
    const result = validateAIAssessment(raw);
    expect(result.valid).toBe(false);
  });

  it('should reject confidence > 1', () => {
    const raw = JSON.stringify({
      regime: 'BULL_TREND',
      entry_veto: false,
      entry_veto_reason: '',
      should_exit: false,
      exit_reason: null,
      exit_thesis: '',
      confidence: 1.5,
      thesis: 'BULL_TREND. EMA diff +0.1%. RSI 45.',
    });
    const result = validateAIAssessment(raw);
    expect(result.valid).toBe(false);
  });

  it('should reject negative confidence', () => {
    const raw = JSON.stringify({
      regime: 'RANGE',
      entry_veto: false,
      entry_veto_reason: '',
      should_exit: false,
      exit_reason: null,
      exit_thesis: '',
      confidence: -0.1,
      thesis: 'RANGE. RSI 50.',
    });
    const result = validateAIAssessment(raw);
    expect(result.valid).toBe(false);
  });

  // ── Business logic ────────────────────────────────────────────

  it('should reject exit_reason set when should_exit is false', () => {
    const raw = JSON.stringify({
      regime: 'BULL_TREND',
      entry_veto: false,
      entry_veto_reason: '',
      should_exit: false,
      exit_reason: 'STOP_LOSS',   // invalid — should_exit is false
      exit_thesis: '',
      confidence: 0.7,
      thesis: 'BULL_TREND. RSI 45.',
    });
    const result = validateAIAssessment(raw);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('exit_reason must be null'))).toBe(true);
  });

  it('should reject should_exit=true without exit_reason', () => {
    const raw = JSON.stringify({
      regime: 'BEAR_TREND',
      entry_veto: true,
      entry_veto_reason: 'Bear trend',
      should_exit: true,
      exit_reason: null,   // invalid — should_exit is true
      exit_thesis: 'Trend reversed',
      confidence: 0.8,
      thesis: 'BEAR_TREND. RSI 65.',
    });
    const result = validateAIAssessment(raw);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('exit_reason is required'))).toBe(true);
  });

  it('should reject entry_veto=true without entry_veto_reason', () => {
    const raw = JSON.stringify({
      regime: 'VOLATILE',
      entry_veto: true,
      entry_veto_reason: '',    // invalid — veto without reason
      should_exit: false,
      exit_reason: null,
      exit_thesis: '',
      confidence: 0.6,
      thesis: 'VOLATILE. RSI 72.',
    });
    const result = validateAIAssessment(raw);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('entry_veto_reason is required'))).toBe(true);
  });
});
