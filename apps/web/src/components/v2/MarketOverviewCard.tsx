'use client';

import { Card, CardHeader, MetricRow, Badge, EmptyState, DS } from './ui';
import { fmt } from '@/lib/fmt';

// Regime configuration: color + description + bias
const REGIME_CFG: Record<string, { color: string; desc: string; bias: string }> = {
  TRENDING:   { color: DS.profit,  desc: 'Sustained directional momentum',        bias: 'Trend-following' },
  BULLISH:    { color: DS.profit,  desc: 'Bullish momentum confirmed',             bias: 'Long bias' },
  BEARISH:    { color: DS.loss,    desc: 'Bearish momentum confirmed',             bias: 'Short bias' },
  VOLATILE:   { color: DS.loss,    desc: 'High volatility — elevated risk',        bias: 'Neutral / cautious' },
  RANGING:    { color: DS.warning, desc: 'Price consolidating in range',           bias: 'Mean-reversion' },
  CHOPPY:     { color: DS.warning, desc: 'Indecisive structure — low conviction',  bias: 'Avoid directional' },
  BREAKOUT:   { color: DS.info,    desc: 'Breaking from consolidation',            bias: 'Momentum entry' },
  REVERSAL:   { color: DS.purple,  desc: 'Potential trend reversal forming',       bias: 'Counter-trend' },
  SIDEWAYS:   { color: DS.warning, desc: 'Range-bound action',                    bias: 'Range trade' },
  NEUTRAL:    { color: DS.textSec, desc: 'No clear regime signal',                bias: 'Wait & observe' },
  HOLD:       { color: DS.textSec, desc: 'No clear signal — AI recommends hold',  bias: 'Flat' },
};

interface Props {
  latestDecision: Record<string, unknown> | null;
}

// Safely extract a deeply nested unknown value as number
function asNum(v: unknown): number | undefined {
  if (typeof v === 'number' && isFinite(v)) return v;
  return undefined;
}
function asStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v;
  return undefined;
}

export function MarketOverviewCard({ latestDecision }: Props) {
  const regime =
    asStr(latestDecision?.regime) ??
    null;

  // Extract market data from flattened overview payload
  const summary = latestDecision?.inputSummary as Record<string, unknown> | null ?? null;
  const rsi          = asNum(summary?.rsi);
  const spreadBps    = asNum(summary?.spreadBps);
  const volumeRatio  = asNum(summary?.volumeRatio);
  const mid          = asNum(summary?.mid);
  const symbol       = asStr(summary?.symbol) ?? 'BTCUSDT';
  const ema12        = asNum(summary?.ema12);
  const ema26        = asNum(summary?.ema26);
  const atr          = asNum(summary?.atrPercent ?? summary?.atr);
  const hasPosition  = Boolean(summary?.hasPosition);

  const regCfg = regime ? (REGIME_CFG[regime.toUpperCase()] ?? REGIME_CFG.NEUTRAL) : null;
  const assessedAt = asStr(latestDecision?.createdAt as string);
  const holdReason = asStr(latestDecision?.holdReason);
  const hasAssessment = Boolean(regime || summary || assessedAt);

  // Derive readable RSI zone
  const rsiZone =
    rsi == null ? null :
    rsi > 70 ? 'Overbought'  :
    rsi > 60 ? 'Neutral-High' :
    rsi < 30 ? 'Oversold'    :
    rsi < 40 ? 'Neutral-Low' :
    'Neutral';
  const rsiColor =
    rsi == null ? DS.textSec :
    rsi > 70 ? DS.loss :
    rsi < 30 ? DS.profit :
    rsi > 60 ? DS.warning :
    DS.text;

  // Spread interpretation
  const spreadLabel =
    spreadBps == null ? null :
    spreadBps > 20 ? 'Wide' :
    spreadBps > 10 ? 'Normal' :
    'Tight';
  const spreadColor =
    spreadBps == null ? DS.textSec :
    spreadBps > 20 ? DS.loss :
    spreadBps > 10 ? DS.warning :
    DS.profit;

  // Volume interpretation
  const volLabel =
    volumeRatio == null ? null :
    volumeRatio > 2  ? 'High surge' :
    volumeRatio > 1.2? 'Above avg'  :
    volumeRatio < 0.5? 'Low'        :
    'Average';
  const volColor =
    volumeRatio == null ? DS.textSec :
    volumeRatio > 1.5 ? DS.profit :
    volumeRatio < 0.5 ? DS.warning :
    DS.text;

  // EMA trend
  const emaTrend =
    ema12 != null && ema26 != null
      ? ema12 > ema26 ? 'Bullish (EMA12 > EMA26)' : 'Bearish (EMA12 < EMA26)'
      : null;
  const emaColor =
    ema12 != null && ema26 != null
      ? ema12 > ema26 ? DS.profit : DS.loss
      : DS.textSec;

  return (
    <Card accent={regCfg?.color ?? DS.info}>
      <CardHeader
        title="Market Overview"
        accent={regCfg?.color ?? DS.info}
        subtitle={assessedAt ? `Last assessment ${fmt.ago(assessedAt)}` : undefined}
        right={
          <span className="text-xs font-semibold" style={{ color: DS.textSec, fontFamily: DS.mono }}>
            {symbol}
          </span>
        }
      />

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Mid', value: mid != null ? fmt.usd(mid, 2) : '—', color: DS.text },
            { label: 'RSI', value: rsi != null ? fmt.num(rsi, 1) : '—', color: rsiColor },
            { label: 'Spread', value: spreadBps != null ? `${fmt.num(spreadBps, 2)} bps` : '—', color: spreadColor },
            { label: 'Volume', value: volumeRatio != null ? `${fmt.num(volumeRatio, 2)}x` : '—', color: volColor },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl p-3"
              style={{ background: DS.elevated, border: `1px solid ${DS.border}` }}
            >
              <div className="text-[9px] uppercase tracking-[0.16em]" style={{ color: DS.textMuted }}>
                {item.label}
              </div>
              <div className="mt-1 text-base font-bold" style={{ color: item.color, fontFamily: DS.mono }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>

        {/* Regime badge — hero element */}
        {regCfg && regime ? (
          <div
            className="rounded-xl p-4 flex flex-col gap-1.5"
            style={{
              background: `linear-gradient(135deg, ${regCfg.color}12, rgba(255,255,255,0.01))`,
              border: `1px solid ${regCfg.color}20`,
            }}
          >
            <div className="flex items-center justify-between">
              <span
                className="text-lg font-bold tracking-widest uppercase"
                style={{
                  color: regCfg.color,
                  fontFamily: DS.mono,
                  textShadow: `0 0 16px ${regCfg.color}40`,
                }}
              >
                {regime}
              </span>
              <div className="flex items-center gap-2">
                {hasPosition && (
                  <span
                    className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded"
                    style={{ color: DS.info, background: DS.infoBg, border: `1px solid ${DS.infoBorder}` }}
                  >
                    Positioned
                  </span>
                )}
                <Badge label={regCfg.bias} color={regCfg.color} size="xs" />
              </div>
            </div>
            <div className="text-xs" style={{ color: DS.textSec }}>
              {regCfg.desc}
            </div>
            {holdReason && (
              <div className="text-xs mt-1" style={{ color: DS.textMuted }}>
                {holdReason}
              </div>
            )}
          </div>
        ) : hasAssessment ? (
          <div
            className="rounded-lg p-4"
            style={{ background: DS.elevated, border: `1px solid ${DS.border}` }}
          >
            <div className="text-sm font-medium" style={{ color: DS.textSec }}>
              Assessment received, but regime details are incomplete
            </div>
            <div className="text-xs mt-1" style={{ color: DS.textMuted }}>
              {holdReason ?? 'The backend returned a partial market assessment payload.'}
            </div>
          </div>
        ) : (
          <div
            className="rounded-lg p-4"
            style={{ background: DS.elevated, border: `1px solid ${DS.border}` }}
          >
            <div className="text-sm font-medium" style={{ color: DS.textSec }}>
              No current market assessment available
            </div>
            <div className="text-xs mt-1" style={{ color: DS.textMuted }}>
              Waiting for first AI evaluation cycle
            </div>
          </div>
        )}

        {/* Market metrics */}
        <div className="space-y-0">
          {rsi != null && (
            <MetricRow
              label={`RSI (14) — ${rsiZone}`}
              value={fmt.num(rsi, 1)}
              valueColor={rsiColor}
            />
          )}
          {spreadBps != null && (
            <MetricRow
              label={`Spread — ${spreadLabel}`}
              value={`${fmt.num(spreadBps, 1)} bps`}
              valueColor={spreadColor}
            />
          )}
          {volumeRatio != null && (
            <MetricRow
              label={`Volume Ratio — ${volLabel}`}
              value={`${fmt.num(volumeRatio, 2)}×`}
              valueColor={volColor}
            />
          )}
          {emaTrend != null && (
            <MetricRow
              label="EMA Trend"
              value={emaTrend}
              valueColor={emaColor}
            />
          )}
          {atr != null && (
            <MetricRow
              label="ATR Volatility"
              value={`${fmt.num(atr * 100, 2)}%`}
              valueColor={atr > 0.02 ? DS.loss : atr > 0.01 ? DS.warning : DS.profit}
            />
          )}
          {assessedAt && (
            <MetricRow
              label="Last Assessment"
              value={fmt.time(assessedAt)}
              valueColor={DS.textSec}
              bordered={false}
            />
          )}
        </div>
      </div>
    </Card>
  );
}
