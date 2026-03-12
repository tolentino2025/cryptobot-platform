// ═══════════════════════════════════════════════════════════════
// Build Info — Capture build-time metadata for observability
// Set GIT_COMMIT and BUILD_TIMESTAMP in your CI/CD pipeline.
// ═══════════════════════════════════════════════════════════════

export interface BuildInfo {
  version: string;
  gitCommit: string;
  buildTimestamp: string;
  environment: string;
  nodeVersion: string;
}

export function getBuildInfo(): BuildInfo {
  return {
    version: process.env['npm_package_version'] ?? '0.1.0',
    gitCommit: process.env['GIT_COMMIT'] ?? 'unknown',
    buildTimestamp: process.env['BUILD_TIMESTAMP'] ?? 'unknown',
    environment: process.env['NODE_ENV'] ?? 'development',
    nodeVersion: process.version,
  };
}
