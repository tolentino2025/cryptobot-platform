// ═══════════════════════════════════════════════════════════════
// Config Loader — Validates and loads environment configuration
// ═══════════════════════════════════════════════════════════════

import { config } from 'dotenv';
import { resolve } from 'path';
import { EnvConfigSchema, type EnvConfig, TradingMode } from '@cryptobot/shared-types';

// Load .env — try cwd first, then walk up to monorepo root
config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), '../../.env'), override: false });

let cachedConfig: EnvConfig | null = null;

/**
 * Load and validate environment configuration.
 * Throws on invalid config — fail fast at startup.
 */
export function loadEnvConfig(): EnvConfig {
  if (cachedConfig) return cachedConfig;

  const result = EnvConfigSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`❌ Invalid environment configuration:\n${errors}`);
  }

  const envConfig = result.data;

  // ── Safety checks for LIVE mode ──
  if (envConfig.TRADING_MODE === TradingMode.LIVE) {
    if (!envConfig.LIVE_CONFIRMATION_CODE) {
      throw new Error(
        '❌ LIVE mode requires LIVE_CONFIRMATION_CODE to be set. ' +
        'This is a safety measure to prevent accidental live trading.',
      );
    }
    if (!envConfig.BINANCE_API_KEY || !envConfig.BINANCE_API_SECRET) {
      throw new Error(
        '❌ LIVE mode requires BINANCE_API_KEY and BINANCE_API_SECRET.',
      );
    }
    if (envConfig.BINANCE_TESTNET) {
      throw new Error(
        '❌ LIVE mode cannot use testnet. Set BINANCE_TESTNET=false.',
      );
    }
  }

  // ── Safety checks for DEMO mode ──
  if (envConfig.TRADING_MODE === TradingMode.DEMO) {
    if (!envConfig.BINANCE_API_KEY || !envConfig.BINANCE_API_SECRET) {
      throw new Error(
        '❌ DEMO mode requires Binance Testnet credentials.',
      );
    }
  }

  cachedConfig = envConfig;
  return envConfig;
}

/** Clear cached config (useful for tests) */
export function clearConfigCache(): void {
  cachedConfig = null;
}

export { DEFAULT_RISK_LIMITS, DEFAULT_STRATEGY_CONFIG } from './defaults.js';
