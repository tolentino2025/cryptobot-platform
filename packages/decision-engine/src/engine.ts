// ═══════════════════════════════════════════════════════════════
// ClaudeDecisionEngine — Consults Claude for trading decisions
// NEVER executes orders. Only proposes structured decisions.
// ═══════════════════════════════════════════════════════════════

import {
  createLogger,
  generateRequestId,
  CircuitBreaker,
  retryWithBackoff,
} from '@cryptobot/core';
import type { PrismaClient, Prisma } from '@prisma/client';
import {
  DEFAULT_HOLD_DECISION,
  type ModelDecision,
  type ModelDecisionRecord,
  type DecisionContext,
} from '@cryptobot/shared-types';
import { SYSTEM_PROMPT, buildUserMessage } from './prompt.js';
import { validateModelResponse } from './schema.js';

const logger = createLogger('decision-engine');

export interface DecisionEngineConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
  allowedSymbols: string[];
}

export class ClaudeDecisionEngine {
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
   * Consult Claude for a trading decision.
   * Returns structured ModelDecision — NEVER executes anything.
   */
  async decide(context: DecisionContext): Promise<ModelDecisionRecord> {
    const requestId = generateRequestId();
    const startTime = Date.now();

    // Circuit breaker check
    if (this.circuitBreaker.isOpen) {
      logger.warn({ requestId }, 'Circuit breaker OPEN — returning HOLD');
      return this.persistAndReturn(requestId, context, DEFAULT_HOLD_DECISION, '', true, 'Circuit breaker open', 0, 0, 0);
    }

    // Skip API call if no key (SIM mode without key)
    if (!this.config.apiKey) {
      logger.debug({ requestId }, 'No API key — returning HOLD (SIM stub)');
      return this.persistAndReturn(requestId, context, DEFAULT_HOLD_DECISION, '', true, 'No API key configured', 0, 0, 0);
    }

    try {
      const userMessage = buildUserMessage(context);

      // Call Claude API with timeout
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

      // Validate response
      const validation = validateModelResponse(response.text, this.config.allowedSymbols);

      this.circuitBreaker.recordSuccess();

      logger.info(
        {
          requestId,
          action: validation.decision.action,
          symbol: validation.decision.symbol,
          confidence: validation.decision.confidence,
          valid: validation.valid,
          latencyMs,
        },
        `Decision: ${validation.decision.action} (confidence: ${validation.decision.confidence})`,
      );

      return this.persistAndReturn(
        requestId, context, validation.decision, response.text,
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
        { ...DEFAULT_HOLD_DECISION, thesis: `API error: ${errorMsg.slice(0, 200)}` },
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
          max_tokens: 1024,
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

  /** Persist decision to DB and return record */
  private async persistAndReturn(
    requestId: string,
    context: DecisionContext,
    decision: ModelDecision,
    rawResponse: string,
    isFallback: boolean,
    fallbackReason: string | null,
    latencyMs: number,
    inputTokens: number,
    outputTokens: number,
  ): Promise<ModelDecisionRecord> {
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

    // Persist to DB
    let dbId = requestId;
    try {
      const record = await this.db.modelDecision.create({
        data: {
          requestId,
          symbol: decision.symbol || context.symbol,
          decision: decision as unknown as Prisma.InputJsonValue,
          inputSummary: inputSummary as unknown as Prisma.InputJsonValue,
          rawResponse: rawResponse.slice(0, 10000), // Limit size
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
      logger.error({ error, requestId }, 'Failed to persist decision — continuing');
    }

    return {
      id: dbId,
      requestId,
      symbol: decision.symbol || context.symbol,
      decision,
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
