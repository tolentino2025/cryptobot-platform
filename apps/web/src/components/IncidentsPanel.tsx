'use client';

import { cn, formatDate } from '@/lib/utils';
import { Card, SectionLabel, Badge } from './ui';

export function IncidentsPanel({ incidents }: { incidents: Record<string, unknown>[] }) {
  const active   = incidents.filter((i) => i.isActive);
  const resolved = incidents.filter((i) => !i.isActive);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Incidents</SectionLabel>
        {active.length > 0 ? (
          <Badge className="text-[#EF4444] bg-[#EF4444]/10 border-[#EF4444]/20 text-[10px]">
            <span className="w-1 h-1 rounded-full bg-[#EF4444] animate-ping" />
            {active.length} active
          </Badge>
        ) : incidents.length > 0 ? (
          <Badge className="text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/20 text-[10px]">
            All resolved
          </Badge>
        ) : null}
      </div>

      {incidents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <div className="w-10 h-10 rounded-full bg-[#22C55E]/10 border border-[#22C55E]/20 flex items-center justify-center">
            <span className="text-[#22C55E] text-sm">✓</span>
          </div>
          <p className="text-[#22C55E] text-sm font-semibold">All Clear</p>
          <p className="text-[#64748B] text-xs">No incidents detected</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
          {[...active, ...resolved].map((inc) => {
            const severity  = inc.severity as string;
            const isCrit    = severity === 'CRITICAL' || severity === 'FATAL';
            const isWarn    = severity === 'WARNING';
            const isActive  = inc.isActive as boolean;

            return (
              <div
                key={inc.id as string}
                className={cn(
                  'rounded-xl border p-3 text-xs transition-colors',
                  isActive
                    ? isCrit
                      ? 'bg-[#EF4444]/8 border-[#EF4444]/25'
                      : 'bg-[#F59E0B]/8 border-[#F59E0B]/25'
                    : 'bg-[#1F1F2A]/40 border-[#1F1F2A]',
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span
                      className={cn(
                        'flex-shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border',
                        isCrit
                          ? 'text-[#EF4444] bg-[#EF4444]/10 border-[#EF4444]/20'
                          : isWarn
                          ? 'text-[#F59E0B] bg-[#F59E0B]/10 border-[#F59E0B]/20'
                          : 'text-[#64748B] bg-[#64748B]/10 border-[#64748B]/20',
                      )}
                    >
                      {severity}
                    </span>
                    <span
                      className={cn(
                        'font-semibold truncate',
                        isActive && isCrit
                          ? 'text-[#EF4444]'
                          : isActive && isWarn
                          ? 'text-[#F59E0B]'
                          : 'text-[#64748B]',
                      )}
                    >
                      {inc.title as string}
                    </span>
                  </div>
                  <span className="text-[10px] text-[#64748B] font-mono flex-shrink-0">
                    {formatDate(inc.createdAt as string)}
                  </span>
                </div>

                <p className="text-[#64748B] text-[11px] leading-relaxed mb-1.5">
                  {inc.description as string}
                </p>

                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'text-[10px] font-semibold px-1.5 py-0.5 rounded border',
                      isActive
                        ? 'text-[#EF4444] bg-[#EF4444]/10 border-[#EF4444]/20'
                        : 'text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/20',
                    )}
                  >
                    {isActive ? 'ACTIVE' : 'RESOLVED'}
                  </span>
                  <span className="text-[10px] text-[#64748B]">{inc.actionTaken as string}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
