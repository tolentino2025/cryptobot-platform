// ═══════════════════════════════════════════════════════════════
// Custom Errors — Typed errors for clear error handling
// ═══════════════════════════════════════════════════════════════

export class CryptoBotError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CryptoBotError';
  }
}

export class ExchangeError extends CryptoBotError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'EXCHANGE_ERROR', context);
    this.name = 'ExchangeError';
  }
}

export class RiskViolationError extends CryptoBotError {
  constructor(
    message: string,
    public readonly violations: string[],
    context?: Record<string, unknown>,
  ) {
    super(message, 'RISK_VIOLATION', context);
    this.name = 'RiskViolationError';
  }
}

export class MarketDataError extends CryptoBotError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'MARKET_DATA_ERROR', context);
    this.name = 'MarketDataError';
  }
}

export class DecisionEngineError extends CryptoBotError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'DECISION_ENGINE_ERROR', context);
    this.name = 'DecisionEngineError';
  }
}

export class ConfigError extends CryptoBotError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONFIG_ERROR', context);
    this.name = 'ConfigError';
  }
}

export class ReconciliationError extends CryptoBotError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'RECONCILIATION_ERROR', context);
    this.name = 'ReconciliationError';
  }
}

export class IdempotencyError extends CryptoBotError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'IDEMPOTENCY_ERROR', context);
    this.name = 'IdempotencyError';
  }
}
