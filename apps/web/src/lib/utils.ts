// ═══════════════════════════════════════════════════════════════
// Dashboard Utilities
// ═══════════════════════════════════════════════════════════════

type ClassValue = string | false | undefined | null | Record<string, boolean>;

export function cn(...classes: ClassValue[]): string {
  return classes
    .flatMap((c) => {
      if (!c) return [];
      if (typeof c === 'string') return [c];
      return Object.entries(c).filter(([, v]) => v).map(([k]) => k);
    })
    .join(' ');
}

export function formatUSD(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export function formatNumber(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function stateColor(state: string): string {
  const colors: Record<string, string> = {
    RUNNING: 'text-emerald-400',
    PAUSED: 'text-amber-400',
    KILLED: 'text-red-400',
    DEGRADED: 'text-orange-400',
    INITIALIZING: 'text-blue-400',
    RECONCILING: 'text-purple-400',
    SAFE_MODE: 'text-red-300',
  };
  return colors[state] ?? 'text-gray-400';
}

export function stateBg(state: string): string {
  const colors: Record<string, string> = {
    RUNNING: 'bg-emerald-500/10 border-emerald-500/30',
    PAUSED: 'bg-amber-500/10 border-amber-500/30',
    KILLED: 'bg-red-500/10 border-red-500/30',
    DEGRADED: 'bg-orange-500/10 border-orange-500/30',
    INITIALIZING: 'bg-blue-500/10 border-blue-500/30',
    SAFE_MODE: 'bg-red-500/10 border-red-500/30',
  };
  return colors[state] ?? 'bg-gray-500/10 border-gray-500/30';
}

export function modeColor(mode: string): string {
  return mode === 'LIVE' ? 'text-red-400 bg-red-500/20' :
    mode === 'DEMO' ? 'text-amber-400 bg-amber-500/20' :
      'text-cyan-400 bg-cyan-500/20';
}

export function verdictColor(verdict: string): string {
  return verdict === 'APPROVED' ? 'text-emerald-400' :
    verdict === 'ADJUSTED' ? 'text-amber-400' :
      verdict === 'DENIED' ? 'text-red-400' : 'text-gray-400';
}

export function pnlColor(value: number): string {
  return value > 0 ? 'text-emerald-400' : value < 0 ? 'text-red-400' : 'text-gray-400';
}
