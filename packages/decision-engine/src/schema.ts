// ═══════════════════════════════════════════════════════════════
// Schema Validation — Validates Claude's response
// Any invalid response becomes a HOLD fallback
// ═══════════════════════════════════════════════════════════════

import {
  ModelDecisionSchema,
  DEFAULT_HOLD_DECISION,
  type ModelDecision,
  TradeAction,
} from '@cryptobot/shared-types';
import { createLogger } from '@cryptobot/core';

const logger = createLogger('decision-schema');

export interface ValidationResult {
  valid: boolean;
  decision: ModelDecision;
  errors: string[];
}

/**
 * Parse and validate Claude's raw response into a ModelDecision.
 * Returns DEFAULT_HOLD_DECISION if validation fails.
 */
export function validateModelResponse(
  rawText: string,
  allowedSymbols: string[],
): ValidationResult {
  const errors: string[] = [];

  // Step 1: Parse JSON
  let parsed: unknown;
  try {
    // Strip potential markdown code fences
    const cleaned = rawText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    logger.warn({ rawText: rawText.slice(0, 200) }, 'Failed to parse model response as JSON');
    return {
      valid: false,
      decision: { ...DEFAULT_HOLD_DECISION, thesis: 'Invalid JSON response from model' },
      errors: ['JSON parse error'],
    };
  }

  // Step 2: Validate against Zod schema
  const result = ModelDecisionSchema.safeParse(parsed);
  if (!result.success) {
    const zodErrors = result.error.issues.map(
      (i) => `${i.path.join('.')}: ${i.message}`,
    );
    logger.warn({ zodErrors }, 'Model response failed schema validation');
    return {
      valid: false,
      decision: { ...DEFAULT_HOLD_DECISION, thesis: 'Schema validation failed' },
      errors: zodErrors,
    };
  }

  const decision = result.data;

  // Step 3: Business logic validation
  if (decision.action !== TradeAction.HOLD) {
    // Symbol must be in whitelist
    if (!allowedSymbols.includes(decision.symbol)) {
      errors.push(`Symbol ${decision.symbol} not in allowed list`);
    }

    // For BUY/SELL: prices must be logically consistent
    if (decision.action === TradeAction.BUY) {
      if (decision.stop_price > 0 && decision.stop_price >= decision.entry_price) {
        errors.push('Stop price must be below entry price for BUY');
      }
      if (decision.take_profit_price > 0 && decision.take_profit_price <= decision.entry_price) {
        errors.push('Take profit must be above entry price for BUY');
      }
    }

    if (decision.action === TradeAction.SELL) {
      if (decision.stop_price > 0 && decision.stop_price <= decision.entry_price) {
        errors.push('Stop price must be above entry price for SELL');
      }
      if (decision.take_profit_price > 0 && decision.take_profit_price >= decision.entry_price) {
        errors.push('Take profit must be below entry price for SELL');
      }
    }

    // Confidence sanity check
    if (decision.confidence < 0.1 && decision.action !== TradeAction.EXIT) {
      errors.push('Very low confidence for non-EXIT action');
    }
  }

  if (errors.length > 0) {
    logger.warn({ errors, action: decision.action }, 'Business validation failed, falling back to HOLD');
    return {
      valid: false,
      decision: { ...DEFAULT_HOLD_DECISION, thesis: `Validation failed: ${errors.join('; ')}` },
      errors,
    };
  }

  return { valid: true, decision, errors: [] };
}
