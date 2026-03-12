'use client';

import { Card, CardHeader, ProgressMetric, Badge, DS } from './ui';
import { fmt } from '@/lib/fmt';

interface RiskLimits {
  maxDailyLoss:       number;
  dailyLossRemaining: number | null;
  [key: string]: unknown;
}

interface Portfolio {
  consecutiveLosses: number;
  dailyTradeCount:   number;
  totalExposure:     number;
}

interface Props {
  portfolio:  Portfolio;
  riskLimits: RiskLimits | null;
}

// Overall risk level
type RiskLevel = 'SAFE' | 'CAUTION' | 'CRITICAL';
const LEVEL_CFG: Record<RiskLevel, { color: string; bg: string; border: string }> = {
  SAFE:     { color: DS.profit,  bg: DS.profitBg,  border: DS.profitBorder  },
  CAUTION:  { color: DS.warning, bg: DS.warningBg, border: DS.warningBorder },
  CRITICAL: { color: DS.loss,    bg: DS.lossBg,    border: DS.lossBorder    },
};

export function RiskControlCard({ portfolio, riskLimits }: Props) {
  // ── Daily Loss ────────────────────────────────────────────────
  const maxDailyLoss      = riskLimits?.maxDailyLoss ?? 0;
  const dailyLossRemaining = riskLimits?.dailyLossRemaining ?? maxDailyLoss;
  const dailyLossUsed     = maxDailyLoss - dailyLossRemaining;
  // CORRECT: (used / max) × 100
  const dailyLossPct      = fmt.safePct(dailyLossUsed, maxDailyLoss);

  // ── Consecutive Losses ────────────────────────────────────────
  const maxConsec  = (riskLimits?.maxConsecutiveLosses as number) ?? 3;
  const consec     = portfolio.consecutiveLosses;
  // CORRECT: (consec / maxConsec) × 100
  const consecPct  = fmt.safePct(consec, maxConsec);

  // ── Position Exposure ─────────────────────────────────────────
  const maxExposure  = (riskLimits?.maxPositionNotional as number) ?? 0;
  const exposure     = portfolio.totalExposure ?? 0;
  // CORRECT: (exposure / maxExposure) × 100
  const exposurePct  = fmt.safePct(exposure, maxExposure);

  // ── Trades per Hour ───────────────────────────────────────────
  const maxTrades  = (riskLimits?.maxTradesPerHour as number) ?? 20;
  const trades     = portfolio.dailyTradeCount;
  // CORRECT: (trades / maxTrades) × 100
  const tradesPct  = fmt.safePct(trades, maxTrades);

  // ── Overall risk level ────────────────────────────────────────
  const maxPct = Math.max(
    dailyLossPct ?? 0,
    consecPct ?? 0,
    exposurePct ?? 0,
  );

  let level: RiskLevel;
  if (maxPct >= 80 || consec >= maxConsec) {
    level = 'CRITICAL';
  } else if (maxPct >= 55 || consec >= maxConsec - 1) {
    level = 'CAUTION';
  } else {
    level = 'SAFE';
  }
  const levelCfg = LEVEL_CFG[level];

  // ── Context alerts ────────────────────────────────────────────
  const alerts: string[] = [];
  if (dailyLossPct != null && dailyLossPct >= 80)
    alerts.push('Daily loss limit nearly exhausted');
  else if (dailyLossPct != null && dailyLossPct >= 60)
    alerts.push('Approaching daily loss threshold');
  if (consec >= maxConsec)
    alerts.push(`Max consecutive losses reached (${consec}/${maxConsec})`);
  else if (consec >= maxConsec - 1 && maxConsec > 1)
    alerts.push(`${consec}/${maxConsec} consecutive losses — exercise caution`);
  if (dailyLossPct == null && maxDailyLoss === 0)
    alerts.push('No daily loss limit configured');

  return (
    <Card accent={levelCfg.color}>
      <CardHeader
        title="Risk Control"
        accent={levelCfg.color}
        right={
          <Badge label={level} color={levelCfg.color} size="sm" />
        }
      />

      <div className="p-5 space-y-1">
        {/* Alerts */}
        {alerts.length > 0 && (
          <div
            className="rounded-lg p-3 mb-3 space-y-1"
            style={{ background: levelCfg.bg, border: `1px solid ${levelCfg.border}` }}
          >
            {alerts.map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-xs" style={{ color: levelCfg.color }}>
                <span className="mt-0.5 flex-shrink-0">▸</span>
                <span>{a}</span>
              </div>
            ))}
          </div>
        )}

        {/* Daily Loss */}
        <ProgressMetric
          label="Daily Loss Used"
          pct={dailyLossPct}
          usedLabel={fmt.usd(dailyLossUsed)}
          maxLabel={maxDailyLoss > 0 ? fmt.usd(maxDailyLoss) : 'unlimited'}
          pctLabel={dailyLossPct != null ? `${dailyLossPct.toFixed(1)}%` : 'N/A'}
        />

        {/* Consecutive Losses */}
        <ProgressMetric
          label="Consecutive Losses"
          pct={consecPct}
          usedLabel={String(consec)}
          maxLabel={String(maxConsec)}
          pctLabel={consecPct != null ? `${consecPct.toFixed(1)}%` : 'N/A'}
        />

        {/* Position Exposure */}
        {maxExposure > 0 && (
          <ProgressMetric
            label="Position Exposure"
            pct={exposurePct}
            usedLabel={fmt.usd(exposure)}
            maxLabel={fmt.usd(maxExposure)}
            pctLabel={exposurePct != null ? `${exposurePct.toFixed(1)}%` : 'N/A'}
          />
        )}

        {/* Trades / Hour */}
        <ProgressMetric
          label="Trades this Hour"
          pct={tradesPct}
          usedLabel={String(trades)}
          maxLabel={String(maxTrades)}
          pctLabel={tradesPct != null ? `${tradesPct.toFixed(1)}%` : 'N/A'}
        />

        {/* Summary row */}
        <div
          className="grid grid-cols-3 gap-2 pt-3 mt-1"
          style={{ borderTop: `1px solid ${DS.border}` }}
        >
          {[
            {
              label: 'Max Loss',
              value: maxDailyLoss > 0 ? fmt.usd(maxDailyLoss) : 'Unlimited',
              color: DS.loss,
            },
            {
              label: 'Remaining',
              value: maxDailyLoss > 0 ? fmt.usd(dailyLossRemaining) : '—',
              color: DS.profit,
            },
            {
              label: 'Consec. L',
              value: `${consec} / ${maxConsec}`,
              color: levelCfg.color,
            },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              className="rounded-lg p-2.5 flex flex-col gap-0.5"
              style={{ background: DS.elevated, border: `1px solid ${DS.border}` }}
            >
              <span className="text-[9px] uppercase tracking-wider" style={{ color: DS.textMuted }}>
                {label}
              </span>
              <span
                className="text-xs font-bold"
                style={{ color, fontFamily: DS.mono }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
