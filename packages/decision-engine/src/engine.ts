// ═══════════════════════════════════════════════════════════════
// ClaudeDecisionEngine — Consults Claude for market assessment
//
// NEW ARCHITECTURE (v2):
//   Claude NEVER opens trades. It produces an AIAssessment:
//     - regime classification
//     - optional entry veto
//     - optional exit signal with specific reason
//
//   Entry decisions are made by DeterministicEntryEngine.
//   This engine only calls Claude for analysis.
// ═══════════════════════════════════════════════════════════════

import {
  createLogger,
  generateRequestId,
  CircuitBreaker,
  retryWithBackoff,
} from '@cryptobot/core';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  DEFAULT_HOLD_ASSESSMENT,
  type AIAssessment,
  type AIAssessmentRecord,
  type DecisionContext,
} from '@cryptobot/shared-types';
import { SYSTEM_PROMPT, buildUserMessage } from './prompt.js';
import { validateAIAssessment } from './schema.js';

const logger = createLogger('decision-engine');

function toInputJson(value: AIAssessment | Record<string, unknown>): Prisma.InputJsonObject {
  return value as unknown as Prisma.InputJsonObject;
}

export interface DecisionEngineConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
  allowedSymbols: string[];
}

/**
 * Strict interface for the decision engine.
 * Intentionally does NOT include decide() — that method no longer exists.
 * TypeScript build will fail if decide() is called anywhere.
 */
export interface IDecisionEngine {
  assessMarket(context: DecisionContext): Promise<AIAssessmentRecord>;
}

export class ClaudeDecisionEngine implements IDecisionEngine {
  private config: DecisionEngineConfig;
  private circuitBreaker: CircuitBreaker;

  constructor(
    config: DecisionEngineConfig,
    private readonly db: PrismaClient,
  ) {
    this.config = config;
    this.circuitBreaker = new CircuitBreaker(5, 60000);
  }

  /**
   * Assess current market conditions.
   * Returns an AIAssessmentRecord containing regime classification,
   * optional entry veto, and optional exit signal.
   *
   * NEVER executes orders. NEVER returns a BUY action.
   */
  async assessMarket(context: DecisionContext): Promise<AIAssessmentRecord> {
    const requestId = generateRequestId();
    const startTime = Date.now();

    // Circuit breaker check
    if (this.circuitBreaker.isOpen) {
      logger.warn({ requestId }, 'Circuit breaker OPEN — returning hold assessment');
      return this.persistAndReturn(
        requestId, context,
        { ...DEFAULT_HOLD_ASSESSMENT, thesis: 'Circuit breaker open — no assessment available' },
        '', true, 'Circuit breaker open', 0, 0, 0,
      );
    }

    // No API key — SIM mode stub
    if (!this.config.apiKey) {
      logger.debug({ requestId }, 'No API key — returning hold assessment (SIM stub)');
      return this.persistAndReturn(
        requestId, context,
        { ...DEFAULT_HOLD_ASSESSMENT, thesis: 'No API key configured' },
        '', true, 'No API key configured', 0, 0, 0,
      );
    }

    try {
      const userMessage = buildUserMessage(context);

      const response = await retryWithBackoff(
        () => this.callClaude(userMessage),
        {
          maxRetries: this.config.maxRetries,
          baseDelayMs: 1000,
          maxDelayMs: 3000,
          onRetry: (attempt, error) => {
            logger.warn({ requestId, attempt, error: String(error) }, 'Claude API retry');
          },
        },
      );

      const latencyMs = Date.now() - startTime;
      const validation = validateAIAssessment(response.text);

      this.circuitBreaker.recordSuccess();

      logger.info(
        {
          requestId,
          regime: validation.assessment.regime,
          entry_veto: validation.assessment.entry_veto,
          should_exit: validation.assessment.should_exit,
          exit_reason: validation.assessment.exit_reason,
          confidence: validation.assessment.confidence,
          valid: validation.valid,
          latencyMs,
        },
        `Assessment: ${validation.assessment.regime}${validation.assessment.entry_veto ? ' [VETO]' : ''}${validation.assessment.should_exit ? ` [EXIT:${validation.assessment.exit_reason}]` : ''}`,
      );

      return this.persistAndReturn(
        requestId, context, validation.assessment, response.text,
        !validation.valid,
        validation.valid ? null : validation.errors.join('; '),
        latencyMs, response.inputTokens, response.outputTokens,
      );
    } catch (error) {
      this.circuitBreaker.recordFailure();
      const latencyMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      logger.error({ requestId, error: errorMsg, latencyMs }, 'Claude API call failed');

      return this.persistAndReturn(
        requestId, context,
        { ...DEFAULT_HOLD_ASSESSMENT, thesis: `API error: ${errorMsg.slice(0, 200)}` },
        '', true, errorMsg, latencyMs, 0, 0,
      );
    }
  }

  /** Call Claude API directly via fetch */
  private async callClaude(userMessage: string): Promise<{
    text: string;
    inputTokens: number;
    outputTokens: number;
  }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: 512,   // Assessment is compact — no need for 1024
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMessage }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Claude API ${response.status}: ${errorBody.slice(0, 200)}`);
      }

      const data = await response.json() as {
        content: Array<{ type: string; text?: string }>;
        usage: { input_tokens: number; output_tokens: number };
      };

      const text = data.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
        .join('');

      return {
        text,
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Persist assessment to DB and return record */
  private async persistAndReturn(
    requestId: string,
    context: DecisionContext,
    assessment: AIAssessment,
    rawResponse: string,
    isFallback: boolean,
    fallbackReason: string | null,
    latencyMs: number,
    inputTokens: number,
    outputTokens: number,
  ): Promise<AIAssessmentRecord> {
    const inputSummary = {
      symbol: context.symbol,
      mid: context.ticker.mid,
      rsi: context.features.rsi,
      spreadBps: context.features.spreadBps,
      volumeRatio: context.features.volumeRatio,
      hasPosition: context.position.hasPosition,
      dailyPnl: context.account.dailyPnl,
      dailyTrades: context.account.dailyTradeCount,
    };

    let dbId = requestId;
    try {
      const record = await this.db.modelDecision.create({
        data: {
          requestId,
          symbol: context.symbol,
          // Store AIAssessment JSON — compatible with the existing Json column
          decision: toInputJson(assessment),
          inputSummary: toInputJson(inputSummary),
          rawResponse: rawResponse.slice(0, 10000),
          isValid: !isFallback,
          isFallback,
          fallbackReason,
          latencyMs,
          model: this.config.model,
          inputTokens,
          outputTokens,
        },
      });
      dbId = record.id;
    } catch (error) {
      logger.error({ error, requestId }, 'Failed to persist assessment — continuing');
    }

    return {
      id: dbId,
      requestId,
      symbol: context.symbol,
      assessment,
      inputSummary,
      rawResponse,
      isValid: !isFallback,
      isFallback,
      fallbackReason,
      latencyMs,
      model: this.config.model,
      inputTokens,
      outputTokens,
      createdAt: new Date(),
    };
  }
}
