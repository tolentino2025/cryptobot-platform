/**
 * Safe display formatters — never return NaN, Infinity, or absurd percentages.
 * All functions accept null/undefined and return a fallback string '—'.
 */

export const fmt = {
  /** Format USD: $1,234.56 / $12.3k / $1.2M */
  usd(v: number | null | undefined, dp = 2): string {
    if (v == null || !isFinite(v)) return '—';
    const sign = v < 0 ? '-' : '';
    const abs  = Math.abs(v);
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 10_000)    return `${sign}$${(abs / 1_000).toFixed(1)}k`;
    return `${v < 0 ? '-$' : '$'}${abs.toFixed(dp)}`;
  },

  /** Format percentage: 66.7% / +12.3% */
  pct(v: number | null | undefined, dp = 1, showSign = false): string {
    if (v == null || !isFinite(v)) return '—';
    const s = showSign && v > 0 ? '+' : '';
    return `${s}${v.toFixed(dp)}%`;
  },

  /**
   * Compute percentage safely: (used / max) × 100
   * Returns null when max = 0 or inputs are invalid — never returns absurd values.
   */
  safePct(used: number | null | undefined, max: number | null | undefined): number | null {
    if (
      used == null || max == null ||
      !isFinite(used) || !isFinite(max) ||
      max === 0
    ) return null;
    return Math.min(100, Math.max(0, (used / max) * 100));
  },

  /** Format integer / decimal number */
  num(v: number | null | undefined, dp = 0): string {
    if (v == null || !isFinite(v)) return '—';
    return v.toFixed(dp);
  },

  /** Format duration in seconds → human-readable */
  duration(seconds: number | null | undefined): string {
    if (seconds == null || !isFinite(seconds) || seconds < 0) return '—';
    if (seconds < 60)   return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h < 24) return `${h}h ${m}m`;
    return `${Math.floor(h / 24)}d ${h % 24}h`;
  },

  /** Format ISO timestamp → HH:MM:SS */
  time(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleTimeString([], {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    } catch { return '—'; }
  },

  /** Format ISO timestamp → "X ago" */
  ago(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
      const s = (Date.now() - new Date(iso).getTime()) / 1000;
      if (s < 60)   return `${Math.round(s)}s ago`;
      if (s < 3600) return `${Math.floor(s / 60)}m ago`;
      if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
      return `${Math.floor(s / 86400)}d ago`;
    } catch { return '—'; }
  },

  /** Format latency: 42ms / 1.23s */
  latency(ms: number | null | undefined): string {
    if (ms == null || !isFinite(ms)) return '—';
    return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
  },

  /** Format quantity with up to N significant decimal places */
  qty(v: number | null | undefined, dp = 4): string {
    if (v == null || !isFinite(v)) return '—';
    return v.toFixed(dp);
  },
} as const;
