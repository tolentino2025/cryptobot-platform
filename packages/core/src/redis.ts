// ═══════════════════════════════════════════════════════════════
// Redis — Client wrapper with connection management
// Used for: cache, locks, rate limiting, ephemeral state, pub/sub
// ═══════════════════════════════════════════════════════════════

import Redis from 'ioredis';
import { createLogger } from './logger.js';

const logger = createLogger('redis');

let redisClient: Redis | null = null;
let redisSub: Redis | null = null;

/** Get or create the main Redis client */
export function getRedis(): Redis {
  if (!redisClient) {
    const url = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 200, 5000);
        logger.warn({ attempt: times, delayMs: delay }, 'Redis reconnecting');
        return delay;
      },
      lazyConnect: false,
    });

    redisClient.on('connect', () => logger.info('Redis connected'));
    redisClient.on('error', (err) => logger.error({ err }, 'Redis error'));
    redisClient.on('close', () => logger.warn('Redis connection closed'));
  }
  return redisClient;
}

/** Get or create a Redis subscriber client (separate connection) */
export function getRedisSub(): Redis {
  if (!redisSub) {
    const url = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    redisSub = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        return Math.min(times * 200, 5000);
      },
    });
  }
  return redisSub;
}

/** Graceful shutdown */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
  if (redisSub) {
    await redisSub.quit();
    redisSub = null;
  }
  logger.info('Redis connections closed');
}

// ── Utility functions ──

/** Set with TTL in seconds */
export async function setWithTTL(
  key: string,
  value: string,
  ttlSeconds: number,
): Promise<void> {
  await getRedis().setex(key, ttlSeconds, value);
}

/** Simple distributed lock with TTL */
export async function acquireLock(
  lockKey: string,
  ttlMs: number,
): Promise<boolean> {
  const result = await getRedis().set(
    `lock:${lockKey}`,
    '1',
    'PX',
    ttlMs,
    'NX',
  );
  return result === 'OK';
}

/** Release lock */
export async function releaseLock(lockKey: string): Promise<void> {
  await getRedis().del(`lock:${lockKey}`);
}

/** Increment counter with TTL (for rate limiting) */
export async function incrementCounter(
  key: string,
  ttlSeconds: number,
): Promise<number> {
  const redis = getRedis();
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, ttlSeconds);
  }
  return count;
}
