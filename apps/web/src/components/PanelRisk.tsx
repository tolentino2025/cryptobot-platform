'use client';

import { formatUSD, formatNumber } from '@/lib/utils';
import { SemiGauge, ProgressTrack, T } from './charts';

// ─────────────────────────────────────────────────────────────────
// Risk row item
// ─────────────────────────────────────────────────────────────────
function RiskRow({
  label,
  value,
  max,
  used,
  usedLabel,
  maxLabel,
  barColor,
}: {
  label: string;
  value: number;
  max: number;
  used: number;
  usedLabel: string;
  maxLabel: string;
  barColor: string;
}) {
  const pct = max > 0 ? (used / max) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span style={{ color: T.neutral, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {label}
        </span>
        <div className="flex items-center gap-1.5">
          <span style={{ fontFamily: 'JetBrains Mono, monospace', color: barColor, fontSize: 9, fontWeight: 700 }}>
            {usedLabel}
          </span>
          <span style={{ color: T.dim, fontSize: 9 }}>/</span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', color: T.neutral, fontSize: 9 }}>
            {maxLabel}
          </span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', color: T.neutral, fontSize: 9 }}>
            ({pct.toFixed(0)}%)
          </span>
        </div>
      </div>
      <ProgressTrack value={used} max={max} color={barColor} height={3} />
    </div>
  );
}

interface Props {
  portfolio: {
    consecutiveLosses: number;
    dailyTradeCount: number;
    totalExposure: number;
  };
  riskLimits: {
    maxDailyLoss: number;
    dailyLossRemaining: number | null;
    [key: string]: unknown;
  } | null;
}

type RiskLevel = 'SAFE' | 'CAUTION' | 'CRITICAL';

export function PanelRisk({ portfolio, riskLimits }: Props) {
  const maxLoss    = riskLimits?.maxDailyLoss ?? 0;
  const remaining  = riskLimits?.dailyLossRemaining ?? maxLoss;
  const usedLoss   = maxLoss - remaining;
  const lossPct    = maxLoss > 0 ? usedLoss / maxLoss : 0;

  const maxConsec  = (riskLimits?.maxConsecutiveLosses as number) ?? 3;
  const consec     = portfolio.consecutiveLosses;
  const consecPct  = maxConsec > 0 ? consec / maxConsec : 0;

  const maxPos     = (riskLimits?.maxPositionNotional as number) ?? 0;
  const exposure   = portfolio.totalExposure ?? 0;
  const exposurePct = maxPos > 0 ? exposure / maxPos : 0;

  // Overall risk score (0-1)
  const riskScore = Math.max(lossPct, consecPct, exposurePct);

  let level: RiskLevel;
  let levelColor: string;
  let gaugeColor: string;
  if (riskScore >= 0.8 || consec >= maxConsec) {
    level = 'CRITICAL'; levelColor = T.loss; gaugeColor = T.loss;
  } else if (riskScore >= 0.5 || consec >= maxConsec - 1) {
    level = 'CAUTION'; levelColor = T.warning; gaugeColor = T.warning;
  } else {
    level = 'SAFE'; levelColor = T.profit; gaugeColor = T.profit;
  }

  const lossBar  = lossPct   >= 0.75 ? T.loss : lossPct   >= 0.5 ? T.warning : T.profit;
  const consecBar = consecPct >= 0.75 ? T.loss : consecPct >= 0.5 ? T.warning : T.profit;
  const expBar   = exposurePct >= 0.75 ? T.loss : exposurePct >= 0.5 ? T.warning : T.info;

  const maxTrades = (riskLimits?.maxTradesPerHour as number) ?? 20;

  return (
    <div className="flex flex-col h-full gap-2 p-3">
      {/* Panel label */}
      <div className="flex items-center justify-between flex-shrink-0">
        <span className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: T.warning }}>
          ▸ RISK CONTROL
        </span>
        <span
          className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border"
          style={{
            color: levelColor,
            borderColor: `${levelColor}40`,
            background: `${levelColor}10`,
            textShadow: `0 0 6px ${levelColor}`,
          }}
        >
          {level}
        </span>
      </div>

      {/* Semicircular risk gauge */}
      <div className="flex items-center justify-center flex-shrink-0 py-1">
        <SemiGauge
          value={usedLoss}
          max={maxLoss}
          color={gaugeColor}
          size={130}
          label="RISK USED"
          sublabel={maxLoss > 0 ? `${formatUSD(remaining)} left` : 'unlimited'}
        />
      </div>

      {/* Risk rows */}
      <div className="flex-1 space-y-3 min-h-0 overflow-auto">
        <RiskRow
          label="Daily Loss"
          value={lossPct}
          max={1}
          used={usedLoss}
          usedLabel={formatUSD(usedLoss)}
          maxLabel={formatUSD(maxLoss)}
          barColor={lossBar}
        />
        <RiskRow
          label="Consecutive Losses"
          value={consecPct}
          max={1}
          used={consec}
          usedLabel={String(consec)}
          maxLabel={String(maxConsec)}
          barColor={consecBar}
        />
        {maxPos > 0 && (
          <RiskRow
            label="Position Exposure"
            value={exposurePct}
            max={1}
            used={exposure}
            usedLabel={formatUSD(exposure)}
            maxLabel={formatUSD(maxPos)}
            barColor={expBar}
          />
        )}
        <RiskRow
          label="Trades / Hour"
          value={portfolio.dailyTradeCount / Math.max(1, maxTrades)}
          max={1}
          used={portfolio.dailyTradeCount}
          usedLabel={String(portfolio.dailyTradeCount)}
          maxLabel={String(maxTrades)}
          barColor={T.info}
        />
      </div>

      {/* Bottom stat row */}
      <div className="grid grid-cols-3 gap-1 flex-shrink-0">
        {[
          { label: 'Max Loss',   value: formatUSD(maxLoss),   color: T.loss   },
          { label: 'Remaining',  value: formatUSD(remaining),  color: T.profit },
          { label: 'Consec. L',  value: `${consec}/${maxConsec}`, color: consecPct >= 0.75 ? T.loss : T.warning },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex flex-col gap-0.5 px-2 py-1.5 rounded-lg border border-[#1E2A35] bg-[#0E1520]">
            <span style={{ color: T.neutral, fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {label}
            </span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', color, fontSize: 10, fontWeight: 700 }}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
