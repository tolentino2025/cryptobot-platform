'use client';

import { useMemo } from 'react';
import { Card, CardHeader, MetricRow, KpiBlock, DS } from './ui';
import { fmt } from '@/lib/fmt';

type Lifecycle = Record<string, unknown>;

interface Portfolio {
  totalEquity:       number;
  dailyPnl:          number;
  dailyPnlPercent:   number;
  weeklyPnl:         number;
  totalRealizedPnl:  number;
  unrealizedPnl:     number;
  dailyTradeCount:   number;
}

interface Props {
  portfolio:  Portfolio;
  lifecycles: Lifecycle[];
}

function asNum(v: unknown): number | undefined {
  return typeof v === 'number' && isFinite(v) ? v : undefined;
}

// ─── Mini equity curve (SVG) ──────────────────────────────────────
function EquityCurve({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return null;
  const w = 100;
  const h = 40;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const pts = points.map((v, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const area = `0,${h} ${pts.join(' ')} ${w},${h}`;
  const gradId = `ec-${color.replace('#', '')}`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: 48 }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0"   />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradId})`} />
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Win/Loss bar ────────────────────────────────────────────────
function WinLossBar({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses;
  if (total === 0) return null;
  const winPct = (wins / total) * 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px]" style={{ fontFamily: DS.mono }}>
        <span style={{ color: DS.profit }}>{wins}W</span>
        <span style={{ color: DS.textSec }}>
          Win Rate: <strong style={{ color: winPct >= 50 ? DS.profit : DS.warning }}>
            {fmt.pct(winPct, 1)}
          </strong>
        </span>
        <span style={{ color: DS.loss }}>{losses}L</span>
      </div>
      <div
        className="h-2 rounded-full overflow-hidden flex"
        style={{ background: DS.border }}
      >
        <div
          style={{
            width: `${winPct}%`,
            background: DS.profit,
            boxShadow: `0 0 4px ${DS.profit}50`,
          }}
        />
        <div style={{ flex: 1, background: DS.loss, opacity: 0.6 }} />
      </div>
    </div>
  );
}

export function PerformanceCard({ portfolio, lifecycles }: Props) {
  const {
    wins, losses, avgWin, avgLoss, profitFactor,
    totalFees, equityPoints,
  } = useMemo(() => {
    // Only count CLOSED trades (realizedPnl != null)
    const closed = lifecycles.filter((lc) => lc.realizedPnl != null);
    const w = closed.filter((lc) => (asNum(lc.realizedPnl) ?? 0) > 0);
    const l = closed.filter((lc) => (asNum(lc.realizedPnl) ?? 0) <= 0);

    const fees = closed.reduce((s, lc) => s + (asNum(lc.feesTotal) ?? 0), 0);

    const avgW = w.length > 0
      ? w.reduce((s, lc) => s + (asNum(lc.realizedPnl) ?? 0), 0) / w.length
      : null;
    const avgL = l.length > 0
      ? Math.abs(l.reduce((s, lc) => s + (asNum(lc.realizedPnl) ?? 0), 0) / l.length)
      : null;

    // Profit factor: only valid when we have both wins and losses
    const grossWin  = avgW != null ? avgW * w.length : 0;
    const grossLoss = avgL != null && avgL > 0 ? avgL * l.length : 0;
    const pf = w.length > 0 && l.length > 0 && grossLoss > 0
      ? grossWin / grossLoss
      : null;

    // Build equity curve from cumulative realized PnL
    const sorted = [...closed].sort(
      (a, b) => new Date(a.createdAt as string).getTime() - new Date(b.createdAt as string).getTime(),
    );
    let cum = portfolio.totalEquity - portfolio.totalRealizedPnl;
    const pts = [cum];
    for (const lc of sorted) {
      cum += asNum(lc.realizedPnl) ?? 0;
      pts.push(cum);
    }

    // Fallback: synthetic intraday curve from dailyPnl
    const finalPoints = pts.length >= 3 ? pts : (() => {
      const d = portfolio.dailyPnl;
      const e = portfolio.totalEquity;
      return [e - d, e - d * 0.7, e - d * 0.4, e - d * 0.15, e];
    })();

    return {
      wins: w.length, losses: l.length, avgWin: avgW, avgLoss: avgL,
      profitFactor: pf, totalFees: fees, equityPoints: finalPoints,
    };
  }, [lifecycles, portfolio]);

  const dailyColor   = portfolio.dailyPnl  >= 0 ? DS.profit : DS.loss;
  const weeklyColor  = portfolio.weeklyPnl >= 0 ? DS.profit : DS.loss;
  const totalColor   = portfolio.totalRealizedPnl >= 0 ? DS.profit : DS.loss;
  const chartColor   = portfolio.dailyPnl >= 0 ? DS.profit : DS.loss;

  // Only show win/loss if we have closed trades
  const hasClosedTrades = wins + losses > 0;

  return (
    <Card accent={DS.info}>
      <CardHeader
        title="Performance"
        accent={DS.info}
        subtitle={`${new Date().toLocaleDateString()} — ${new Date().toLocaleTimeString()}`}
      />

      <div className="p-5 space-y-4">
        {/* KPI hero row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiBlock
            label="Equity"
            value={fmt.usd(portfolio.totalEquity)}
          />
          <KpiBlock
            label="Daily PnL"
            value={fmt.usd(portfolio.dailyPnl)}
            sub={`${portfolio.dailyPnl >= 0 ? '+' : ''}${fmt.pct(portfolio.dailyPnlPercent, 2)}`}
            color={dailyColor}
          />
          <KpiBlock
            label="Weekly PnL"
            value={fmt.usd(portfolio.weeklyPnl)}
            color={weeklyColor}
          />
          <KpiBlock
            label="Realized PnL"
            value={fmt.usd(portfolio.totalRealizedPnl)}
            color={totalColor}
          />
        </div>

        {/* Equity curve */}
        <div>
          <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: DS.textMuted }}>
            Equity Curve {equityPoints.length < 4 ? '(estimated — awaiting trade data)' : ''}
          </div>
          <div
            className="rounded-lg overflow-hidden"
            style={{ background: DS.elevated, border: `1px solid ${DS.border}` }}
          >
            <EquityCurve points={equityPoints} color={chartColor} />
          </div>
        </div>

        {/* Win/Loss */}
        {hasClosedTrades ? (
          <WinLossBar wins={wins} losses={losses} />
        ) : (
          <div className="text-xs py-1" style={{ color: DS.textMuted }}>
            Win/loss data unavailable — no closed trades in current session
          </div>
        )}

        {/* Metrics */}
        <div>
          <MetricRow
            label="Trades (session)"
            value={String(portfolio.dailyTradeCount)}
            valueColor={DS.text}
          />
          <MetricRow
            label="Closed Trades"
            value={hasClosedTrades ? String(wins + losses) : 'None yet'}
            valueColor={hasClosedTrades ? DS.text : DS.textMuted}
          />
          <MetricRow
            label="Avg Win"
            value={avgWin != null ? fmt.usd(avgWin) : 'No wins yet'}
            valueColor={avgWin != null ? DS.profit : DS.textMuted}
          />
          <MetricRow
            label="Avg Loss"
            value={avgLoss != null ? fmt.usd(avgLoss) : 'No losses yet'}
            valueColor={avgLoss != null ? DS.loss : DS.textMuted}
          />
          <MetricRow
            label="Profit Factor"
            value={profitFactor != null ? fmt.num(profitFactor, 2) : 'Insufficient data'}
            valueColor={
              profitFactor == null ? DS.textMuted :
              profitFactor >= 1.5 ? DS.profit :
              profitFactor >= 1.0 ? DS.warning :
              DS.loss
            }
          />
          <MetricRow
            label="Unrealized PnL"
            value={fmt.usd(portfolio.unrealizedPnl)}
            valueColor={portfolio.unrealizedPnl >= 0 ? DS.profit : DS.loss}
          />
          <MetricRow
            label="Total Fees"
            value={totalFees > 0 ? fmt.usd(totalFees) : '—'}
            valueColor={DS.warning}
            bordered={false}
          />
        </div>
      </div>
    </Card>
  );
}
