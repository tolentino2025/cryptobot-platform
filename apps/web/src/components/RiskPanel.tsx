'use client';

import { cn, formatUSD } from '@/lib/utils';
import { Card, SectionLabel, ProgressBar } from './ui';

interface RiskPanelProps {
  portfolio: {
    dailyTradeCount: number;
    consecutiveLosses: number;
  };
  riskLimits: {
    maxDailyLoss: number;
    dailyLossRemaining: number | null;
    maxConsecutiveLosses?: number;
    maxPositionNotional?: number;
    [key: string]: unknown;
  } | null;
}

export function RiskPanel({ portfolio, riskLimits }: RiskPanelProps) {
  const maxLoss   = riskLimits?.maxDailyLoss ?? 0;
  const remaining = riskLimits?.dailyLossRemaining ?? maxLoss;
  const usedLoss  = maxLoss - remaining;
  const lossPct   = maxLoss > 0 ? (usedLoss / maxLoss) * 100 : 0;

  const maxConsec   = (riskLimits?.maxConsecutiveLosses as number) ?? 3;
  const consec      = portfolio.consecutiveLosses;
  const consecPct   = maxConsec > 0 ? (consec / maxConsec) * 100 : 0;

  // Risk status
  type StatusKey = 'SAFE' | 'WARNING' | 'BLOCKED';
  let status: StatusKey;
  if (lossPct >= 100 || consec >= maxConsec) {
    status = 'BLOCKED';
  } else if (lossPct >= 50 || consec >= maxConsec - 1) {
    status = 'WARNING';
  } else {
    status = 'SAFE';
  }

  const statusCfg: Record<StatusKey, { label: string; color: string; bg: string }> = {
    SAFE:    { label: 'SAFE',            color: '#22C55E', bg: 'bg-[#22C55E]/10 border-[#22C55E]/25' },
    WARNING: { label: 'WARNING',         color: '#F59E0B', bg: 'bg-[#F59E0B]/10 border-[#F59E0B]/25' },
    BLOCKED: { label: 'TRADING BLOCKED', color: '#EF4444', bg: 'bg-[#EF4444]/10 border-[#EF4444]/25' },
  };
  const sc = statusCfg[status];

  const lossBarColor  = lossPct  >= 75 ? '#EF4444' : lossPct  >= 50 ? '#F59E0B' : '#22C55E';
  const consecColor   = consecPct >= 75 ? '#EF4444' : consecPct >= 50 ? '#F59E0B' : '#22C55E';

  return (
    <Card className="p-4 flex flex-col gap-4">
      <SectionLabel>Risk Engine</SectionLabel>

      {/* Status banner */}
      <div className={cn('flex items-center justify-between px-3 py-2.5 rounded-xl border', sc.bg)}>
        <span className="text-xs text-[#64748B] font-semibold uppercase tracking-wider">
          Risk Status
        </span>
        <span className="text-sm font-black" style={{ color: sc.color }}>
          {sc.label}
        </span>
      </div>

      {/* Daily loss limit */}
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs text-[#64748B]">Daily Loss Used</span>
          <div className="text-right leading-none">
            <span className="text-xs font-mono font-bold" style={{ color: lossBarColor }}>
              {formatUSD(usedLoss)}
            </span>
            <span className="text-[10px] text-[#64748B] ml-1">/ {formatUSD(maxLoss)}</span>
          </div>
        </div>
        <ProgressBar value={usedLoss} max={maxLoss} color={lossBarColor} />
        <p className="text-[10px] text-[#64748B] mt-1">{formatUSD(remaining)} remaining capacity</p>
      </div>

      {/* Consecutive losses */}
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs text-[#64748B]">Consecutive Losses</span>
          <span className="text-xs font-mono font-bold" style={{ color: consecColor }}>
            {consec} / {maxConsec}
          </span>
        </div>
        <ProgressBar value={consec} max={maxConsec} color={consecColor} />
      </div>

      {/* Additional limits */}
      <div className="space-y-2 pt-1 border-t border-[#1F1F2A]">
        {riskLimits?.maxPositionNotional && (
          <div className="flex justify-between items-center">
            <span className="text-xs text-[#64748B]">Max Position</span>
            <span className="text-xs font-mono text-white">
              {formatUSD(riskLimits.maxPositionNotional as number)}
            </span>
          </div>
        )}
        <div className="flex justify-between items-center">
          <span className="text-xs text-[#64748B]">Trades Today</span>
          <span className="text-xs font-mono text-white">{portfolio.dailyTradeCount}</span>
        </div>
      </div>
    </Card>
  );
}
