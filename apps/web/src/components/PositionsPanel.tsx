'use client';

import { cn, formatUSD, formatPercent, formatNumber, pnlColor } from '@/lib/utils';
import { Card, SectionLabel, Badge } from './ui';

export function PositionsPanel({ positions }: { positions: Record<string, unknown>[] }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Open Positions</SectionLabel>
        <span className="text-xs font-mono text-[#64748B]">
          {positions.length} open
        </span>
      </div>

      {positions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2">
          <div className="w-10 h-10 rounded-full bg-[#1F1F2A] flex items-center justify-center">
            <span className="text-[#64748B]">—</span>
          </div>
          <p className="text-[#64748B] text-sm">No open positions</p>
          <p className="text-[#2A2A3A] text-xs">Bot is flat</p>
        </div>
      ) : (
        <div className="space-y-2">
          {positions.map((p) => {
            const pnl    = (p.unrealizedPnl as number) ?? 0;
            const pnlPct = (p.unrealizedPnlPercent as number) ?? 0;
            const side   = p.side as string;
            const isLong = side === 'LONG' || side === 'BUY';

            return (
              <div
                key={p.id as string}
                className="bg-[#0F0F17] rounded-xl border border-[#1F1F2A] p-3 hover:border-[#2A2A3A] transition-colors"
              >
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-white text-sm">{p.symbol as string}</span>
                    <Badge
                      className={cn(
                        'text-[10px]',
                        isLong
                          ? 'text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/20'
                          : 'text-[#EF4444] bg-[#EF4444]/10 border-[#EF4444]/20',
                      )}
                    >
                      {side}
                    </Badge>
                  </div>
                  <div className="text-right">
                    <p className={cn('font-mono font-bold text-sm', pnlColor(pnl))}>
                      {formatUSD(pnl)}
                    </p>
                    <p className={cn('text-[10px] font-mono', pnlColor(pnlPct))}>
                      {formatPercent(pnlPct)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div>
                    <p className="text-[10px] text-[#64748B]">Entry</p>
                    <p className="font-mono text-white">{formatUSD(p.entryPrice as number)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#64748B]">Current</p>
                    <p className="font-mono text-white">{formatUSD((p.currentPrice as number) ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#64748B]">Qty</p>
                    <p className="font-mono text-white">{formatNumber(p.quantity as number, 5)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#64748B]">Notional</p>
                    <p className="font-mono text-white">{formatUSD(p.notional as number)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
