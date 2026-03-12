'use client';

import { useMemo } from 'react';
import { formatUSD, formatPercent, formatNumber } from '@/lib/utils';
import { AreaChart, T } from './charts';

// ─────────────────────────────────────────────────────────────────
// Stat chip — compact KPI tile
// ─────────────────────────────────────────────────────────────────
function StatChip({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color?: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2 border border-[#1E2A35] rounded-lg bg-[#0E1520]">
      <span className="text-[9px] font-semibold uppercase tracking-[0.12em]" style={{ color: T.neutral }}>
        {label}
      </span>
      <span
        className="text-base font-bold leading-none"
        style={{
          fontFamily: 'JetBrains Mono, monospace',
          color: color ?? T.text,
          textShadow: color ? `0 0 8px ${color}60` : undefined,
        }}
      >
        {value}
      </span>
      {sub && (
        <span className="text-[9px]" style={{ fontFamily: 'JetBrains Mono, monospace', color: T.neutral }}>
          {sub}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Win/Loss mini bar row
// ─────────────────────────────────────────────────────────────────
function WinLossBar({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses;
  if (total === 0) return <span style={{ color: T.neutral, fontSize: 11 }}>No trades yet</span>;
  const winPct = (wins / total) * 100;
  return (
    <div className="flex items-center gap-2 w-full">
      <span style={{ fontFamily: 'JetBrains Mono, monospace', color: T.profit, fontSize: 10 }}>
        {wins}W
      </span>
      <div className="flex-1 flex h-2 rounded-full overflow-hidden gap-px">
        <div style={{ width: `${winPct}%`, background: T.profit, boxShadow: `0 0 4px ${T.profit}50` }} />
        <div style={{ flex: 1, background: T.loss, boxShadow: `0 0 4px ${T.loss}50` }} />
      </div>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', color: T.loss, fontSize: 10 }}>
        {losses}L
      </span>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', color: T.neutral, fontSize: 10 }}>
        {winPct.toFixed(0)}%
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Panel
// ─────────────────────────────────────────────────────────────────

interface Props {
  portfolio: {
    totalEquity: number;
    dailyPnl: number;
    dailyPnlPercent: number;
    weeklyPnl: number;
    totalRealizedPnl: number;
    unrealizedPnl: number;
    dailyTradeCount: number;
  };
  lifecycles: Record<string, unknown>[];
}

export function PanelPerformance({ portfolio, lifecycles }: Props) {
  const { wins, losses, totalFees, avgWin, avgLoss, equityPoints } = useMemo(() => {
    const closed  = lifecycles.filter((lc) => lc.realizedPnl != null);
    const w       = closed.filter((lc) => (lc.realizedPnl as number) > 0);
    const l       = closed.filter((lc) => (lc.realizedPnl as number) <= 0);
    const fees    = closed.reduce((s, lc) => s + ((lc.feesTotal as number) ?? 0), 0);
    const avgW    = w.length > 0 ? w.reduce((s, lc) => s + (lc.realizedPnl as number), 0) / w.length : 0;
    const avgL    = l.length > 0 ? Math.abs(l.reduce((s, lc) => s + (lc.realizedPnl as number), 0) / l.length) : 0;

    // Build equity curve from cumulative PnL
    const sorted = [...closed].sort(
      (a, b) => new Date(a.createdAt as string).getTime() - new Date(b.createdAt as string).getTime(),
    );
    let cum = portfolio.totalEquity - portfolio.totalRealizedPnl;
    const pts: number[] = [cum];
    for (const lc of sorted) {
      cum += lc.realizedPnl as number;
      pts.push(cum);
    }
    // If fewer than 5 points, pad with synthetic intraday curve
    if (pts.length < 5) {
      const d = portfolio.dailyPnl;
      const e = portfolio.totalEquity;
      return {
        wins: w.length, losses: l.length, totalFees: fees, avgWin: avgW, avgLoss: avgL,
        equityPoints: [e - d, e - d * 0.7, e - d * 0.4, e - d * 0.15, e],
      };
    }
    return { wins: w.length, losses: l.length, totalFees: fees, avgWin: avgW, avgLoss: avgL, equityPoints: pts };
  }, [lifecycles, portfolio]);

  const dailyColor  = portfolio.dailyPnl  >= 0 ? T.profit : T.loss;
  const weeklyColor = portfolio.weeklyPnl >= 0 ? T.profit : T.loss;
  const totalColor  = portfolio.totalRealizedPnl >= 0 ? T.profit : T.loss;

  // Profit factor (gross profit / gross loss)
  const grossWin  = wins  > 0 ? avgWin  * wins  : 0;
  const grossLoss = losses > 0 ? avgLoss * losses : 1;
  const pf = grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : '—';

  const chartColor = portfolio.dailyPnl >= 0 ? T.profit : T.loss;

  return (
    <div className="flex flex-col h-full gap-2 p-3">
      {/* Panel label */}
      <div className="flex items-center justify-between flex-shrink-0">
        <span className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: T.info }}>
          ▸ PERFORMANCE
        </span>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', color: T.neutral, fontSize: 9 }}>
          {new Date().toLocaleTimeString()}
        </span>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-1.5 flex-shrink-0">
        <StatChip label="Equity"    value={formatUSD(portfolio.totalEquity)} />
        <StatChip label="Daily PnL" value={formatUSD(portfolio.dailyPnl)}
          sub={formatPercent(portfolio.dailyPnlPercent)} color={dailyColor} />
        <StatChip label="Weekly"    value={formatUSD(portfolio.weeklyPnl)} color={weeklyColor} />
        <StatChip label="Realized"  value={formatUSD(portfolio.totalRealizedPnl)} color={totalColor} />
      </div>

      {/* Equity curve */}
      <div className="flex-1 min-h-0 flex flex-col">
        <span className="text-[8px] uppercase tracking-widest mb-1" style={{ color: T.neutral }}>
          Equity Curve
        </span>
        <div className="flex-1 min-h-0 relative">
          <AreaChart
            data={equityPoints}
            width={300}
            height={72}
            color={chartColor}
            formatLabel={(v) => `$${(v / 1000).toFixed(1)}k`}
          />
        </div>
      </div>

      {/* Bottom stats row */}
      <div className="grid grid-cols-3 gap-1.5 flex-shrink-0">
        <div className="flex flex-col gap-0.5 px-2 py-1.5 border border-[#1E2A35] rounded-lg bg-[#0E1520]">
          <span className="text-[8px] uppercase tracking-wider" style={{ color: T.neutral }}>Trades</span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', color: T.text, fontSize: 13, fontWeight: 700 }}>
            {portfolio.dailyTradeCount}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 px-2 py-1.5 border border-[#1E2A35] rounded-lg bg-[#0E1520]">
          <span className="text-[8px] uppercase tracking-wider" style={{ color: T.neutral }}>Profit Factor</span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', color: T.info, fontSize: 13, fontWeight: 700 }}>
            {pf}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 px-2 py-1.5 border border-[#1E2A35] rounded-lg bg-[#0E1520]">
          <span className="text-[8px] uppercase tracking-wider" style={{ color: T.neutral }}>Avg Win</span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', color: T.profit, fontSize: 13, fontWeight: 700 }}>
            {avgWin > 0 ? formatUSD(avgWin) : '—'}
          </span>
        </div>
      </div>

      {/* Win/Loss bar */}
      <div className="flex-shrink-0">
        <span className="text-[8px] uppercase tracking-widest block mb-1" style={{ color: T.neutral }}>
          Win / Loss Ratio
        </span>
        <WinLossBar wins={wins} losses={losses} />
      </div>

      {/* Fees */}
      <div className="flex items-center justify-between flex-shrink-0 px-1">
        <span style={{ color: T.neutral, fontSize: 9 }}>Total fees paid</span>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', color: T.warning, fontSize: 9 }}>
          {formatUSD(totalFees)}
        </span>
      </div>
    </div>
  );
}
