'use client';

import { cn, formatDate, formatDuration, stateColor } from '@/lib/utils';
import { Card, SectionLabel } from './ui';

// ─────────────────────────────────────────────────────
// Compact inline health panel (sidebar / overview use)
// ─────────────────────────────────────────────────────

const CHECK_ICONS: Record<string, string> = {
  'Database':    '🗄',
  'Redis':       '⚡',
  'Exchange':    '🔗',
  'Market Data': '📡',
  'Clock Drift': '⏱',
};

export function SystemStatusPanel({ health }: { health: Record<string, unknown> | null }) {
  if (!health) return null;

  const checks = health.checks as Record<string, Record<string, unknown>> | undefined;
  if (!checks) return null;

  const rows = [
    { name: 'Database',    data: checks.database    },
    { name: 'Redis',       data: checks.redis       },
    { name: 'Exchange',    data: checks.exchange    },
    { name: 'Market Data', data: checks.marketData  },
    { name: 'Clock Drift', data: checks.clockDrift  },
  ];

  return (
    <Card className="p-4">
      <SectionLabel>System Health</SectionLabel>
      <div className="space-y-2">
        {rows.map(({ name, data }) => {
          if (!data) return null;
          const ok = data.healthy as boolean;
          return (
            <div key={name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full flex-shrink-0',
                    ok ? 'bg-[#22C55E]' : 'bg-[#EF4444] animate-pulse',
                  )}
                />
                <span className="text-xs text-[#94A3B8]">
                  {CHECK_ICONS[name] ?? '·'} {name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {data.latencyMs !== undefined && (
                  <span className="text-[10px] font-mono text-[#64748B]">
                    {data.latencyMs as number}ms
                  </span>
                )}
                {data.driftMs !== undefined && (
                  <span className="text-[10px] font-mono text-[#64748B]">
                    {data.driftMs as number}ms
                  </span>
                )}
                <span
                  className={cn(
                    'text-[10px] font-bold',
                    ok ? 'text-[#22C55E]' : 'text-[#EF4444]',
                  )}
                >
                  {ok ? 'OK' : 'ERR'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────
// Full health panel (used in the Health tab)
// ─────────────────────────────────────────────────────

export function HealthPanel({
  health,
  buildInfo,
}: {
  health: Record<string, unknown> | null;
  buildInfo: Record<string, unknown> | null;
}) {
  if (!health) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-[#64748B] text-sm">Health data not available</p>
      </div>
    );
  }

  const checks = health.checks as Record<string, Record<string, unknown>> | undefined;
  const rows = [
    { name: 'Database',    data: checks?.database    },
    { name: 'Redis',       data: checks?.redis       },
    { name: 'Exchange',    data: checks?.exchange    },
    { name: 'Market Data', data: checks?.marketData  },
    { name: 'Clock Drift', data: checks?.clockDrift  },
  ];

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <p className="text-[10px] text-[#64748B] uppercase tracking-wider mb-1">Overall</p>
          <p
            className={cn('text-lg font-black', {
              'text-[#22C55E]': health.status === 'ok',
              'text-[#F59E0B]': health.status === 'degraded',
              'text-[#EF4444]': health.status === 'error',
            })}
          >
            {(health.status as string)?.toUpperCase()}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] text-[#64748B] uppercase tracking-wider mb-1">State</p>
          <p className={cn('text-sm font-bold font-mono', stateColor(health.systemState as string))}>
            {health.systemState as string}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] text-[#64748B] uppercase tracking-wider mb-1">Uptime</p>
          <p className="text-sm font-bold font-mono text-white">
            {formatDuration(Math.floor((health.uptime as number) ?? 0))}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] text-[#64748B] uppercase tracking-wider mb-1">Version</p>
          <p className="text-sm font-bold font-mono text-[#3B82F6]">v{health.version as string}</p>
        </Card>
      </div>

      {/* Component checks */}
      <Card className="p-4">
        <SectionLabel>Component Status</SectionLabel>
        <div className="divide-y divide-[#1F1F2A]">
          {rows.map(({ name, data }) => {
            if (!data) return null;
            const ok = data.healthy as boolean;
            const symbols = data.symbols as Record<string, { fresh: boolean; ageMs: number }> | undefined;
            return (
              <div key={name} className="flex items-start justify-between py-3">
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full flex-shrink-0 mt-1',
                      ok ? 'bg-[#22C55E]' : 'bg-[#EF4444] animate-pulse',
                    )}
                  />
                  <div>
                    <p className={cn('text-sm font-medium', ok ? 'text-white' : 'text-[#EF4444]')}>
                      {name}
                    </p>
                    {(data.error as string) && (
                      <p className="text-xs text-[#EF4444]/70 mt-0.5">{data.error as string}</p>
                    )}
                    {(data.driftMs as number) !== undefined && (
                      <p
                        className={cn(
                          'text-xs mt-0.5',
                          (data.driftMs as number) > 500 ? 'text-[#F59E0B]' : 'text-[#64748B]',
                        )}
                      >
                        Drift: {data.driftMs as number}ms
                      </p>
                    )}
                    {symbols && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {Object.entries(symbols).map(([sym, s]) => (
                          <span
                            key={sym}
                            className={cn(
                              'text-[10px] font-mono px-1.5 py-0.5 rounded border',
                              s.fresh
                                ? 'text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/20'
                                : 'text-[#EF4444] bg-[#EF4444]/10 border-[#EF4444]/20',
                            )}
                          >
                            {sym} {s.ageMs >= 0 ? `${s.ageMs}ms` : 'no data'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right text-xs text-[#64748B] flex-shrink-0 ml-4">
                  {data.latencyMs !== undefined && (
                    <p className="font-mono">{String(data.latencyMs)}ms</p>
                  )}
                  {!!data.lastCheckedAt && (
                    <p className="text-[10px] font-mono">
                      {data.lastCheckedAt === 'never'
                        ? 'never'
                        : formatDate(data.lastCheckedAt as string)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Build info */}
      {buildInfo && (
        <Card className="p-4">
          <SectionLabel>Build Info</SectionLabel>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {([
              ['Version',     `v${buildInfo.version}`],
              ['Environment', buildInfo.environment],
              ['Node',        buildInfo.nodeVersion],
              ['Git Commit',  buildInfo.gitCommit === 'unknown' ? '—' : (buildInfo.gitCommit as string)?.slice(0, 8)],
              ['Built At',    buildInfo.buildTimestamp === 'unknown' ? '—' : formatDate(buildInfo.buildTimestamp as string)],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} className="bg-[#0F0F17] rounded-lg p-2.5 border border-[#1F1F2A]">
                <p className="text-[10px] text-[#64748B] mb-1">{label}</p>
                <p className="font-mono text-xs text-white truncate">{value}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
