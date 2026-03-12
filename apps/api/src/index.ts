// ═══════════════════════════════════════════════════════════════
// CryptoBot Platform — API Entry Point
// Boots all services, wires dependencies, starts decision loop
// ═══════════════════════════════════════════════════════════════

import { createLogger, closeRedis } from '@cryptobot/core';
import { loadEnvConfig } from '@cryptobot/config';
import { prisma } from '@cryptobot/db';
import { SimulatedAdapter, BinanceAdapter } from '@cryptobot/exchange';
import type { IExchangeAdapter } from '@cryptobot/exchange';
import { TradingMode } from '@cryptobot/shared-types';
import { createServer } from './server.js';
import { MainOrchestrator } from './orchestrator.js';

const logger = createLogger('main');

async function main() {
  logger.info('╔══════════════════════════════════════════════════════╗');
  logger.info('║        CRYPTOBOT PLATFORM — Starting...              ║');
  logger.info('║  ⚠️  No guarantee of financial returns.              ║');
  logger.info('║  Priority: robustness, risk control, auditability.   ║');
  logger.info('╚══════════════════════════════════════════════════════╝');

  // 1. Load and validate environment configuration
  const env = loadEnvConfig();
  logger.info({ mode: env.TRADING_MODE, model: env.CLAUDE_MODEL }, `Mode: ${env.TRADING_MODE}`);

  if (env.TRADING_MODE === TradingMode.LIVE) {
    logger.warn('');
    logger.warn('  ⚠️⚠️⚠️  LIVE MODE — REAL MONEY AT RISK  ⚠️⚠️⚠️');
    logger.warn('');
  }

  try {
    // 2. Test database connection
    await prisma.$connect();
    logger.info('Database connected');

    // 3. Create exchange adapter based on mode
    let adapter: IExchangeAdapter;
    if (env.TRADING_MODE === TradingMode.SIM) {
      const sim = new SimulatedAdapter();
      sim.setBalances([
        { asset: 'USDT', amount: 10000 },
        { asset: 'BTC', amount: 0 },
      ]);
      adapter = sim;
    } else if (env.TRADING_MODE === TradingMode.DEMO) {
      adapter = new BinanceAdapter({
        apiKey: env.BINANCE_API_KEY,
        apiSecret: env.BINANCE_API_SECRET,
        testnet: true,
      });
    } else {
      adapter = new BinanceAdapter({
        apiKey: env.BINANCE_API_KEY,
        apiSecret: env.BINANCE_API_SECRET,
        testnet: false,
      });
    }

    // 4. Create main orchestrator
    const orchestrator = new MainOrchestrator(
      prisma,
      adapter,
      {
        apiKey: env.ANTHROPIC_API_KEY ?? '',
        model: env.CLAUDE_MODEL,
        timeoutMs: env.CLAUDE_TIMEOUT_MS,
        maxRetries: env.CLAUDE_MAX_RETRIES,
        allowedSymbols: ['BTCUSDT'], // Will be loaded from DB
      },
      env.TRADING_MODE,
      env.DECISION_INTERVAL_SEC,
      env.NOTIFICATION_WEBHOOK_URL,
    );

    const services = orchestrator.getServices();

    // 5. Create HTTP server
    const server = await createServer({
      db: prisma,
      audit: services.audit,
      portfolio: services.portfolio,
      notifications: services.notifications,
      getSystemState: () => orchestrator.getSystemState(),
      setSystemState: (state, reason) => orchestrator.setSystemState(state, reason),
      getTradingMode: () => orchestrator.getTradingMode(),
      setTradingMode: (mode, code) => orchestrator.setTradingMode(mode, code),
      getHealth: () => orchestrator.getHealth(),
    });

    // 6. Start HTTP server
    await server.listen({ host: env.API_HOST, port: env.API_PORT });
    logger.info({ host: env.API_HOST, port: env.API_PORT }, `API listening on ${env.API_HOST}:${env.API_PORT}`);

    // 7. Start the main orchestrator (market data + decision loop)
    await orchestrator.start();

    // ── Graceful Shutdown ──
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutting down gracefully...');
      await orchestrator.stop();
      await server.close();
      await prisma.$disconnect();
      await closeRedis();
      logger.info('Shutdown complete');
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('uncaughtException', (error) => {
      logger.fatal({ error }, 'Uncaught exception — shutting down');
      shutdown('uncaughtException');
    });
    process.on('unhandledRejection', (reason) => {
      logger.error({ reason }, 'Unhandled promise rejection');
    });
  } catch (error) {
    logger.fatal({ error }, 'Failed to start — check configuration and dependencies');
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
