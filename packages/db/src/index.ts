// ═══════════════════════════════════════════════════════════════
// @cryptobot/db — Prisma Client Singleton
// Ensures a single PrismaClient instance across the application
// ═══════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env['NODE_ENV'] === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { PrismaClient };
export type * from '@prisma/client';
