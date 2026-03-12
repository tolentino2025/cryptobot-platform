// ═══════════════════════════════════════════════════════════════
// Schema Validation — Validates Claude's assessment response
// Any invalid response becomes a default no-action fallback
// ═══════════════════════════════════════════════════════════════

import {
  AIAssessmentSchema,
  DEFAULT_HOLD_ASSESSMENT,
  type AIAssessment,
} from '@cryptobot/shared-types';
import { createLogger } from '@cryptobot/core';

const logger = createLogger('decision-schema');

export interface AssessmentValidationResult {
  valid: boolean;
  assessment: AIAssessment;
  errors: string[];
}

/**
 * Parse and validate Claude's raw response into an AIAssessment.
 * Returns DEFAULT_HOLD_ASSESSMENT if validation fails.
 */
export function validateAIAssessment(
  rawText: string,
): AssessmentValidationResult {
  // Step 1: Parse JSON
  let parsed: unknown;
  try {
    const cleaned = rawText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    logger.warn({ rawText: rawText.slice(0, 200) }, 'Failed to parse AI assessment as JSON');
    return {
      valid: false,
      assessment: { ...DEFAULT_HOLD_ASSESSMENT, thesis: 'Invalid JSON response from model' },
      errors: ['JSON parse error'],
    };
  }

  // Step 2: Validate against Zod schema
  const result = AIAssessmentSchema.safeParse(parsed);
  if (!result.success) {
    const zodErrors = result.error.issues.map(
      (i) => `${i.path.join('.')}: ${i.message}`,
    );
    logger.warn({ zodErrors }, 'AI assessment failed schema validation');
    return {
      valid: false,
      assessment: { ...DEFAULT_HOLD_ASSESSMENT, thesis: 'Schema validation failed' },
      errors: zodErrors,
    };
  }

  const assessment = result.data;

  // Step 3: Business logic cross-checks
  const errors: string[] = [];

  // exit_reason must be null when should_exit is false
  if (!assessment.should_exit && assessment.exit_reason !== null) {
    errors.push('exit_reason must be null when should_exit is false');
  }
  // exit_reason must be set when should_exit is true
  if (assessment.should_exit && assessment.exit_reason === null) {
    errors.push('exit_reason is required when should_exit is true');
  }
  // entry_veto_reason must be non-empty when entry_veto is true
  if (assessment.entry_veto && !assessment.entry_veto_reason.trim()) {
    errors.push('entry_veto_reason is required when entry_veto is true');
  }

  if (errors.length > 0) {
    logger.warn({ errors, assessment }, 'Business validation failed, using fallback assessment');
    return {
      valid: false,
      assessment: { ...DEFAULT_HOLD_ASSESSMENT, thesis: `Validation failed: ${errors.join('; ')}` },
      errors,
    };
  }

  return { valid: true, assessment, errors: [] };
}

// ── Legacy export — kept for any callers that still import it ──
export type ValidationResult = AssessmentValidationResult;
export const validateModelResponse = validateAIAssessment as unknown as (
  rawText: string,
  _allowedSymbols: string[],
) => AssessmentValidationResult;
