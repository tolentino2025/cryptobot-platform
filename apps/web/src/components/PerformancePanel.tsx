'use client';

import { cn, formatUSD, formatPercent, pnlColor } from '@/lib/utils';
import { Card, Sparkline } from './ui';

interface PerfCardProps {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  trend?: 'up' | 'down' | 'neutral';
  sparkData?: number[];
}

export function PerfCard({ label, value, sub, color, trend, sparkData }: PerfCardProps) {
  const trendArrow = trend === 'up' ? '▲' : trend === 'down' ? '▼' : null;
  const trendColor = trend === 'up' ? '#22C55E' : trend === 'down' ? '#EF4444' : '#64748B';
  const sparkColor = trend === 'down' ? '#EF4444' : '#22C55E';

  return (
    <Card className="p-4 relative overflow-hidden group hover:border-[#2A2A3A] transition-colors cursor-default">
      <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-[0.1em] mb-1.5">
        {label}
      </p>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className={cn('text-xl font-bold font-mono leading-tight truncate', color ?? 'text-white')}>
            {value}
          </p>
          {sub && (
            <p className={cn('text-xs font-mono mt-0.5', color ?? 'text-[#64748B]')}>
              {trendArrow && (
                <span style={{ color: trendColor }} className="mr-1 text-[10px]">
                  {trendArrow}
                </span>
              )}
              {sub}
            </p>
          )}
        </div>
        {sparkData && sparkData.length >= 2 && (
          <div className="opacity-40 group-hover:opacity-80 transition-opacity flex-shrink-0">
            <Sparkline data={sparkData} color={sparkColor} height={32} width={80} />
          </div>
        )}
      </div>
    </Card>
  );
}

interface PerformancePanelProps {
  portfolio: {
    totalEquity: number;
    availableBalance: number;
    dailyPnl: number;
    dailyPnlPercent: number;
    weeklyPnl: number;
    unrealizedPnl: number;
    dailyTradeCount: number;
    openPositions: unknown[];
  };
  equitySparkData: number[];
}

export function PerformancePanel({ portfolio, equitySparkData }: PerformancePanelProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <PerfCard
        label="Total Equity"
        value={formatUSD(portfolio.totalEquity)}
        sparkData={equitySparkData}
        trend={portfolio.dailyPnl >= 0 ? 'up' : 'down'}
      />
      <PerfCard
        label="Available"
        value={formatUSD(portfolio.availableBalance)}
        sub={`${((portfolio.availableBalance / Math.max(portfolio.totalEquity, 1)) * 100).toFixed(0)}% free`}
      />
      <PerfCard
        label="Daily PnL"
        value={formatUSD(portfolio.dailyPnl)}
        sub={formatPercent(portfolio.dailyPnlPercent)}
        color={pnlColor(portfolio.dailyPnl)}
        trend={portfolio.dailyPnl > 0 ? 'up' : portfolio.dailyPnl < 0 ? 'down' : 'neutral'}
      />
      <PerfCard
        label="Unrealized PnL"
        value={formatUSD(portfolio.unrealizedPnl ?? 0)}
        sub={
          portfolio.openPositions.length > 0
            ? `${portfolio.openPositions.length} open`
            : 'no positions'
        }
        color={pnlColor(portfolio.unrealizedPnl ?? 0)}
        trend={
          (portfolio.unrealizedPnl ?? 0) > 0
            ? 'up'
            : (portfolio.unrealizedPnl ?? 0) < 0
            ? 'down'
            : 'neutral'
        }
      />
      <PerfCard
        label="Weekly PnL"
        value={formatUSD(portfolio.weeklyPnl ?? 0)}
        sub={`${portfolio.dailyTradeCount} trades today`}
        color={pnlColor(portfolio.weeklyPnl ?? 0)}
        trend={(portfolio.weeklyPnl ?? 0) >= 0 ? 'up' : 'down'}
      />
    </div>
  );
}
