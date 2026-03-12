// ═══════════════════════════════════════════════════════════════
// Config Types
// Bot, strategy, and system configuration types
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';
import { TradingMode, Exchange } from './enums.js';

/** Bot global configuration */
export interface BotConfig {
  id: string;
  /** Current trading mode */
  mode: TradingMode;
  /** Active exchange */
  exchange: Exchange;
  /** Decision interval in seconds */
  decisionIntervalSec: number;
  /** Claude model identifier */
  claudeModel: string;
  /** Claude API timeout in ms */
  claudeTimeoutMs: number;
  /** Claude max retries */
  claudeMaxRetries: number;
  /** Config version (increments on change) */
  version: number;
  /** Whether the bot is enabled */
  enabled: boolean;
  updatedAt: Date;
}

/** Strategy configuration — parameterizes the decision engine */
export interface StrategyConfig {
  id: string;
  name: string;
  /** Strategy type identifier */
  type: 'MICRO_PULLBACK' | 'MEAN_REVERSION' | 'BREAKOUT' | 'CUSTOM';

  // ── Indicator Parameters ──
  emaFastPeriod: number;
  emaSlowPeriod: number;
  rsiPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;
  atrPeriod: number;

  // ── Entry Filters ──
  minVolumeRatio: number;
  minBookImbalance: number;
  minConfidence: number;

  // ── Exit Rules ──
  takeProfitBps: number;
  stopLossBps: number;
  timeoutSeconds: number;

  // ── Candle settings ──
  candleInterval: '1m' | '5m';
  lookbackCandles: number;

  /** Config version */
  version: number;
  /** Is this the active strategy? */
  isActive: boolean;
  updatedAt: Date;
}

/** Zod schema for strategy config validation */
export const StrategyConfigSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['MICRO_PULLBACK', 'MEAN_REVERSION', 'BREAKOUT', 'CUSTOM']),
  emaFastPeriod: z.number().int().min(2).max(200),
  emaSlowPeriod: z.number().int().min(2).max(500),
  rsiPeriod: z.number().int().min(2).max(100),
  rsiOversold: z.number().min(0).max(100),
  rsiOverbought: z.number().min(0).max(100),
  atrPeriod: z.number().int().min(2).max(100),
  minVolumeRatio: z.number().positive(),
  minBookImbalance: z.number().min(0).max(10),
  minConfidence: z.number().min(0).max(1),
  takeProfitBps: z.number().int().positive(),
  stopLossBps: z.number().int().positive(),
  timeoutSeconds: z.number().int().positive(),
  candleInterval: z.enum(['1m', '5m']),
  lookbackCandles: z.number().int().min(5).max(500),
});

/** Symbol configuration */
export interface SymbolConfig {
  symbol: string;
  /** Base asset (e.g., BTC) */
  baseAsset: string;
  /** Quote asset (e.g., USDT) */
  quoteAsset: string;
  /** Minimum order size in quote */
  minNotional: number;
  /** Minimum quantity increment */
  stepSize: number;
  /** Price precision (decimal places) */
  pricePrecision: number;
  /** Quantity precision (decimal places) */
  quantityPrecision: number;
  /** Is trading enabled for this symbol? */
  enabled: boolean;
}

/** Environment configuration schema */
export const EnvConfigSchema = z.object({
  // System
  TRADING_MODE: z.nativeEnum(TradingMode).default(TradingMode.SIM),
  LIVE_CONFIRMATION_CODE: z.string().optional().default(''),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Database
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  // Claude
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  CLAUDE_MODEL: z.string().default('claude-sonnet-4-20250514'),
  CLAUDE_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  CLAUDE_MAX_RETRIES: z.coerce.number().int().nonnegative().default(1),

  // Binance
  BINANCE_API_KEY: z.string().optional().default(''),
  BINANCE_API_SECRET: z.string().optional().default(''),
  BINANCE_TESTNET: z.coerce.boolean().default(true),

  // API
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_AUTH_TOKEN: z.string().min(8),

  // Dashboard
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:3001'),
  DASHBOARD_PORT: z.coerce.number().int().positive().default(3000),

  // Notifications
  NOTIFICATION_WEBHOOK_URL: z.string().optional().default(''),

  // Operations
  DECISION_INTERVAL_SEC: z.coerce.number().int().positive().default(15),
});

export type EnvConfig = z.infer<typeof EnvConfigSchema>;
