// ═══════════════════════════════════════════════════════════════
// Logger — Pino structured logging with correlation
// ═══════════════════════════════════════════════════════════════

import pino from 'pino';

const LOG_LEVEL = process.env['LOG_LEVEL'] ?? 'info';

/** Root logger instance */
export const rootLogger = pino({
  level: LOG_LEVEL,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Redact sensitive fields from logs
  redact: {
    paths: [
      'apiKey',
      'apiSecret',
      'password',
      'token',
      'authorization',
      'BINANCE_API_KEY',
      'BINANCE_API_SECRET',
      'ANTHROPIC_API_KEY',
      'API_AUTH_TOKEN',
    ],
    censor: '[REDACTED]',
  },
});

/** Create a child logger with module context */
export function createLogger(module: string) {
  return rootLogger.child({ module });
}

/** Create a child logger with request correlation */
export function createCorrelatedLogger(
  module: string,
  requestId: string,
  tradeId?: string,
) {
  return rootLogger.child({
    module,
    requestId,
    ...(tradeId ? { tradeId } : {}),
  });
}

export type Logger = pino.Logger;
